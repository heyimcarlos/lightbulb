import fs from "fs/promises"
import path from "path"
import { describe, expect } from "bun:test"
import { Effect, Equal, Hash, Layer, Schema } from "effect"
import { Tool } from "@opencode-ai/core/public"
import { Catalog } from "@opencode-ai/core/catalog"
import { LocationServiceMap } from "@opencode-ai/core/location-layer"
import { Location } from "@opencode-ai/core/location"
import { PluginBoot } from "@opencode-ai/core/plugin/boot"
import { ProviderV2 } from "@opencode-ai/core/provider"
import { AbsolutePath } from "@opencode-ai/core/schema"
import { LLMClient } from "@opencode-ai/llm"
import { RequestExecutor } from "@opencode-ai/llm/route"
import { tmpdir } from "./fixture/tmpdir"
import { testEffect } from "./lib/effect"
import { toolDefinitions } from "./lib/tool"
import { FSUtil } from "../src/fs-util"
import { Credential } from "../src/credential"
import { Database } from "../src/database/database"
import { EventV2 } from "../src/event"
import { Global } from "../src/global"
import { Git } from "../src/git"
import { ModelsDev } from "../src/models-dev"
import { Npm } from "../src/npm"
import { Project } from "../src/project"
import { ProjectDirectories } from "../src/project/directories"
import { Reference } from "../src/reference"
import { ToolRegistry } from "../src/tool/registry"
import { ApplicationTools } from "../src/tool/application-tools"
import { AppProcess } from "../src/process"
import { PermissionSaved } from "../src/permission/saved"
import { RepositoryCache } from "../src/repository-cache"
import { Ripgrep } from "../src/ripgrep"
import { SessionStore } from "../src/session/store"
import { ToolOutputStore } from "../src/tool-output-store"
import { FetchHttpClient } from "effect/unstable/http"

const applicationTools = ApplicationTools.layer
const database = Database.layerFromPath(":memory:").pipe(Layer.fresh)
const events = EventV2.layer.pipe(Layer.provide(database))
const projectDirectories = ProjectDirectories.layer.pipe(Layer.provide(database))
const project = Project.layer.pipe(
  Layer.provide(FSUtil.defaultLayer),
  Layer.provide(Git.defaultLayer),
  Layer.provideMerge(projectDirectories),
)
const locationDependencies = Layer.mergeAll(
  project,
  events,
  Credential.layer.pipe(Layer.provide(database)),
  Npm.defaultLayer,
  ModelsDev.layer.pipe(
    Layer.provide(FetchHttpClient.layer),
    Layer.provide(FSUtil.defaultLayer),
    Layer.provide(events),
  ),
  FSUtil.defaultLayer,
  Git.defaultLayer,
  AppProcess.defaultLayer,
  Global.defaultLayer,
  Ripgrep.defaultLayer,
  database,
  projectDirectories,
  SessionStore.layer.pipe(Layer.provide(database)),
  PermissionSaved.layer.pipe(Layer.provide(database)),
  RepositoryCache.defaultLayer,
  LLMClient.layer.pipe(Layer.provide(RequestExecutor.defaultLayer)),
  FetchHttpClient.layer,
  ToolOutputStore.defaultCleanupLayer,
  applicationTools,
)
const it = testEffect(
  Layer.merge(
    applicationTools,
    LocationServiceMap.layerNoDeps.pipe(Layer.provide(locationDependencies)),
  ),
)

describe("LocationServiceMap", () => {
  it.effect("compares equivalent location refs by value", () =>
    Effect.sync(() => {
      const directory = AbsolutePath.make("/project")
      expect(Equal.equals(Location.Ref.make({ directory }), Location.Ref.make({ directory }))).toBe(true)
      expect(Hash.hash(Location.Ref.make({ directory }))).toBe(
        Hash.hash(Location.Ref.make({ directory, workspaceID: undefined })),
      )
    }),
  )

  it.live(
    "isolates location state while sharing location policy with catalog",
    () =>
      Effect.acquireRelease(
        Effect.promise(() => Promise.all([tmpdir(), tmpdir()])),
        (dirs) =>
          Effect.promise(() => Promise.all(dirs.map((dir) => dir[Symbol.asyncDispose]())).then(() => undefined)),
      ).pipe(
        Effect.flatMap(([blocked, allowed]) =>
          Effect.gen(function* () {
            yield* (yield* ApplicationTools.Service).register({
              application_context: Tool.make({
                description: "Read application context",
                input: Schema.Struct({}),
                output: Schema.Struct({ ok: Schema.Boolean }),
                execute: () => Effect.succeed({ ok: true }),
              }),
            })
            yield* Effect.promise(() =>
              fs.writeFile(
                path.join(blocked.path, "opencode.json"),
                JSON.stringify({
                  experimental: { policies: [{ effect: "deny", action: "provider.use", resource: "test" }] },
                }),
              ),
            )

            const update = (directory: string) =>
              Effect.gen(function* () {
                yield* PluginBoot.Service.use((boot) => boot.wait())
                yield* Reference.Service
                const catalog = yield* Catalog.Service
                const transform = yield* catalog.transform()
                yield* transform((editor) => editor.provider.update(ProviderV2.ID.make("test"), () => {}))
                return {
                  providers: yield* catalog.provider.all(),
                  tools: yield* toolDefinitions(yield* ToolRegistry.Service),
                }
              }).pipe(
                Effect.scoped,
                Effect.provide(LocationServiceMap.get(Location.Ref.make({ directory: AbsolutePath.make(directory) }))),
              )

            const blockedState = yield* update(blocked.path)
            expect(blockedState.providers.some((provider) => provider.id === ProviderV2.ID.make("test"))).toBe(false)
            expect(blockedState.tools.map((tool) => tool.name).sort()).toEqual([
              "application_context",
              "apply_patch",
              "bash",
              "browser",
              "edit",
              "glob",
              "grep",
              "question",
              "read",
              "skill",
              "todowrite",
              "webfetch",
              "websearch",
              "write",
            ])
            const allowedState = yield* update(allowed.path)
            expect(allowedState.providers.some((provider) => provider.id === ProviderV2.ID.make("test"))).toBe(true)
            expect(allowedState.tools.map((tool) => tool.name).sort()).toEqual([
              "application_context",
              "apply_patch",
              "bash",
              "browser",
              "edit",
              "glob",
              "grep",
              "question",
              "read",
              "skill",
              "todowrite",
              "webfetch",
              "websearch",
              "write",
            ])
          }),
        ),
      ),
    15_000,
  )
})
