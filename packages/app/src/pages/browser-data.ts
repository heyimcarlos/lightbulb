import type { OpencodeClient, Part, Session, SessionStatus, ToolPart } from "@opencode-ai/sdk/v2/client"

export const BROWSER_ACTIONS = ["start", "open", "snapshot", "screenshot", "eval", "execute", "sessions", "stop"]

export type BrowserProvider = "local" | "firecrawl" | "steel" | "unknown"

export type BrowserEvidenceKind =
  | "live_view"
  | "interactive_live_view"
  | "cdp"
  | "artifact_path"
  | "attachment"

export type BrowserEvidence = {
  kind: BrowserEvidenceKind
  label: string
  value: string
}

export type BrowserActivity = {
  id: string
  sessionID: string
  sessionTitle: string
  sessionDirectory: string
  messageID: string
  callID: string
  provider: BrowserProvider
  action: string
  status: ToolPart["state"]["status"]
  url?: string
  browserSessionID?: string
  sessionName?: string
  time?: number
  output?: string
  error?: string
  evidence: BrowserEvidence[]
}

export type BrowserSessionSummary = {
  id: string
  title: string
  directory: string
  status: SessionStatus["type"]
  updated: number
}

export type BrowserSurfaceData = {
  toolAvailable: boolean
  toolIDs: string[]
  sessions: BrowserSessionSummary[]
  activeSessions: BrowserSessionSummary[]
  activities: BrowserActivity[]
  failures: Array<{ sessionID: string; message: string }>
}

type MessageWithParts = {
  info: {
    id: string
    sessionID: string
  }
  parts: Part[]
}

type BrowserSessionSource = Pick<Session, "id" | "title" | "directory" | "time">

type LoadBrowserSurfaceInput = {
  client: OpencodeClient
  directory?: string
  sessionLimit?: number
  messageLimit?: number
}

export async function loadBrowserSurface(input: LoadBrowserSurfaceInput): Promise<BrowserSurfaceData> {
  const query = input.directory ? { directory: input.directory } : undefined
  const [toolIDs, status, sessions] = await Promise.all([
    input.client.tool.ids(query).then((response) => response.data ?? []),
    input.client.session.status(query).then((response) => response.data ?? {}),
    input.client.experimental.session
      .list({ ...query, roots: true, limit: input.sessionLimit ?? 10 })
      .then((response) => response.data ?? []),
  ])
  const sessionList = sessions.filter((session) => !!session.id)
  const loaded = await Promise.allSettled(
    sessionList.map((session) =>
      input.client.session
        .messages({
          sessionID: session.id,
          directory: session.directory || input.directory,
          limit: input.messageLimit ?? 80,
        })
        .then((response) => ({ session, messages: response.data ?? [] })),
    ),
  )

  const summaries = sessionList.map((session) => browserSessionSummary(session, status[session.id]))
  const failures = loaded
    .filter((result): result is PromiseRejectedResult => result.status === "rejected")
    .map((result) => ({
      sessionID: "unknown",
      message: result.reason instanceof Error ? result.reason.message : String(result.reason),
    }))

  return {
    toolAvailable: toolIDs.includes("browser"),
    toolIDs,
    sessions: summaries,
    activeSessions: summaries.filter((session) => session.status !== "idle"),
    activities: loaded
      .flatMap((result) => {
        if (result.status !== "fulfilled") return []
        return browserActivitiesFromMessages(result.value.session, result.value.messages)
      })
      .sort((a, b) => (b.time ?? 0) - (a.time ?? 0)),
    failures,
  }
}

export function browserActivitiesFromMessages(
  session: BrowserSessionSource,
  messages: MessageWithParts[],
): BrowserActivity[] {
  return messages.flatMap((message) =>
    message.parts
      .map((part) => browserActivityFromPart(session, message.info.id, part))
      .filter((activity): activity is BrowserActivity => activity !== undefined),
  )
}

export function browserActivityFromPart(
  session: BrowserSessionSource,
  messageID: string,
  part: Part,
): BrowserActivity | undefined {
  if (part.type !== "tool" || part.tool !== "browser") return
  const input = part.state.input
  const output = part.state.status === "completed" ? part.state.output : undefined
  const metadata = "metadata" in part.state ? part.state.metadata : undefined
  const action = stringField(input, "action") ?? "browser"
  const provider = providerField(input)
  const evidence = browserEvidence({
    action,
    input,
    metadata,
    output,
    attachments: part.state.status === "completed" ? part.state.attachments : undefined,
  })

  return {
    id: part.id,
    sessionID: session.id,
    sessionTitle: session.title,
    sessionDirectory: session.directory,
    messageID,
    callID: part.callID,
    provider,
    action,
    status: part.state.status,
    url: stringField(input, "url"),
    browserSessionID: stringField(input, "sessionID") ?? stringField(metadata, "sessionID"),
    sessionName: stringField(input, "sessionName"),
    time: partTime(part),
    output,
    error: part.state.status === "error" ? part.state.error : undefined,
    evidence,
  } satisfies BrowserActivity
}

export function browserEvidence(input: {
  action: string
  input: Record<string, unknown>
  metadata?: Record<string, unknown>
  output?: string
  attachments?: Array<{ filename?: string; url: string; mime: string }>
}) {
  return uniqueEvidence([
    ...evidenceFromOutput(input.output),
    ...evidenceFromRecord(input.metadata),
    ...(input.action === "screenshot"
      ? evidenceValue("artifact_path", "Artifact path", stringField(input.input, "path"))
      : []),
    ...(input.attachments ?? []).map((attachment) => ({
      kind: "attachment" as const,
      label: attachment.filename ?? attachment.mime,
      value: attachment.url,
    })),
  ])
}

export function browserProviderSummaries(activities: BrowserActivity[]) {
  return (["local", "firecrawl", "steel"] as const).map((provider) => {
    const providerActivities = activities.filter((activity) => activity.provider === provider)
    return {
      provider,
      activityCount: providerActivities.length,
      evidenceCount: providerActivities.reduce((total, activity) => total + activity.evidence.length, 0),
      liveViewCount: providerActivities.reduce(
        (total, activity) =>
          total +
          activity.evidence.filter(
            (evidence) => evidence.kind === "live_view" || evidence.kind === "interactive_live_view",
          ).length,
        0,
      ),
    }
  })
}

function browserSessionSummary(session: BrowserSessionSource, status?: SessionStatus): BrowserSessionSummary {
  return {
    id: session.id,
    title: session.title,
    directory: session.directory,
    status: status?.type ?? "idle",
    updated: session.time.updated,
  }
}

function providerField(input: Record<string, unknown>): BrowserProvider {
  const provider = stringField(input, "provider") ?? "local"
  if (provider === "local" || provider === "firecrawl" || provider === "steel") return provider
  return "unknown"
}

function evidenceFromOutput(output: string | undefined) {
  if (!output) return []
  return output.split("\n").flatMap((line) => {
    const liveViewUrl = line.match(/^Live view:\s*(.+)$/)?.[1]?.trim()
    if (liveViewUrl) return evidenceValue("live_view", "Live view", liveViewUrl)
    const interactiveLiveViewUrl = line.match(/^Interactive live view:\s*(.+)$/)?.[1]?.trim()
    if (interactiveLiveViewUrl) return evidenceValue("interactive_live_view", "Interactive live view", interactiveLiveViewUrl)
    const cdpUrl = line.match(/^CDP:\s*(.+)$/)?.[1]?.trim()
    if (cdpUrl) return evidenceValue("cdp", "CDP", cdpUrl)
    const artifactPath = line.match(/^Artifact:\s*(.+)$/)?.[1]?.trim()
    if (artifactPath) return evidenceValue("artifact_path", "Artifact path", artifactPath)
    return []
  })
}

function evidenceFromRecord(record: Record<string, unknown> | undefined) {
  return [
    ...evidenceValue("live_view", "Live view", stringField(record, "liveViewUrl")),
    ...evidenceValue("interactive_live_view", "Interactive live view", stringField(record, "interactiveLiveViewUrl")),
    ...evidenceValue("cdp", "CDP", stringField(record, "cdpUrl")),
    ...evidenceValue("artifact_path", "Artifact path", stringField(record, "artifactPath")),
  ]
}

function evidenceValue(kind: BrowserEvidenceKind, label: string, value: string | undefined) {
  return value ? [{ kind, label, value }] : []
}

function uniqueEvidence(items: BrowserEvidence[]) {
  const seen = new Set<string>()
  return items.filter((item) => {
    const key = `${item.kind}:\0${item.value}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function stringField(record: Record<string, unknown> | undefined, key: string) {
  const value = record?.[key]
  return typeof value === "string" && value ? value : undefined
}

function partTime(part: ToolPart) {
  if (part.state.status === "completed" || part.state.status === "error") return part.state.time.end
  if (part.state.status === "running") return part.state.time.start
  return undefined
}
