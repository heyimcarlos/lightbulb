import { Option, Schema } from "effect"

const PickupPacketSource = Schema.Struct({
  kind: Schema.Union([Schema.Literal("github_issue"), Schema.Literal("goal_candidate"), Schema.Literal("route_stop")]),
  ref: Schema.String,
  title: Schema.String,
  handle: Schema.optional(Schema.String),
  url: Schema.optional(Schema.String),
  summary: Schema.optional(Schema.String),
  updatedAt: Schema.optional(Schema.Number),
})

const PickupPacketRouteStop = Schema.Struct({
  routeID: Schema.optional(Schema.String),
  stopID: Schema.optional(Schema.String),
  goalID: Schema.optional(Schema.String),
  loopID: Schema.optional(Schema.String),
  runID: Schema.optional(Schema.String),
  name: Schema.optional(Schema.String),
})

const PickupPacketAttemptBudget = Schema.Struct({
  maxAttempts: Schema.Number,
  escalationLabel: Schema.optional(Schema.String),
  escalationRule: Schema.optional(Schema.String),
})

export const PickupPacketSchema = Schema.Struct({
  kind: Schema.Literal("lightbulb.pickup_packet.v1"),
  source: PickupPacketSource,
  scope: Schema.Array(Schema.String),
  nonGoals: Schema.Array(Schema.String),
  blockers: Schema.Array(Schema.String),
  affectedPackages: Schema.Array(Schema.String),
  affectedPaths: Schema.Array(Schema.String),
  acceptanceEvidence: Schema.Array(Schema.String),
  preferredFirstCommand: Schema.String,
  verificationCommands: Schema.Array(Schema.String),
  routeStop: Schema.optional(PickupPacketRouteStop),
  suggestedAction: Schema.optional(Schema.String),
  riskNotes: Schema.optional(Schema.Array(Schema.String)),
  contextHandles: Schema.optional(Schema.Array(Schema.String)),
  artifactHandles: Schema.optional(Schema.Array(Schema.String)),
  skillRefs: Schema.optional(Schema.Array(Schema.String)),
  templateRefs: Schema.optional(Schema.Array(Schema.String)),
  attemptBudget: Schema.optional(PickupPacketAttemptBudget),
  escalationRule: Schema.optional(Schema.String),
})

export type PickupPacket = typeof PickupPacketSchema.Type
export type PickupPacketSourceKind = PickupPacket["source"]["kind"]
export type PickupPacketSourceInput = {
  readonly kind: PickupPacketSourceKind
  readonly ref: string
  readonly title: string
  readonly handle?: string | null
  readonly url?: string | null
  readonly summary?: string | null
  readonly updatedAt?: number | null
}

export type PickupPacketAttemptBudgetInput = {
  readonly maxAttempts: number
  readonly escalationLabel?: string
  readonly escalationRule?: string
}

export type PickupPacketRouteStopInput = {
  readonly routeID?: string | null
  readonly stopID?: string | null
  readonly goalID?: string | null
  readonly loopID?: string | null
  readonly runID?: string | null
  readonly name?: string | null
}

export type CreatePickupPacketInput = {
  readonly source: PickupPacketSourceInput
  readonly scope: readonly string[]
  readonly nonGoals: readonly string[]
  readonly blockers?: readonly string[]
  readonly affectedPackages: readonly string[]
  readonly affectedPaths?: readonly string[]
  readonly acceptanceEvidence: readonly string[]
  readonly preferredFirstCommand: string
  readonly verificationCommands: readonly string[]
  readonly routeStop?: PickupPacketRouteStopInput
  readonly suggestedAction?: string | null
  readonly riskNotes?: readonly string[]
  readonly contextHandles?: readonly string[]
  readonly artifactHandles?: readonly string[]
  readonly skillRefs?: readonly string[]
  readonly templateRefs?: readonly string[]
  readonly attemptBudget?: PickupPacketAttemptBudgetInput
  readonly escalationRule?: string | null
}

export type IssuePickupPacketInput = {
  readonly issueRef: string
  readonly issueHandle?: string | null
  readonly title: string
  readonly url?: string | null
  readonly body?: string | null
  readonly bodyHandle?: string | null
  readonly bodySummary?: string | null
  readonly updatedAt?: number | null
  readonly dependencyRefs?: readonly string[]
  readonly promptHandle?: string | null
  readonly instructionHandle?: string | null
}

export type IssuePickupPacketOptions = {
  readonly scope?: readonly string[]
  readonly nonGoals?: readonly string[]
  readonly blockers?: readonly string[]
  readonly affectedPackages?: readonly string[]
  readonly affectedPaths?: readonly string[]
  readonly acceptanceEvidence?: readonly string[]
  readonly preferredFirstCommand?: string
  readonly verificationCommands?: readonly string[]
  readonly suggestedAction?: string
  readonly riskNotes?: readonly string[]
  readonly contextHandles?: readonly string[]
  readonly artifactHandles?: readonly string[]
  readonly skillRefs?: readonly string[]
  readonly templateRefs?: readonly string[]
  readonly attemptBudget?: PickupPacketAttemptBudgetInput
  readonly escalationRule?: string
}

const decodeJson = Schema.decodeUnknownOption(Schema.UnknownFromJsonString)
const decodePickupPacket = Schema.decodeUnknownOption(PickupPacketSchema, {
  errors: "all",
  onExcessProperty: "ignore",
})

export function createPickupPacket(input: CreatePickupPacketInput): PickupPacket {
  return normalizePickupPacket({
    kind: "lightbulb.pickup_packet.v1",
    source: {
      kind: input.source.kind,
      ref: requiredText(input.source.ref, "source"),
      title: requiredText(input.source.title, "Untitled work item"),
      ...(optionalText(input.source.handle) ? { handle: optionalText(input.source.handle) } : {}),
      ...(optionalText(input.source.url) ? { url: optionalText(input.source.url) } : {}),
      ...(optionalText(input.source.summary) ? { summary: optionalText(input.source.summary) } : {}),
      ...(input.source.updatedAt ? { updatedAt: input.source.updatedAt } : {}),
    },
    scope: requiredList(input.scope, "Complete the bounded work item described by the source handle."),
    nonGoals: requiredList(input.nonGoals, "Do not include raw issue bodies, full comments, logs, or raw child output."),
    blockers: uniqueList(input.blockers ?? []),
    affectedPackages: requiredList(input.affectedPackages, "packages/core"),
    affectedPaths: uniqueList(input.affectedPaths ?? []),
    acceptanceEvidence: requiredList(input.acceptanceEvidence, "Focused package-local verification passes."),
    preferredFirstCommand: requiredText(input.preferredFirstCommand, "cd packages/core && bun typecheck"),
    verificationCommands: requiredList(input.verificationCommands, input.preferredFirstCommand),
    ...(input.routeStop ? { routeStop: normalizeRouteStop(input.routeStop) } : {}),
    ...(optionalText(input.suggestedAction) ? { suggestedAction: optionalText(input.suggestedAction) } : {}),
    ...(optionalList(input.riskNotes) ? { riskNotes: optionalList(input.riskNotes) } : {}),
    ...(optionalList(input.contextHandles) ? { contextHandles: optionalList(input.contextHandles) } : {}),
    ...(optionalList(input.artifactHandles) ? { artifactHandles: optionalList(input.artifactHandles) } : {}),
    ...(optionalList(input.skillRefs) ? { skillRefs: optionalList(input.skillRefs) } : {}),
    ...(optionalList(input.templateRefs) ? { templateRefs: optionalList(input.templateRefs) } : {}),
    ...(input.attemptBudget ? { attemptBudget: normalizeAttemptBudget(input.attemptBudget) } : {}),
    ...(optionalText(input.escalationRule) ? { escalationRule: optionalText(input.escalationRule) } : {}),
  })
}

export function createIssuePickupPacket(input: IssuePickupPacketInput, options?: IssuePickupPacketOptions): PickupPacket {
  const parsed = input.body ? parsePickupPacketSection(input.body, issuePickupPacketSource(input)) : undefined
  if (parsed) return parsed
  const preferredFirstCommand = options?.preferredFirstCommand ?? "cd packages/core && bun typecheck"
  return createPickupPacket({
    source: issuePickupPacketSource(input),
    scope: options?.scope ?? ["Pick up " + input.issueRef + ": " + input.title],
    nonGoals: options?.nonGoals ?? ["Do not include raw issue bodies, full comments, logs, or raw child output."],
    blockers: options?.blockers ?? input.dependencyRefs ?? [],
    affectedPackages: options?.affectedPackages ?? ["packages/core"],
    affectedPaths: options?.affectedPaths ?? [],
    acceptanceEvidence: options?.acceptanceEvidence ?? ["Focused package-local verification passes."],
    preferredFirstCommand,
    verificationCommands: options?.verificationCommands ?? [preferredFirstCommand, "git diff --check"],
    suggestedAction:
      options?.suggestedAction ?? "Implement the bounded Lightbulb slice and return a concise worker report with artifact handles.",
    riskNotes: options?.riskNotes ?? ["Use compact handles and summaries instead of raw child logs or oversized issue content."],
    contextHandles: uniqueList([
      input.issueHandle ?? "github:issue:" + input.issueRef.replace(/^#/, ""),
      input.promptHandle ?? "",
      input.instructionHandle ?? "",
      input.bodyHandle ?? "",
      ...(options?.contextHandles ?? []),
    ]),
    artifactHandles: options?.artifactHandles,
    skillRefs: options?.skillRefs,
    templateRefs: options?.templateRefs,
    attemptBudget: options?.attemptBudget ?? {
      maxAttempts: 2,
      escalationLabel: "agent-blocked",
      escalationRule: "Mark blocked with failing evidence when the attempt budget is exhausted.",
    },
    escalationRule: options?.escalationRule,
  })
}

export function createGoalCandidatePickupPacket(
  input: {
    readonly goalRef: string
    readonly title: string
    readonly summary?: string | null
    readonly handle?: string | null
  },
  options: Omit<IssuePickupPacketOptions, "blockers"> & { readonly blockers?: readonly string[] },
) {
  return createPickupPacket({
    source: {
      kind: "goal_candidate",
      ref: input.goalRef,
      handle: input.handle,
      title: input.title,
      summary: input.summary,
    },
    scope: options.scope ?? ["Pick up goal candidate " + input.goalRef + ": " + input.title],
    nonGoals: options.nonGoals ?? ["Do not change unrelated goals or route state."],
    blockers: options.blockers ?? [],
    affectedPackages: options.affectedPackages ?? ["packages/core"],
    affectedPaths: options.affectedPaths ?? [],
    acceptanceEvidence: options.acceptanceEvidence ?? ["Goal candidate can be reviewed from compact handles."],
    preferredFirstCommand: options.preferredFirstCommand ?? "cd packages/core && bun typecheck",
    verificationCommands: options.verificationCommands ?? ["cd packages/core && bun typecheck"],
    suggestedAction: options.suggestedAction,
    riskNotes: options.riskNotes,
    contextHandles: options.contextHandles,
    artifactHandles: options.artifactHandles,
    skillRefs: options.skillRefs,
    templateRefs: options.templateRefs,
    attemptBudget: options.attemptBudget,
    escalationRule: options.escalationRule,
  })
}

export function createRouteStopPickupPacket(
  input: {
    readonly routeStop: PickupPacketRouteStopInput
    readonly stopRef: string
    readonly title: string
    readonly summary?: string | null
    readonly handle?: string | null
  },
  options: Omit<IssuePickupPacketOptions, "blockers"> & { readonly blockers?: readonly string[] },
) {
  return createPickupPacket({
    source: {
      kind: "route_stop",
      ref: input.stopRef,
      handle: input.handle,
      title: input.title,
      summary: input.summary,
    },
    scope: options.scope ?? ["Complete route stop " + input.stopRef + ": " + input.title],
    nonGoals: options.nonGoals ?? ["Do not advance gates or mutate route state outside the owning runner."],
    blockers: options.blockers ?? [],
    affectedPackages: options.affectedPackages ?? ["packages/core"],
    affectedPaths: options.affectedPaths ?? [],
    acceptanceEvidence: options.acceptanceEvidence ?? ["Route stop can be dispatched from compact pickup packet fields."],
    preferredFirstCommand: options.preferredFirstCommand ?? "cd packages/core && bun typecheck",
    verificationCommands: options.verificationCommands ?? ["cd packages/core && bun typecheck"],
    routeStop: input.routeStop,
    suggestedAction: options.suggestedAction,
    riskNotes: options.riskNotes,
    contextHandles: options.contextHandles,
    artifactHandles: options.artifactHandles,
    skillRefs: options.skillRefs,
    templateRefs: options.templateRefs,
    attemptBudget: options.attemptBudget,
    escalationRule: options.escalationRule,
  })
}

export function renderPickupPacketSection(packet: PickupPacket) {
  return ["## Pickup packet", "", "```json", JSON.stringify(normalizePickupPacket(packet), null, 2), "```"].join("\n")
}

export function renderPickupPacket(packet: PickupPacket) {
  return renderPickupPacketSection(packet) + "\n"
}

export function parsePickupPacketSection(markdown: string, source?: PickupPacketSourceInput): PickupPacket | undefined {
  const bounds = pickupPacketSectionBounds(markdown)
  if (!bounds) return
  const json = /```json\s*\n([\s\S]*?)\n```/.exec(bounds.section)?.[1]
  if (json) {
    const parsed = Option.getOrUndefined(decodeJson(json))
    if (!parsed) return
    const decoded = Option.getOrUndefined(decodePickupPacket(parsed))
    if (!decoded) return
    return normalizePickupPacket(decoded)
  }
  const scope = lineValue(bounds.section, "Scope")
  const routeStop = lineValue(bounds.section, "Route stop")
  const preferredFirstCommand = lineValue(bounds.section, "Preferred first verification command")
  const verificationCommands = listValue(bounds.section, "Full verification commands")
  const acceptanceEvidence = listValue(bounds.section, "Acceptance evidence")
  if (!scope || !preferredFirstCommand || verificationCommands.length === 0 || acceptanceEvidence.length === 0) return
  return createPickupPacket({
    source: source ?? {
      kind: "github_issue",
      ref: "unknown",
      title: "Unknown pickup packet",
    },
    scope: [scope],
    nonGoals: listValue(bounds.section, "Non-goals"),
    blockers: listValue(bounds.section, "Blockers"),
    affectedPackages: listValue(bounds.section, "Affected packages"),
    affectedPaths: listValue(bounds.section, "Affected paths"),
    acceptanceEvidence,
    preferredFirstCommand,
    verificationCommands,
    routeStop: routeStop ? { name: routeStop } : undefined,
    suggestedAction: lineValue(bounds.section, "Suggested action") ?? lineValue(bounds.section, "Suggested loop action"),
    riskNotes: listValue(bounds.section, "Risk/gates"),
    contextHandles: listValue(bounds.section, "Context handles"),
    artifactHandles: listValue(bounds.section, "Artifact handles"),
    skillRefs: listValue(bounds.section, "Skill refs"),
    templateRefs: listValue(bounds.section, "Template refs"),
    attemptBudget: attemptBudgetValue(lineValue(bounds.section, "Attempt budget")),
  })
}

export function upsertPickupPacketSection(markdown: string, packet: PickupPacket) {
  const section = renderPickupPacketSection(packet) + "\n"
  const bounds = pickupPacketSectionBounds(markdown)
  if (!bounds) {
    const prefix = markdown.trimEnd()
    return (prefix ? prefix + "\n\n" : "") + section
  }
  return markdown.slice(0, bounds.start) + section + markdown.slice(bounds.end).replace(/^\n+/, "\n")
}

export function renderPickupPacketWorkerInstructions(packet: PickupPacket) {
  const normalized = normalizePickupPacket(packet)
  return [
    "Pickup packet source: " + normalized.source.ref,
    "",
    "Scope:",
    ...instructionItems(normalized.scope),
    "",
    "Non-goals:",
    ...instructionItems(normalized.nonGoals),
    "",
    "Blockers:",
    ...instructionItems(normalized.blockers),
    "",
    "Affected packages:",
    ...instructionItems(normalized.affectedPackages),
    "",
    "Affected paths:",
    ...instructionItems(normalized.affectedPaths),
    "",
    "Route stop: " + (normalized.routeStop?.name ?? normalized.routeStop?.stopID ?? "none"),
    "Suggested action: " + (normalized.suggestedAction ?? "none"),
    "",
    "Risk and gates:",
    ...instructionItems(normalized.riskNotes ?? []),
    "",
    "Context handles:",
    ...instructionItems(normalized.contextHandles ?? []),
    "",
    "Artifact handles:",
    ...instructionItems(normalized.artifactHandles ?? []),
    "",
    "Skill refs:",
    ...instructionItems(normalized.skillRefs ?? []),
    "",
    "Template refs:",
    ...instructionItems(normalized.templateRefs ?? []),
    "",
    "Preferred first command: " + normalized.preferredFirstCommand,
    "",
    "Full verification commands:",
    ...instructionItems(normalized.verificationCommands),
    "",
    "Acceptance evidence:",
    ...instructionItems(normalized.acceptanceEvidence),
    "",
    "Attempt budget: " + attemptBudgetSummary(normalized.attemptBudget),
    "",
    "Return only a compact worker report with changed files, verification results, artifact/report paths, risks, and next recommendation.",
  ].join("\n")
}

export function normalizePickupPacket(packet: PickupPacket): PickupPacket {
  return {
    kind: "lightbulb.pickup_packet.v1",
    source: {
      kind: packet.source.kind,
      ref: requiredText(packet.source.ref, "source"),
      title: requiredText(packet.source.title, "Untitled work item"),
      ...(optionalText(packet.source.handle) ? { handle: optionalText(packet.source.handle) } : {}),
      ...(optionalText(packet.source.url) ? { url: optionalText(packet.source.url) } : {}),
      ...(optionalText(packet.source.summary) ? { summary: optionalText(packet.source.summary) } : {}),
      ...(packet.source.updatedAt ? { updatedAt: packet.source.updatedAt } : {}),
    },
    scope: requiredList(packet.scope, "Complete the bounded work item described by the source handle."),
    nonGoals: requiredList(packet.nonGoals, "Do not include raw issue bodies, full comments, logs, or raw child output."),
    blockers: uniqueList(packet.blockers),
    affectedPackages: requiredList(packet.affectedPackages, "packages/core"),
    affectedPaths: uniqueList(packet.affectedPaths),
    acceptanceEvidence: requiredList(packet.acceptanceEvidence, "Focused package-local verification passes."),
    preferredFirstCommand: requiredText(packet.preferredFirstCommand, "cd packages/core && bun typecheck"),
    verificationCommands: requiredList(packet.verificationCommands, packet.preferredFirstCommand),
    ...(packet.routeStop ? { routeStop: normalizeRouteStop(packet.routeStop) } : {}),
    ...(optionalText(packet.suggestedAction) ? { suggestedAction: optionalText(packet.suggestedAction) } : {}),
    ...(optionalList(packet.riskNotes) ? { riskNotes: optionalList(packet.riskNotes) } : {}),
    ...(optionalList(packet.contextHandles) ? { contextHandles: optionalList(packet.contextHandles) } : {}),
    ...(optionalList(packet.artifactHandles) ? { artifactHandles: optionalList(packet.artifactHandles) } : {}),
    ...(optionalList(packet.skillRefs) ? { skillRefs: optionalList(packet.skillRefs) } : {}),
    ...(optionalList(packet.templateRefs) ? { templateRefs: optionalList(packet.templateRefs) } : {}),
    ...(packet.attemptBudget ? { attemptBudget: normalizeAttemptBudget(packet.attemptBudget) } : {}),
    ...(optionalText(packet.escalationRule) ? { escalationRule: optionalText(packet.escalationRule) } : {}),
  }
}

function pickupPacketSectionBounds(markdown: string) {
  const heading = /^## Pickup packet[ \t]*$/m.exec(markdown)
  if (!heading) return
  const start = heading.index
  const afterHeading = start + heading[0].length
  const nextHeading = /\n## [^\n]*/.exec(markdown.slice(afterHeading))
  const end = nextHeading ? afterHeading + nextHeading.index + 1 : markdown.length
  return {
    start,
    end,
    section: markdown.slice(start, end),
  }
}

function issuePickupPacketSource(input: IssuePickupPacketInput) {
  return {
    kind: "github_issue",
    ref: input.issueRef,
    handle: input.issueHandle ?? "github:issue:" + input.issueRef.replace(/^#/, ""),
    title: input.title,
    url: input.url,
    summary: input.bodySummary,
    updatedAt: input.updatedAt,
  } satisfies PickupPacketSourceInput
}

function lineValue(section: string, label: string) {
  const prefix = "- " + label + ":"
  return optionalText(
    cleanInlineValue(
      section
        .split(/\r?\n/)
        .find((line) => line.trimStart().startsWith(prefix))
        ?.trimStart()
        .slice(prefix.length) ?? "",
    ),
  )
}

function listValue(section: string, label: string) {
  const lines = section.split(/\r?\n/)
  const prefix = "- " + label + ":"
  const start = lines.findIndex((line) => line.trimStart().startsWith(prefix))
  if (start < 0) return []
  const inline = cleanInlineValue(lines[start]?.trimStart().slice(prefix.length) ?? "")
  const nested = lines
    .slice(start + 1)
    .reduce(
      (state, line) => {
        if (state.done) return state
        if (/^-\s+[^:]+:/.test(line.trimStart())) return { ...state, done: true }
        if (!line.trimStart().startsWith("- ")) return state
        return { done: false, values: [...state.values, cleanInlineValue(line.trimStart().slice(2))] }
      },
      { done: false, values: [] as string[] },
    )
    .values
  return uniqueList(nested.length ? nested : splitInlineList(inline)).filter((value) => value.toLowerCase() !== "none")
}

function splitInlineList(value: string) {
  if (!value || value.toLowerCase() === "none") return []
  return value.split(",").map(cleanInlineValue)
}

function cleanInlineValue(value: string) {
  const trimmed = value.trim()
  if (trimmed.startsWith("`") && trimmed.endsWith("`")) return trimmed.slice(1, -1).trim()
  return trimmed
}

function attemptBudgetValue(value: string | undefined) {
  if (!value || value.toLowerCase() === "none") return
  const match = /max\s+(\d+)\s+attempts?;\s+escalate:\s*(.+)$/i.exec(value)
  if (!match) {
    return {
      maxAttempts: 2,
      escalationRule: value,
    }
  }
  return {
    maxAttempts: Number(match[1]),
    escalationRule: match[2]?.trim() ?? "agent-blocked",
  }
}

function attemptBudgetSummary(value: PickupPacket["attemptBudget"] | undefined) {
  if (!value) return "none"
  return [
    "max " + value.maxAttempts + " attempts",
    value.escalationLabel ? "label: " + value.escalationLabel : "",
    value.escalationRule ? "escalate: " + value.escalationRule : "",
  ]
    .filter((item) => item.length > 0)
    .join("; ")
}

function instructionItems(values: readonly string[]) {
  const items = uniqueList(values)
  if (items.length === 0) return ["- none"]
  return items.map((value) => "- " + value)
}

function normalizeRouteStop(input: PickupPacketRouteStopInput) {
  return {
    ...(optionalText(input.routeID) ? { routeID: optionalText(input.routeID) } : {}),
    ...(optionalText(input.stopID) ? { stopID: optionalText(input.stopID) } : {}),
    ...(optionalText(input.goalID) ? { goalID: optionalText(input.goalID) } : {}),
    ...(optionalText(input.loopID) ? { loopID: optionalText(input.loopID) } : {}),
    ...(optionalText(input.runID) ? { runID: optionalText(input.runID) } : {}),
    ...(optionalText(input.name) ? { name: optionalText(input.name) } : {}),
  }
}

function normalizeAttemptBudget(input: PickupPacketAttemptBudgetInput) {
  return {
    maxAttempts: Math.max(1, Math.floor(input.maxAttempts)),
    ...(optionalText(input.escalationLabel) ? { escalationLabel: optionalText(input.escalationLabel) } : {}),
    ...(optionalText(input.escalationRule) ? { escalationRule: optionalText(input.escalationRule) } : {}),
  }
}

function requiredText(value: string | null | undefined, fallback: string) {
  return optionalText(value) ?? fallback
}

function optionalText(value: string | null | undefined) {
  const trimmed = value?.trim()
  return trimmed ? trimmed : undefined
}

function requiredList(values: readonly string[], fallback: string) {
  const items = uniqueList(values)
  return items.length ? items : [fallback]
}

function optionalList(values: readonly string[] | undefined) {
  const items = values ? uniqueList(values) : []
  return items.length ? items : undefined
}

function uniqueList(values: readonly string[]) {
  return [...new Set(values.map((value) => value.trim()).filter((value) => value.length > 0))]
}
