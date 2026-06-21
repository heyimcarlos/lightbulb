export * as BrowserTool from "./browser"

import { ToolFailure } from "@opencode-ai/llm"
import { Duration, Effect, Layer, Schema } from "effect"
import { ChildProcess } from "effect/unstable/process"
import fs from "fs/promises"
import path from "path"
import { AppProcess } from "../process"
import { PermissionV2 } from "../permission"
import { PositiveInt } from "../schema"
import { Tool } from "./tool"
import { Tools } from "./tools"

export const name = "browser"
export const DEFAULT_TIMEOUT_SECONDS = 60
export const MAX_TIMEOUT_SECONDS = 300
export const MAX_OUTPUT_BYTES = 512 * 1024

const Provider = Schema.Literals(["local", "firecrawl", "steel"])
const Action = Schema.Literals(["start", "open", "snapshot", "screenshot", "eval", "execute", "sessions", "stop"])
const Language = Schema.Literals(["node", "python", "bash"])

export const Input = Schema.Struct({
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
  ttl: PositiveInt.check(Schema.isLessThanOrEqualTo(3600)).pipe(Schema.optional).annotate({
    description: "Remote browser session TTL in seconds",
  }),
  activityTtl: PositiveInt.check(Schema.isLessThanOrEqualTo(3600)).pipe(Schema.optional).annotate({
    description: "Remote browser inactivity TTL in seconds",
  }),
  profile: Schema.String.pipe(Schema.optional).annotate({ description: "Persistent browser profile name" }),
  timeout: PositiveInt.check(Schema.isLessThanOrEqualTo(MAX_TIMEOUT_SECONDS)).pipe(Schema.optional).annotate({
    description: `Timeout in seconds. Defaults to ${DEFAULT_TIMEOUT_SECONDS}; max ${MAX_TIMEOUT_SECONDS}.`,
  }),
})

const Output = Schema.Struct({
  provider: Provider,
  action: Action,
  sessionID: Schema.String.pipe(Schema.optional),
  sessionName: Schema.String.pipe(Schema.optional),
  url: Schema.String.pipe(Schema.optional),
  cdpUrl: Schema.String.pipe(Schema.optional),
  liveViewUrl: Schema.String.pipe(Schema.optional),
  interactiveLiveViewUrl: Schema.String.pipe(Schema.optional),
  artifactPath: Schema.String.pipe(Schema.optional),
  output: Schema.String,
  exitCode: Schema.Number.pipe(Schema.optional),
})

type Input = typeof Input.Type
type Output = typeof Output.Type

export const description = `Control a real browser for Lightbulb computer-use work.

Use provider=local for visible local browser sessions through agent-browser. Use provider=firecrawl to create managed Interact sessions with CDP, liveViewUrl, and interactiveLiveViewUrl. Use provider=steel to drive Steel browser sessions through the Steel CLI. Browser work must produce observable evidence: screenshots, snapshots, DOM eval results, live view URLs, or CDP URLs.`

const localCommand = (input: Input) => {
  if (input.action === "open") return ["open", requireField(input.url, "url")]
  if (input.action === "snapshot") return ["snapshot", "-i"]
  if (input.action === "screenshot") return ["screenshot", input.path ?? defaultScreenshotPath(input.sessionName ?? "local")]
  if (input.action === "eval") return ["eval", requireField(input.code, "code")]
  if (input.action === "stop") return ["close", "--all"]
  if (input.action === "start") return ["open", input.url ?? "about:blank"]
  throw new Error(`local browser does not support ${input.action}`)
}

const steelCommand = (input: Input) => {
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

export const layer = Layer.effectDiscard(
  Effect.gen(function* () {
    const tools = yield* Tools.Service
    const appProcess = yield* AppProcess.Service
    const permission = yield* PermissionV2.Service

    yield* tools
      .register({
        [name]: Tool.make({
          description,
          input: Input,
          output: Output,
          toModelOutput: ({ output }) => [
            {
              type: "text",
              text: [
                output.output,
                output.liveViewUrl ? `Live view: ${output.liveViewUrl}` : undefined,
                output.interactiveLiveViewUrl ? `Interactive live view: ${output.interactiveLiveViewUrl}` : undefined,
                output.cdpUrl ? `CDP: ${output.cdpUrl}` : undefined,
                output.artifactPath ? `Artifact: ${output.artifactPath}` : undefined,
              ]
                .filter((line): line is string => line !== undefined)
                .join("\n"),
            },
          ],
          execute: (input, context) =>
            Effect.gen(function* () {
              const source = { type: "tool" as const, messageID: context.assistantMessageID, callID: context.toolCallID }
              yield* permission.assert({
                action: name,
                resources: [permissionResource(input)],
                save: ["*"],
                metadata: { ...input, apiKey: input.apiKey ? "[REDACTED]" : undefined },
                sessionID: context.sessionID,
                agent: context.agent,
                source,
              })
              if (input.provider === "firecrawl") return yield* firecrawl(input)
              return yield* runCli(input, input.provider === "steel" ? "steel" : "agent-browser", input.provider === "steel" ? steelCommand(input) : localCommand(input), appProcess)
            }).pipe(Effect.mapError((error) => new ToolFailure({ message: error instanceof Error ? error.message : "Browser action failed" }))),
        }),
      })
      .pipe(Effect.orDie)
  }),
)

function permissionResource(input: Input) {
  if (input.url) return `${input.provider}:${input.action}:${input.url}`
  if (input.sessionID) return `${input.provider}:${input.action}:${input.sessionID}`
  if (input.sessionName) return `${input.provider}:${input.action}:${input.sessionName}`
  return `${input.provider}:${input.action}`
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

function runCli(input: Input, command: string, args: string[], appProcess: AppProcess.Interface): Effect.Effect<Output, Error> {
  return Effect.gen(function* () {
    const artifactPath = input.action === "screenshot" ? args.find((arg) => arg.endsWith(".png")) : undefined
    if (artifactPath) yield* Effect.promise(() => fs.mkdir(path.dirname(artifactPath), { recursive: true }))
    const result = yield* appProcess
      .run(ChildProcess.make(command, args, { stdin: "ignore", forceKillAfter: Duration.seconds(3) }), {
        timeout: Duration.seconds(input.timeout ?? DEFAULT_TIMEOUT_SECONDS),
        maxOutputBytes: MAX_OUTPUT_BYTES,
        maxErrorBytes: MAX_OUTPUT_BYTES,
      })
      .pipe(Effect.mapError((error) => new Error(error.stderr || `Unable to run ${command}`)))
    const output = redact(result.stderr.length ? `${result.stdout.toString("utf8")}\nstderr:\n${result.stderr.toString("utf8")}` : result.stdout.toString("utf8"))
    const steel = command === "steel" ? parseSteelOutput(output) : {}
    return {
      provider: input.provider,
      action: input.action,
      ...(input.sessionName ? { sessionName: input.sessionName } : {}),
      ...(input.url ? { url: input.url } : {}),
      ...(steel.id ? { sessionID: steel.id } : {}),
      ...(steel.live_url ? { liveViewUrl: steel.live_url } : {}),
      ...(steel.connect_url ? { cdpUrl: steel.connect_url } : {}),
      ...(artifactPath ? { artifactPath } : {}),
      output: output.trim() || `(no ${command} output)`,
      exitCode: result.exitCode,
    }
  })
}

function firecrawl(input: Input): Effect.Effect<Output, Error> {
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
      return firecrawlSessionOutput(input, response, "Firecrawl browser session created.")
    }
    if (input.action === "sessions") {
      const response = yield* firecrawlRequest(apiUrl, "/interact?status=active", apiKey, { method: "GET" })
      return { provider: "firecrawl", action: input.action, output: JSON.stringify(redactSecrets(response), null, 2) }
    }
    if (input.action === "execute" || input.action === "eval" || input.action === "open" || input.action === "snapshot") {
      const sessionID = requireField(input.sessionID, "sessionID")
      const code = input.action === "open" ? `await page.goto(${JSON.stringify(requireField(input.url, "url"))}); await page.title();` : input.action === "snapshot" ? "await page.locator('body').innerText();" : requireField(input.code, "code")
      const response = yield* firecrawlRequest(apiUrl, `/interact/${encodeURIComponent(sessionID)}/execute`, apiKey, {
        method: "POST",
        body: JSON.stringify({ code, language: input.language ?? "node", timeout: input.timeout ?? DEFAULT_TIMEOUT_SECONDS }),
      })
      return firecrawlSessionOutput(input, response, responseText(response))
    }
    if (input.action === "stop") {
      const sessionID = requireField(input.sessionID, "sessionID")
      const response = yield* firecrawlRequest(apiUrl, `/interact/${encodeURIComponent(sessionID)}`, apiKey, { method: "DELETE" })
      return { provider: "firecrawl", action: input.action, sessionID, output: JSON.stringify(redactSecrets(response), null, 2) }
    }
    throw new Error(`firecrawl browser does not support ${input.action}`)
  })
}

function firecrawlRequest(apiUrl: string, endpoint: string, apiKey: string, init: RequestInit) {
  return Effect.tryPromise({
    try: async () => {
      const response = await fetch(`${apiUrl}${endpoint}`, {
        ...init,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
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

function firecrawlSessionOutput(input: Input, response: Record<string, unknown>, output: string): Output {
  return {
    provider: "firecrawl",
    action: input.action,
    ...(typeof response.id === "string" ? { sessionID: response.id } : input.sessionID ? { sessionID: input.sessionID } : {}),
    ...(input.url ? { url: input.url } : {}),
    ...(typeof response.cdpUrl === "string" ? { cdpUrl: response.cdpUrl } : {}),
    ...(typeof response.liveViewUrl === "string" ? { liveViewUrl: response.liveViewUrl } : {}),
    ...(typeof response.interactiveLiveViewUrl === "string" ? { interactiveLiveViewUrl: response.interactiveLiveViewUrl } : {}),
    output,
    ...(typeof response.exitCode === "number" ? { exitCode: response.exitCode } : {}),
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
