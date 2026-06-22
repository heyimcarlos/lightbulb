import { afterEach, describe, expect } from "bun:test"
import path from "path"
import fs from "fs/promises"
import { fileURLToPath, pathToFileURL } from "url"
import { Effect, Exit, Layer, Result, Schema } from "effect"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { ToolRegistry } from "@/tool/registry"
import { Tool } from "@/tool/tool"
import { disposeAllInstances, TestInstance } from "../fixture/fixture"
import { testEffect } from "../lib/effect"
import { TestConfig } from "../fixture/config"
import { Config } from "@/config/config"
import { Plugin } from "@/plugin"
import { Agent } from "@/agent/agent"
import { InstanceState } from "@/effect/instance-state"

import { ToolJsonSchema } from "@/tool/json-schema"
import { MessageID, SessionID } from "@/session/schema"
import { RuntimeFlags } from "@/effect/runtime-flags"
import { ProviderV2 } from "@opencode-ai/core/provider"
import { ModelV2 } from "@opencode-ai/core/model"

const configLayer = TestConfig.layer({
  directories: () => InstanceState.directory.pipe(Effect.map((dir) => [path.join(dir, ".opencode")])),
})

// Fake Plugin.Service that returns a single plugin whose `tool` map contains
// one definition with `args: undefined`. Used to exercise the plugin entry
// point of `fromPlugin` for the #27451 / #27630 regression.
const brokenPluginLayer = Layer.succeed(
  Plugin.Service,
  Plugin.Service.of({
    init: () => Effect.void,
    trigger: ((_name: unknown, _input: unknown, output: unknown) =>
      Effect.succeed(output)) as Plugin.Interface["trigger"],
    list: () =>
      Effect.succeed([
        {
          tool: {
            broken_plugin_tool: {
              description: "plugin tool with missing args",
              args: undefined as unknown as Record<string, never>,
              execute: async () => "ok",
            },
          },
        },
      ]),
  }),
)

const root = LayerNode.group([ToolRegistry.node, Agent.node])
const replacements = [
  LayerNode.replace(Config.node, configLayer),
  LayerNode.replace(RuntimeFlags.node, RuntimeFlags.layer()),
]

const it = testEffect(LayerNode.buildLayer(root, { replacements }))
const withBrokenPlugin = testEffect(
  LayerNode.buildLayer(root, {
    replacements: [...replacements, LayerNode.replace(Plugin.node, brokenPluginLayer)],
  }),
)

afterEach(async () => {
  await disposeAllInstances()
})

function prependPath(bin: string) {
  const previousPath = process.env.PATH
  process.env.PATH = `${bin}${path.delimiter}${previousPath ?? ""}`
  return () => {
    process.env.PATH = previousPath
  }
}

async function writeAgentBrowser(bin: string, script: string) {
  await fs.mkdir(bin, { recursive: true })
  if (process.platform === "win32") {
    await Bun.write(path.join(bin, "agent-browser.cjs"), script)
    await Bun.write(path.join(bin, "agent-browser.cmd"), '@echo off\r\nnode "%~dp0agent-browser.cjs" %*\r\n')
    return
  }
  await Bun.write(path.join(bin, "agent-browser"), `#!/usr/bin/env node\n${script}`)
  await fs.chmod(path.join(bin, "agent-browser"), 0o755)
}

describe("tool.registry", () => {
  it.instance("does not expose task_status", () =>
    Effect.gen(function* () {
      const registry = yield* ToolRegistry.Service
      const ids = yield* registry.ids()

      expect(ids).not.toContain("task_status")
    }),
  )

  it.instance("exposes the browser computer-use tool to the server registry", () =>
    Effect.gen(function* () {
      const registry = yield* ToolRegistry.Service
      const ids = yield* registry.ids()

      expect(ids).toContain("browser")
    }),
  )

  it.instance("runs the browser tool through agent-browser and records screenshot evidence", () =>
    Effect.gen(function* () {
      const test = yield* TestInstance
      const bin = path.join(test.directory, "bin")
      yield* Effect.promise(() =>
        writeAgentBrowser(
          bin,
          'const fs = require("fs")\nconst args = process.argv.slice(2)\nconsole.log("agent-browser:" + args.join(" "))\nif (args[0] === "screenshot") fs.writeFileSync(args[1], "png")\n',
        ),
      )
      const restorePath = prependPath(bin)

      const registry = yield* ToolRegistry.Service
      const loaded = (yield* registry.all()).find((tool) => tool.id === "browser")
      if (!loaded) throw new Error("browser tool was not loaded")
      const agents = yield* Agent.Service
      const screenshot = "shot.png"
      const asked: unknown[] = []
      const result = yield* loaded.execute({ provider: "local", action: "screenshot", path: screenshot }, {
        sessionID: SessionID.make("ses_browser"),
        messageID: MessageID.make("msg_browser"),
        agent: (yield* agents.defaultInfo()).name,
        abort: new AbortController().signal,
        messages: [],
        metadata: () => Effect.void,
        ask: (input) => Effect.sync(() => asked.push(input)),
      } satisfies Tool.Context)
      restorePath()

      expect(result.output).toContain("agent-browser:screenshot")
      expect(result.output).toContain(`Artifact: ${path.join(test.directory, screenshot)}`)
      expect(yield* Effect.promise(() => Bun.file(path.join(test.directory, screenshot)).text())).toBe("png")
      expect(asked).toEqual([
        expect.objectContaining({ permission: "browser", patterns: ["local:screenshot:shot.png"] }),
      ])
    }),
  )

  it.instance("rejects browser screenshots outside the active instance directory", () =>
    Effect.gen(function* () {
      const registry = yield* ToolRegistry.Service
      const loaded = (yield* registry.all()).find((tool) => tool.id === "browser")
      if (!loaded) throw new Error("browser tool was not loaded")
      const agents = yield* Agent.Service
      const result = yield* loaded
        .execute({ provider: "local", action: "screenshot", path: "../escape.png" }, {
          sessionID: SessionID.make("ses_browser_escape"),
          messageID: MessageID.make("msg_browser_escape"),
          agent: (yield* agents.defaultInfo()).name,
          abort: new AbortController().signal,
          messages: [],
          metadata: () => Effect.void,
          ask: () => Effect.void,
        } satisfies Tool.Context)
        .pipe(Effect.exit)

      expect(Exit.isFailure(result)).toBe(true)
    }),
  )

  it.instance("runs browser CLI relative to the active instance directory", () =>
    Effect.gen(function* () {
      const test = yield* TestInstance
      const bin = path.join(test.directory, "bin")
      yield* Effect.promise(() =>
        writeAgentBrowser(
          bin,
          'const fs = require("fs")\nconst args = process.argv.slice(2)\nfs.writeFileSync("cwd.txt", process.cwd())\nif (args[0] === "screenshot") fs.writeFileSync(args[1], "png")\n',
        ),
      )
      const restorePath = prependPath(bin)

      const registry = yield* ToolRegistry.Service
      const loaded = (yield* registry.all()).find((tool) => tool.id === "browser")
      if (!loaded) throw new Error("browser tool was not loaded")
      const agents = yield* Agent.Service
      const result = yield* loaded.execute({ provider: "local", action: "screenshot", path: "relative-shot.png" }, {
        sessionID: SessionID.make("ses_browser_cwd"),
        messageID: MessageID.make("msg_browser_cwd"),
        agent: (yield* agents.defaultInfo()).name,
        abort: new AbortController().signal,
        messages: [],
        metadata: () => Effect.void,
        ask: () => Effect.void,
      } satisfies Tool.Context)
      restorePath()

      expect(yield* Effect.promise(() => Bun.file(path.join(test.directory, "cwd.txt")).text())).toBe(test.directory)
      expect(yield* Effect.promise(() => Bun.file(path.join(test.directory, "relative-shot.png")).text())).toBe("png")
      expect(result.output).toContain(`Artifact: ${path.join(test.directory, "relative-shot.png")}`)
    }),
  )

  it.instance("caps browser CLI output before returning it", () =>
    Effect.gen(function* () {
      const test = yield* TestInstance
      const bin = path.join(test.directory, "bin")
      yield* Effect.promise(() => writeAgentBrowser(bin, 'process.stdout.write("a".repeat(700000))\n'))
      const restorePath = prependPath(bin)

      const registry = yield* ToolRegistry.Service
      const loaded = (yield* registry.all()).find((tool) => tool.id === "browser")
      if (!loaded) throw new Error("browser tool was not loaded")
      const agents = yield* Agent.Service
      const result = yield* loaded.execute({ provider: "local", action: "snapshot" }, {
        sessionID: SessionID.make("ses_browser_cap"),
        messageID: MessageID.make("msg_browser_cap"),
        agent: (yield* agents.defaultInfo()).name,
        abort: new AbortController().signal,
        messages: [],
        metadata: () => Effect.void,
        ask: () => Effect.void,
      } satisfies Tool.Context)
      restorePath()

      expect(Buffer.byteLength(result.output, "utf8")).toBeLessThan(530000)
      expect(result.output).toContain("bytes truncated")
    }),
  )

  it.instance("does not spawn browser CLI processes after cancellation", () =>
    Effect.gen(function* () {
      const test = yield* TestInstance
      const bin = path.join(test.directory, "bin")
      const spawned = path.join(test.directory, "spawned")
      yield* Effect.promise(() =>
        writeAgentBrowser(bin, `const fs = require("fs")\nfs.writeFileSync(${JSON.stringify(spawned)}, "spawned")\n`),
      )
      const restorePath = prependPath(bin)

      const registry = yield* ToolRegistry.Service
      const loaded = (yield* registry.all()).find((tool) => tool.id === "browser")
      if (!loaded) throw new Error("browser tool was not loaded")
      const agents = yield* Agent.Service
      const abort = new AbortController()
      abort.abort()
      const result = yield* loaded
        .execute({ provider: "local", action: "snapshot" }, {
          sessionID: SessionID.make("ses_browser_cancelled"),
          messageID: MessageID.make("msg_browser_cancelled"),
          agent: (yield* agents.defaultInfo()).name,
          abort: abort.signal,
          messages: [],
          metadata: () => Effect.void,
          ask: () => Effect.void,
        } satisfies Tool.Context)
        .pipe(Effect.exit)
      restorePath()

      expect(Exit.isFailure(result)).toBe(true)
      expect(yield* Effect.promise(() => Bun.file(spawned).exists())).toBe(false)
    }),
  )

  it.instance("redacts nested Firecrawl session secrets", () =>
    Effect.acquireUseRelease(
      Effect.sync(() => globalThis.fetch),
      (originalFetch) =>
        Effect.gen(function* () {
          globalThis.fetch = (() =>
            Promise.resolve(
              new Response(
                JSON.stringify({
                  sessions: [
                    {
                      id: "fc-session",
                      cdpUrl: "wss://browser.firecrawl.dev/cdp/fc-session?token=secret",
                      nested: { apiKey: "fc-secret", headers: ["Authorization: Bearer nestedsecret"] },
                    },
                  ],
                }),
                { headers: { "content-type": "application/json" } },
              ),
            )) as unknown as typeof fetch
          const registry = yield* ToolRegistry.Service
          const loaded = (yield* registry.all()).find((tool) => tool.id === "browser")
          if (!loaded) throw new Error("browser tool was not loaded")
          const agents = yield* Agent.Service
          const result = yield* loaded.execute({ provider: "firecrawl", action: "sessions", apiKey: "fc-secret" }, {
            sessionID: SessionID.make("ses_browser_firecrawl"),
            messageID: MessageID.make("msg_browser_firecrawl"),
            agent: (yield* agents.defaultInfo()).name,
            abort: new AbortController().signal,
            messages: [],
            metadata: () => Effect.void,
            ask: () => Effect.void,
          } satisfies Tool.Context)
          globalThis.fetch = originalFetch

          expect(result.output).toContain("[REDACTED]")
          expect(result.output).not.toContain("secret")
        }),
      (originalFetch) => Effect.sync(() => void (globalThis.fetch = originalFetch)),
    ),
  )

  it.instance("hides task background parameter unless experimental background subagents are enabled", () =>
    Effect.gen(function* () {
      const registry = yield* ToolRegistry.Service
      const agent = yield* Agent.Service
      const build = yield* agent.get("build")
      if (!build) throw new Error("build agent not found")
      const task = (yield* registry.tools({
        providerID: ProviderV2.ID.opencode,
        modelID: ModelV2.ID.make("test"),
        agent: build,
      })).find((tool) => tool.id === "task")

      expect(task?.jsonSchema).toBeDefined()
      expect((task?.jsonSchema?.properties as Record<string, unknown> | undefined)?.background).toBeUndefined()
    }),
  )

  it.instance("loads tools from .opencode/tool (singular)", () =>
    Effect.gen(function* () {
      const test = yield* TestInstance
      const opencode = path.join(test.directory, ".opencode")
      const tool = path.join(opencode, "tool")
      yield* Effect.promise(() => fs.mkdir(tool, { recursive: true }))
      yield* Effect.promise(() =>
        Bun.write(
          path.join(tool, "hello.ts"),
          [
            "export default {",
            "  description: 'hello tool',",
            "  args: {},",
            "  execute: async () => {",
            "    return 'hello world'",
            "  },",
            "}",
            "",
          ].join("\n"),
        ),
      )
      const registry = yield* ToolRegistry.Service
      const ids = yield* registry.ids()
      expect(ids).toContain("hello")
    }),
  )

  it.instance("ignores non-tool exports in .opencode/tool files", () =>
    Effect.gen(function* () {
      const test = yield* TestInstance
      const tool = path.join(test.directory, ".opencode", "tool")
      yield* Effect.promise(() => fs.mkdir(tool, { recursive: true }))
      yield* Effect.promise(() =>
        Bun.write(
          path.join(tool, "mixed.ts"),
          [
            "export const helper = 'not a tool'",
            "export default {",
            "  description: 'mixed tool',",
            "  args: {},",
            "  execute: async () => 'ok',",
            "}",
            "",
          ].join("\n"),
        ),
      )

      const registry = yield* ToolRegistry.Service
      const ids = yield* registry.ids()
      expect(ids).toContain("mixed")
      expect(ids).not.toContain("mixed_helper")
    }),
  )

  // Regression for #27451 / #27630: a custom tool that omits `args` must not
  // crash registry initialization with
  // `Object.entries requires that input parameter not be null or undefined`.
  // Pre-1.14.49 the code path was `z.object(def.args)`, and `z.object(undefined)`
  // silently produced an empty schema — so the tool registered as no-args.
  // Preserve that tolerance.
  it.instance("tolerates a custom tool exporting null/undefined args (no-args fallback)", () =>
    Effect.gen(function* () {
      const test = yield* TestInstance
      const tool = path.join(test.directory, ".opencode", "tool")
      yield* Effect.promise(() => fs.mkdir(tool, { recursive: true }))
      yield* Effect.promise(() =>
        Bun.write(
          path.join(tool, "noargs.ts"),
          [
            "export default {",
            "  description: 'tool with no args',",
            "  args: undefined,",
            "  execute: async () => 'ok',",
            "}",
            "",
          ].join("\n"),
        ),
      )

      const registry = yield* ToolRegistry.Service
      const ids = yield* registry.ids()
      // Built-in tools must still load — a single malformed custom tool must
      // not poison the whole registry.
      expect(ids).toContain("read")
      const loaded = (yield* registry.all()).find((t) => t.id === "noargs")
      if (!loaded) throw new Error("noargs tool was not loaded")
      expect(loaded.jsonSchema).toMatchObject({ type: "object", properties: {} })
    }),
  )

  // Same regression, plugin entry point. The original reports (#27451, #27630)
  // came in through `plugin.list()` — `oh-my-opencode` was registering a tool
  // with `args: undefined` and crashing every message submit. The file-scan
  // and plugin-list loops both funnel through `fromPlugin`, but covering both
  // entry points means a future refactor that splits them won't silently lose
  // protection.
  withBrokenPlugin.instance("tolerates a plugin tool registered with null/undefined args", () =>
    Effect.gen(function* () {
      const registry = yield* ToolRegistry.Service
      const ids = yield* registry.ids()
      expect(ids).toContain("read")
      expect(ids).toContain("broken_plugin_tool")
    }),
  )

  it.instance("loads tools from .opencode/tools (plural)", () =>
    Effect.gen(function* () {
      const test = yield* TestInstance
      const opencode = path.join(test.directory, ".opencode")
      const tools = path.join(opencode, "tools")
      yield* Effect.promise(() => fs.mkdir(tools, { recursive: true }))
      yield* Effect.promise(() =>
        Bun.write(
          path.join(tools, "hello.ts"),
          [
            "export default {",
            "  description: 'hello tool',",
            "  args: {},",
            "  execute: async () => {",
            "    return 'hello world'",
            "  },",
            "}",
            "",
          ].join("\n"),
        ),
      )
      const registry = yield* ToolRegistry.Service
      const ids = yield* registry.ids()
      expect(ids).toContain("hello")
    }),
  )

  it.instance("loads Zod-schema custom tools with JSON Schema and validation", () =>
    Effect.gen(function* () {
      const test = yield* TestInstance
      const customTools = path.join(test.directory, ".opencode", "tools")
      const pluginTool = pathToFileURL(path.resolve(import.meta.dir, "../../../plugin/src/tool.ts")).href
      yield* Effect.promise(() => fs.mkdir(customTools, { recursive: true }))
      yield* Effect.promise(() =>
        Bun.write(
          path.join(customTools, "sql.ts"),
          [
            `import { tool } from ${JSON.stringify(pluginTool)}`,
            "export default tool({",
            "  description: 'query database',",
            "  args: { query: tool.schema.string().describe('SQL query to execute') },",
            "  execute: async ({ query }) => query,",
            "})",
            "",
          ].join("\n"),
        ),
      )

      const registry = yield* ToolRegistry.Service
      const loaded = (yield* registry.all()).find((tool) => tool.id === "sql")
      if (!loaded) throw new Error("custom sql tool was not loaded")
      expect(loaded?.jsonSchema).toMatchObject({
        type: "object",
        properties: {
          query: { type: "string", description: "SQL query to execute" },
        },
        required: ["query"],
      })
      expect(Result.isSuccess(Schema.decodeUnknownResult(loaded.parameters)({ query: "select 1" }))).toBe(true)
      expect(Result.isSuccess(Schema.decodeUnknownResult(loaded.parameters)({}))).toBe(false)

      const agents = yield* Agent.Service
      const promptTools = yield* registry.tools({
        providerID: ProviderV2.ID.opencode,
        modelID: ModelV2.ID.make("test"),
        agent: yield* agents.defaultInfo(),
      })
      const promptTool = promptTools.find((tool) => tool.id === "sql")
      if (!promptTool) throw new Error("custom sql tool was not returned for prompts")
      expect(ToolJsonSchema.fromTool(promptTool)).toMatchObject({
        properties: {
          query: { type: "string", description: "SQL query to execute" },
        },
        required: ["query"],
      })
    }),
  )

  it.instance(
    "preserves Zod arg descriptions from older config-scoped plugin packages",
    () =>
      Effect.gen(function* () {
        const test = yield* TestInstance
        const opencode = path.join(test.directory, ".opencode")
        const customTools = path.join(opencode, "tools")
        const plugin = path.join(opencode, "node_modules", "@opencode-ai", "plugin")
        yield* Effect.promise(() => fs.mkdir(path.join(plugin, "dist"), { recursive: true }))
        yield* Effect.promise(() => fs.mkdir(customTools, { recursive: true }))
        yield* Effect.promise(() =>
          fs.cp(path.dirname(fileURLToPath(import.meta.resolve("zod"))), path.join(opencode, "node_modules", "zod"), {
            dereference: true,
            recursive: true,
          }),
        )
        yield* Effect.promise(() =>
          Bun.write(
            path.join(plugin, "package.json"),
            JSON.stringify({ name: "@opencode-ai/plugin", type: "module", exports: { ".": "./dist/index.js" } }),
          ),
        )
        yield* Effect.promise(() =>
          Bun.write(
            path.join(plugin, "dist", "index.js"),
            [
              "import { z } from 'zod'",
              "export function tool(input) {",
              "  return input",
              "}",
              "tool.schema = z",
              "",
            ].join("\n"),
          ),
        )
        yield* Effect.promise(() =>
          Bun.write(
            path.join(customTools, "addition.ts"),
            [
              'import { tool } from "@opencode-ai/plugin"',
              "export default tool({",
              "  description: 'Use this tool to add two numbers and return their sum.',",
              "  args: {",
              "    left: tool.schema.number().describe('The first number to add'),",
              "    right: tool.schema.number().describe('The second number to add'),",
              "  },",
              "  execute: async (args) => `${args.left} + ${args.right} = ${args.left + args.right}`,",
              "})",
              "",
            ].join("\n"),
          ),
        )

        const registry = yield* ToolRegistry.Service
        const loaded = (yield* registry.all()).find((tool) => tool.id === "addition")
        if (!loaded) throw new Error("custom addition tool was not loaded")

        expect(ToolJsonSchema.fromTool(loaded)).toMatchObject({
          properties: {
            left: { type: "number", description: "The first number to add" },
            right: { type: "number", description: "The second number to add" },
          },
        })
      }),
    20_000,
  )

  it.instance("preserves attachments from structured custom tool results", () =>
    Effect.gen(function* () {
      const test = yield* TestInstance
      const customTools = path.join(test.directory, ".opencode", "tools")
      const pluginTool = pathToFileURL(path.resolve(import.meta.dir, "../../../plugin/src/tool.ts")).href
      yield* Effect.promise(() => fs.mkdir(customTools, { recursive: true }))
      yield* Effect.promise(() =>
        Bun.write(
          path.join(customTools, "image.ts"),
          [
            `import { tool } from ${JSON.stringify(pluginTool)}`,
            "export default tool({",
            "  description: 'image tool',",
            "  args: {},",
            "  execute: async () => ({",
            "    output: 'here is an image',",
            "    attachments: [{ type: 'file', mime: 'image/png', filename: 'picture.png', url: 'data:image/png;base64,AAAA' }],",
            "  }),",
            "})",
            "",
          ].join("\n"),
        ),
      )

      const registry = yield* ToolRegistry.Service
      const loaded = (yield* registry.all()).find((tool) => tool.id === "image")
      if (!loaded) throw new Error("custom image tool was not loaded")
      const agents = yield* Agent.Service
      const result = yield* loaded.execute({}, {
        sessionID: SessionID.make("ses_test"),
        messageID: MessageID.make("msg_test"),
        agent: (yield* agents.defaultInfo()).name,
        abort: new AbortController().signal,
        messages: [],
        metadata: () => Effect.void,
        ask: () => Effect.void,
      } satisfies Tool.Context)

      expect(result.output).toBe("here is an image")
      expect(result.attachments).toEqual([
        { type: "file", mime: "image/png", filename: "picture.png", url: "data:image/png;base64,AAAA" },
      ])
    }),
  )

  it.instance("loads legacy JSON-schema-shaped custom tools with wire schema", () =>
    Effect.gen(function* () {
      const test = yield* TestInstance
      const tools = path.join(test.directory, ".opencode", "tools")
      yield* Effect.promise(() => fs.mkdir(tools, { recursive: true }))
      yield* Effect.promise(() =>
        Bun.write(
          path.join(tools, "legacy.ts"),
          [
            "export default {",
            "  description: 'legacy schema tool',",
            "  args: { text: { type: 'string', description: 'Text to render' } },",
            "  execute: async ({ text }) => text,",
            "}",
            "",
          ].join("\n"),
        ),
      )

      const registry = yield* ToolRegistry.Service
      const loaded = (yield* registry.all()).find((tool) => tool.id === "legacy")
      if (!loaded) throw new Error("legacy custom tool was not loaded")
      expect(ToolJsonSchema.fromTool(loaded)).toMatchObject({
        type: "object",
        properties: {
          text: { type: "string", description: "Text to render" },
        },
        required: ["text"],
      })
    }),
  )

  it.instance("loads tools with external dependencies without crashing", () =>
    Effect.gen(function* () {
      const test = yield* TestInstance
      const opencode = path.join(test.directory, ".opencode")
      const tools = path.join(opencode, "tools")
      yield* Effect.promise(() => fs.mkdir(tools, { recursive: true }))
      yield* Effect.promise(() =>
        Bun.write(
          path.join(opencode, "package.json"),
          JSON.stringify({
            name: "custom-tools",
            dependencies: {
              "@opencode-ai/plugin": "^0.0.0",
              cowsay: "^1.6.0",
            },
          }),
        ),
      )
      yield* Effect.promise(() =>
        Bun.write(
          path.join(opencode, "package-lock.json"),
          JSON.stringify({
            name: "custom-tools",
            lockfileVersion: 3,
            packages: {
              "": {
                dependencies: {
                  "@opencode-ai/plugin": "^0.0.0",
                  cowsay: "^1.6.0",
                },
              },
            },
          }),
        ),
      )

      const cowsay = path.join(opencode, "node_modules", "cowsay")
      yield* Effect.promise(() => fs.mkdir(cowsay, { recursive: true }))
      yield* Effect.promise(() =>
        Bun.write(
          path.join(cowsay, "package.json"),
          JSON.stringify({
            name: "cowsay",
            type: "module",
            exports: "./index.js",
          }),
        ),
      )
      yield* Effect.promise(() =>
        Bun.write(
          path.join(cowsay, "index.js"),
          ["export function say({ text }) {", "  return `moo ${text}`", "}", ""].join("\n"),
        ),
      )
      yield* Effect.promise(() =>
        Bun.write(
          path.join(tools, "cowsay.ts"),
          [
            "import { say } from 'cowsay'",
            "export default {",
            "  description: 'tool that imports cowsay at top level',",
            "  args: { text: { type: 'string' } },",
            "  execute: async ({ text }: { text: string }) => {",
            "    return say({ text })",
            "  },",
            "}",
            "",
          ].join("\n"),
        ),
      )
      const registry = yield* ToolRegistry.Service
      const ids = yield* registry.ids()
      expect(ids).toContain("cowsay")
    }),
  )
})
