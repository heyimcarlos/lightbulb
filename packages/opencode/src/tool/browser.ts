import { Effect, Schema } from "effect"
import fs from "fs/promises"
import path from "path"
import * as Tool from "./tool"

export const name = "browser"
export const DEFAULT_TIMEOUT_SECONDS = 60
export const MAX_TIMEOUT_SECONDS = 300
export const MAX_OUTPUT_BYTES = 512 * 1024

const Provider = Schema.Literals(["local", "firecrawl", "steel"])
const Action = Schema.Literals(["start", "open", "snapshot", "screenshot", "eval", "execute", "sessions", "stop"])
const Language = Schema.Literals(["node", "python", "bash"])

export const Parameters = Schema.Struct({
  provider: Provider.pipe(Schema.withDecodingDefault(Effect.succeed("local" as const))).annotate({
    description:
      "Browser backend. local uses the installed agent-browser CLI. firecrawl uses Firecrawl Interact. steel uses the Steel browser CLI.",
  }),
  action: Action.annotate({ description: "Browser action to run" }),
  url: Schema.String.pipe(Schema.optional).annotate({ description: "URL for open/start actions" }),
  sessionID: Schema.String.pipe(Schema.optional).annotate({ description: "Remote browser session ID" }),
  sessionName: Schema.String.pipe(Schema.optional).annotate({ description: "Named local/Steel browser session" }),
  code: Schema.String.pipe(Schema.optional).annotate({ description: "JavaScript/Python/Bash code for eval/execute actions" }),
  language: Language.pipe(Schema.optional).annotate({ description: "Remote execution language. Defaults to node." }),
  path: Schema.String.pipe(Schema.optional).annotate({ description: "Screenshot output path for local/Steel screenshots" }),
  apiKey: Schema.String.pipe(Schema.optional).annotate({ description: "API key. Prefer FIRECRAWL_API_KEY or STEEL_API_KEY env vars." }),
  apiUrl: Schema.String.pipe(Schema.optional).annotate({ description: "Provider API URL override" }),
  ttl: Schema.Number.pipe(Schema.optional).annotate({ description: "Remote browser session TTL in seconds" }),
  activityTtl: Schema.Number.pipe(Schema.optional).annotate({ description: "Remote browser inactivity TTL in seconds" }),
  profile: Schema.String.pipe(Schema.optional).annotate({ description: "Persistent browser profile name" }),
  timeout: Schema.Number.pipe(Schema.optional).annotate({
    description: `Timeout in seconds. Defaults to ${DEFAULT_TIMEOUT_SECONDS}; max ${MAX_TIMEOUT_SECONDS}.`,
  }),
})

type Parameters = typeof Parameters.Type

export const description = `Control a real browser for Lightbulb computer-use work.

Use provider=local for visible local browser sessions through agent-browser. Use provider=firecrawl to create managed Interact sessions with CDP, liveViewUrl, and interactiveLiveViewUrl. Use provider=steel to drive Steel browser sessions through the Steel CLI. Browser work must produce observable evidence: screenshots, snapshots, DOM eval results, live view URLs, or CDP URLs.`

export const BrowserTool = Tool.define(
  name,
  Effect.gen(function* () {
    return {
      description,
      parameters: Parameters,
      execute: (params: Parameters, ctx: Tool.Context) =>
        Effect.gen(function* () {
          validateTimeout(params.timeout)
          yield* ctx.metadata({ title: browserTitle(params), metadata: safeMetadata(params) })
          yield* ctx.ask({
            permission: name,
            patterns: [permissionResource(params)],
            always: ["*"],
            metadata: safeMetadata(params),
          })
          if (params.provider === "firecrawl") return yield* firecrawl(params)
          const command = params.provider === "steel" ? "steel" : "agent-browser"
          const args = params.provider === "steel" ? steelCommand(params) : localCommand(params)
          return yield* runCli(params, command, args, ctx.abort)
        }).pipe(Effect.orDie),
    }
  }),
)

function validateTimeout(timeout: number | undefined) {
  if (timeout !== undefined && (!Number.isFinite(timeout) || timeout <= 0 || timeout > MAX_TIMEOUT_SECONDS)) {
    throw new Error(`browser timeout must be between 1 and ${MAX_TIMEOUT_SECONDS} seconds`)
  }
}

function browserTitle(input: Parameters) {
  return ["Browser", input.provider ?? "local", input.action, input.url ?? input.sessionID ?? input.sessionName]
    .filter(Boolean)
    .join(" ")
}

function safeMetadata(input: Parameters) {
  return { ...input, apiKey: input.apiKey ? "[REDACTED]" : undefined }
}

function permissionResource(input: Parameters) {
  if (input.url) return `${input.provider}:${input.action}:${input.url}`
  if (input.sessionID) return `${input.provider}:${input.action}:${input.sessionID}`
  if (input.sessionName) return `${input.provider}:${input.action}:${input.sessionName}`
  return `${input.provider}:${input.action}`
}

function localCommand(input: Parameters) {
  if (input.action === "open") return ["open", requireField(input.url, "url")]
  if (input.action === "snapshot") return ["snapshot", "-i"]
  if (input.action === "screenshot") return ["screenshot", input.path ?? defaultScreenshotPath(input.sessionName ?? "local")]
  if (input.action === "eval") return ["eval", requireField(input.code, "code")]
  if (input.action === "stop") return ["close", "--all"]
  if (input.action === "start") return ["open", input.url ?? "about:blank"]
  throw new Error(`local browser does not support ${input.action}`)
}

function steelCommand(input: Parameters) {
  const mode = input.apiUrl ? ["--api-url", input.apiUrl] : []
  const session = input.sessionName ? ["--session", input.sessionName] : []
  if (input.action === "start") return ["browser", "start", ...session, ...mode]
  if (input.action === "sessions") return ["browser", "sessions", "--raw", ...mode]
  if (input.action === "stop") return ["browser", "stop", ...session, ...mode]
  if (input.action === "open") return ["browser", "open", requireField(input.url, "url"), ...session, ...mode]
  if (input.action === "snapshot") return ["browser", "snapshot", "-i", ...session, ...mode]
  if (input.action === "screenshot") return ["browser", "screenshot", input.path ?? defaultScreenshotPath(input.sessionName ?? "steel"), ...session, ...mode]
  if (input.action === "eval") return ["browser", "eval", requireField(input.code, "code"), ...session, ...mode]
  throw new Error(`steel browser does not support ${input.action}`)
}

function defaultScreenshotPath(session: string) {
  return path.join(".lightbulb", "browser-runs", sanitizePathPart(session), "artifacts", "screenshots", `${Date.now()}.png`)
}

function sanitizePathPart(value: string) {
  return value.replace(/[^a-zA-Z0-9_.-]+/g, "-").replace(/^-+|-+$/g, "") || "browser"
}

function requireField(value: string | undefined, field: string) {
  if (!value) throw new Error(`browser ${field} is required for this action`)
  return value
}

function redact(input: string) {
  return input.replace(/(apiKey|token|key)=([^&\s]+)/gi, "$1=[REDACTED]").replace(/Bearer\s+[^\s]+/gi, "Bearer [REDACTED]")
}

function parseSteelOutput(output: string) {
  return Object.fromEntries(
    output
      .split("\n")
      .map((line) => line.match(/^([a-zA-Z_]+):\s*(.*)$/))
      .filter((match): match is RegExpMatchArray => match !== null)
      .map((match) => [match[1], match[2]]),
  )
}

function runCli(input: Parameters, command: string, args: string[], signal: AbortSignal): Effect.Effect<Tool.ExecuteResult, Error> {
  return Effect.tryPromise({
    try: async () => {
      if (signal.aborted) throw new Error(`browser ${input.action} cancelled`)
      const artifactPath = input.action === "screenshot" ? args.find((arg) => arg.endsWith(".png")) : undefined
      if (artifactPath) await fs.mkdir(path.dirname(artifactPath), { recursive: true })
      const proc = Bun.spawn([command, ...args], { stdout: "pipe", stderr: "pipe", env: process.env })
      const abort = () => proc.kill()
      signal.addEventListener("abort", abort, { once: true })
      const timeoutMs = (input.timeout ?? DEFAULT_TIMEOUT_SECONDS) * 1000
      let timedOut = false
      const timeout = setTimeout(() => {
        timedOut = true
        proc.kill()
      }, timeoutMs)
      const [exitCode, stdout, stderr] = await Promise.all([
        proc.exited,
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
      ]).finally(() => {
        clearTimeout(timeout)
        signal.removeEventListener("abort", abort)
      })
      if (signal.aborted) throw new Error(`browser ${input.action} cancelled`)
      if (timedOut) throw new Error(`browser ${input.action} timed out`)
      const raw = stderr.length ? `${stdout}\nstderr:\n${stderr}` : stdout
      const output = redact(raw).trim()
      const steel = command === "steel" ? parseSteelOutput(output) : {}
      const lines = [
        output || `(no ${command} output)`,
        steel.live_url ? `Live view: ${steel.live_url}` : undefined,
        steel.connect_url ? `CDP: ${steel.connect_url}` : undefined,
        artifactPath ? `Artifact: ${artifactPath}` : undefined,
      ].filter((line): line is string => line !== undefined)

      if (exitCode !== 0) lines.push(`Exit code: ${exitCode}`)

      return {
        title: browserTitle(input),
        output: lines.join("\n"),
        metadata: {
          provider: input.provider,
          action: input.action,
          ...(input.sessionName ? { sessionName: input.sessionName } : {}),
          ...(input.url ? { url: input.url } : {}),
          ...(steel.id ? { sessionID: steel.id } : {}),
          ...(steel.live_url ? { liveViewUrl: steel.live_url } : {}),
          ...(steel.connect_url ? { cdpUrl: steel.connect_url } : {}),
          ...(artifactPath ? { artifactPath } : {}),
        },
      }
    },
    catch: (error) => (error instanceof Error ? error : new Error(`Unable to run ${command}: ${String(error)}`)),
  })
}

function firecrawl(input: Parameters): Effect.Effect<Tool.ExecuteResult, Error> {
  return Effect.gen(function* () {
    const apiKey = input.apiKey ?? process.env.FIRECRAWL_API_KEY
    if (!apiKey) throw new Error("FIRECRAWL_API_KEY or input.apiKey is required for provider=firecrawl")
    const apiUrl = input.apiUrl ?? "https://api.firecrawl.dev/v2"
    if (input.action === "start") {
      const response = yield* firecrawlRequest(apiUrl, "/interact", apiKey, {
        method: "POST",
        body: JSON.stringify({
          ...(input.ttl ? { ttl: input.ttl } : {}),
          ...(input.activityTtl ? { activityTtl: input.activityTtl } : {}),
          ...(input.profile ? { profile: { name: input.profile } } : {}),
          streamWebView: true,
        }),
      })
      return firecrawlOutput(input, response, "Firecrawl browser session created.")
    }
    if (input.action === "sessions") {
      const response = yield* firecrawlRequest(apiUrl, "/interact?status=active", apiKey, { method: "GET" })
      return { title: "Firecrawl browser sessions", output: JSON.stringify(redactSecrets(response), null, 2), metadata: { provider: "firecrawl", action: input.action } }
    }
    if (input.action === "execute" || input.action === "eval" || input.action === "open" || input.action === "snapshot") {
      const sessionID = requireField(input.sessionID, "sessionID")
      const code = input.action === "open" ? `await page.goto(${JSON.stringify(requireField(input.url, "url"))}); await page.title();` : input.action === "snapshot" ? "await page.locator('body').innerText();" : requireField(input.code, "code")
      const response = yield* firecrawlRequest(apiUrl, `/interact/${encodeURIComponent(sessionID)}/execute`, apiKey, {
        method: "POST",
        body: JSON.stringify({ code, language: input.language ?? "node", timeout: input.timeout ?? DEFAULT_TIMEOUT_SECONDS }),
      })
      return firecrawlOutput(input, response, responseText(response))
    }
    if (input.action === "stop") {
      const sessionID = requireField(input.sessionID, "sessionID")
      const response = yield* firecrawlRequest(apiUrl, `/interact/${encodeURIComponent(sessionID)}`, apiKey, { method: "DELETE" })
      return { title: "Firecrawl browser stop", output: JSON.stringify(redactSecrets(response), null, 2), metadata: { provider: "firecrawl", action: input.action, sessionID } }
    }
    throw new Error(`firecrawl browser does not support ${input.action}`)
  })
}

function firecrawlRequest(apiUrl: string, endpoint: string, apiKey: string, init: RequestInit) {
  return Effect.tryPromise({
    try: async () => {
      const response = await fetch(`${apiUrl}${endpoint}`, {
        ...init,
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      })
      const text = await response.text()
      const body = text ? JSON.parse(text) : {}
      if (!response.ok) throw new Error(`Firecrawl ${response.status}: ${redact(text)}`)
      return redactSecrets(body) as Record<string, unknown>
    },
    catch: (error) => (error instanceof Error ? error : new Error("Firecrawl request failed")),
  })
}

function responseText(response: Record<string, unknown>) {
  if (typeof response.output === "string") return response.output
  if (typeof response.result === "string") return response.result
  if (typeof response.stdout === "string") return response.stdout
  return "Firecrawl browser execution completed."
}

function firecrawlOutput(input: Parameters, response: Record<string, unknown>, output: string): Tool.ExecuteResult {
  const metadata = {
    provider: "firecrawl",
    action: input.action,
    ...(typeof response.id === "string" ? { sessionID: response.id } : input.sessionID ? { sessionID: input.sessionID } : {}),
    ...(input.url ? { url: input.url } : {}),
    ...(typeof response.cdpUrl === "string" ? { cdpUrl: response.cdpUrl } : {}),
    ...(typeof response.liveViewUrl === "string" ? { liveViewUrl: response.liveViewUrl } : {}),
    ...(typeof response.interactiveLiveViewUrl === "string" ? { interactiveLiveViewUrl: response.interactiveLiveViewUrl } : {}),
  }
  return {
    title: browserTitle(input),
    output: [
      output,
      metadata.liveViewUrl ? `Live view: ${metadata.liveViewUrl}` : undefined,
      metadata.interactiveLiveViewUrl ? `Interactive live view: ${metadata.interactiveLiveViewUrl}` : undefined,
      metadata.cdpUrl ? `CDP: ${metadata.cdpUrl}` : undefined,
    ]
      .filter((line): line is string => line !== undefined)
      .join("\n"),
    metadata,
  }
}

function redactSecrets(input: unknown): unknown {
  if (Array.isArray(input)) return input.map(redactSecrets)
  if (!input || typeof input !== "object") return typeof input === "string" ? redact(input) : input
  return Object.fromEntries(
    Object.entries(input).map(([key, value]) => [
      key,
      key.toLowerCase().includes("token") || key.toLowerCase().includes("apikey") || key.toLowerCase() === "key"
        ? "[REDACTED]"
        : redactSecrets(value),
    ]),
  )
}
