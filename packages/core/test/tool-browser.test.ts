import path from "path"
import { describe, expect } from "bun:test"
import { Effect, Layer } from "effect"
import { AppProcess } from "@opencode-ai/core/process"
import { BrowserTool } from "@opencode-ai/core/tool/browser"
import { PermissionV2 } from "@opencode-ai/core/permission"
import { SessionV2 } from "@opencode-ai/core/session"
import { ToolRegistry } from "@opencode-ai/core/tool/registry"
import { testEffect } from "./lib/effect"
import { executeTool, toolDefinitions, toolIdentity } from "./lib/tool"
import { tmpdir } from "./fixture/tmpdir"

const sessionID = SessionV2.ID.make("ses_browser_test")
const assertions: PermissionV2.AssertInput[] = []

const permission = Layer.succeed(
  PermissionV2.Service,
  PermissionV2.Service.of({
    assert: (input) => Effect.sync(() => assertions.push(input)),
    ask: () => Effect.die("unused"),
    reply: () => Effect.die("unused"),
    get: () => Effect.die("unused"),
    forSession: () => Effect.die("unused"),
    list: () => Effect.die("unused"),
  }),
)
const registry = ToolRegistry.defaultLayer.pipe(Layer.provide(permission))
const browser = BrowserTool.layer.pipe(Layer.provide(registry), Layer.provide(permission), Layer.provide(AppProcess.defaultLayer))
const it = testEffect(Layer.mergeAll(registry, permission, AppProcess.defaultLayer, browser))

const call = (input: typeof BrowserTool.Input.Type, id = "call-browser") => ({
  sessionID,
  ...toolIdentity,
  call: { type: "tool-call" as const, id, name: "browser", input },
})

const reset = () => {
  assertions.length = 0
}

describe("BrowserTool", () => {
  it.effect("registers as the Lightbulb computer-use browser tool", () =>
    Effect.gen(function* () {
      reset()
      const registry = yield* ToolRegistry.Service
      expect((yield* toolDefinitions(registry)).map((tool) => tool.name)).toEqual(["browser"])
    }),
  )

  it.live("runs local agent-browser and returns screenshot artifacts", () =>
    Effect.acquireUseRelease(
      Effect.promise(() => tmpdir()),
      (tmp) =>
        Effect.gen(function* () {
          reset()
          const bin = path.join(tmp.path, "bin")
          yield* Effect.promise(() => Bun.$`mkdir -p ${bin}`.quiet())
          yield* Effect.promise(() =>
            Bun.write(
              path.join(bin, "agent-browser"),
              '#!/usr/bin/env bash\nset -euo pipefail\necho "agent-browser:$*"\nif [ "${1:-}" = "screenshot" ]; then printf png > "$2"; fi\n',
            ),
          )
          yield* Effect.promise(() => Bun.$`chmod +x ${path.join(bin, "agent-browser")}`.quiet())
          const previousPath = process.env.PATH
          process.env.PATH = `${bin}:${previousPath ?? ""}`
          const registry = yield* ToolRegistry.Service
          const screenshot = path.join(tmp.path, "shot.png")
          const result = yield* executeTool(registry, call({ provider: "local", action: "screenshot", path: screenshot }))
          process.env.PATH = previousPath

          expect(result).toEqual({ type: "text", value: expect.stringContaining("agent-browser:screenshot") })
          expect(yield* Effect.promise(() => Bun.file(screenshot).text())).toBe("png")
          expect(assertions).toMatchObject([{ action: "browser", resources: ["local:screenshot"] }])
        }),
      (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
    ),
  )

  it.effect("creates Firecrawl sessions and exposes live browser URLs", () =>
    Effect.acquireUseRelease(
      Effect.sync(() => globalThis.fetch),
      (originalFetch) =>
        Effect.gen(function* () {
          reset()
          globalThis.fetch = ((url: string | URL | Request) =>
            Promise.resolve(
              new Response(
                JSON.stringify({
                  success: true,
                  id: "fc-session",
                  cdpUrl: "wss://browser.firecrawl.dev/cdp/fc-session?token=secret",
                  liveViewUrl: "https://liveview.firecrawl.dev/fc-session",
                  interactiveLiveViewUrl: "https://liveview.firecrawl.dev/fc-session?interactive=true",
                }),
                { headers: { "content-type": "application/json" } },
              ),
            )) as typeof fetch
          const registry = yield* ToolRegistry.Service
          const result = yield* executeTool(
            registry,
            call({ provider: "firecrawl", action: "start", apiKey: "fc-secret", ttl: 120 }),
          )
          globalThis.fetch = originalFetch

          expect(result).toEqual({
            type: "text",
            value: expect.stringContaining("Interactive live view: https://liveview.firecrawl.dev/fc-session?interactive=true"),
          })
          expect(result.value).not.toContain("secret")
          expect(assertions).toMatchObject([
            { action: "browser", resources: ["firecrawl:start"], metadata: { apiKey: "[REDACTED]" } },
          ])
        }),
      (originalFetch) => Effect.sync(() => void (globalThis.fetch = originalFetch)),
    ),
  )
})
