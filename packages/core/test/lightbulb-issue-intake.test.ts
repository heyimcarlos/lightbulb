import path from "path"
import { describe, expect } from "bun:test"
import { Effect, Layer } from "effect"
import { Database } from "@opencode-ai/core/database/database"
import { Lightbulb } from "@opencode-ai/core/lightbulb"
import { LightbulbRunTable, LightbulbTaskPacketTable } from "@opencode-ai/core/lightbulb/sql"
import { tmpdir } from "./fixture/tmpdir"
import { it } from "./lib/effect"

function layer(directory: string) {
  const database = Database.layerFromPath(path.join(directory, "lightbulb-issue-intake.db")).pipe(Layer.fresh)
  return Layer.mergeAll(database, Lightbulb.layer.pipe(Layer.provide(database)))
}

describe("Lightbulb issue queue intake", () => {
  it.live("classifies GitHub issue snapshots and routes only ready work into bounded requests", () =>
    Effect.acquireRelease(
      Effect.promise(() => tmpdir()),
      (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
    ).pipe(
      Effect.flatMap((tmp) =>
        Effect.gen(function* () {
          const lightbulb = yield* Lightbulb.Service
          const accountID = Lightbulb.AccountID.create()

          const result = yield* lightbulb.ingestIssueQueueSnapshots({
            snapshots: [
              snapshot(accountID, 12, "GitHub issue queue intake", ["ready-for-agent"], {
                bodyHandle: "github:issue:12:body",
                bodySummary: "Add issue intake.",
              }),
              snapshot(accountID, 74, "Structured pickup packets", ["ready-for-agent", "blocked-by-dependency"], {
                dependencyRefs: ["#9"],
              }),
              snapshot(accountID, 73, "Loop profile registry", ["needs-info"]),
              snapshot(accountID, 26, "Account loop runner tick", ["ready-for-agent", "agent-running"]),
              snapshot(accountID, 17, "Due-loop dispatch", ["ready-for-agent", "agent-done"]),
              snapshot(accountID, 22, "Worker launch adapter", ["agent-integrated"]),
            ],
          })

          expect(result.classifications.map((item) => [item.issueRef, item.status])).toEqual([
            ["#12", "ready"],
            ["#74", "dependency_blocked"],
            ["#73", "human_held"],
            ["#26", "active_worker_owned"],
            ["#17", "active_worker_owned"],
            ["#22", "integrated_done"],
          ])
          expect(result.routingInputs).toEqual([
            expect.objectContaining({
              accountID,
              issueRef: "#12",
              issueHandle: "github:issue:12",
              promptHandle: "github:issue:12:prompt",
              instructionHandle: "github:issue:12:body",
              bodySummary: "Add issue intake.",
            }),
          ])
          expect(result.taskPacketRequests).toEqual([
            expect.objectContaining({
              accountID,
              issueRef: "#12",
              issueHandle: "github:issue:12",
              promptHandle: "github:issue:12:prompt",
              instructionHandle: "github:issue:12:body",
              bodyHandle: "github:issue:12:body",
            }),
          ])
          expect(result.skipped).toEqual([
            expect.objectContaining({
              issueRef: "#74",
              reason: "dependency_blocked",
              blockerRefs: ["#9"],
            }),
            expect.objectContaining({
              issueRef: "#73",
              reason: "human_held",
              blockerRefs: ["label:needs-info"],
            }),
            expect.objectContaining({
              issueRef: "#26",
              reason: "active_worker_owned",
              blockerRefs: ["label:agent-running"],
            }),
            expect.objectContaining({
              issueRef: "#17",
              reason: "active_worker_owned",
              blockerRefs: ["label:agent-done"],
            }),
            expect.objectContaining({
              issueRef: "#22",
              reason: "integrated_done",
              blockerRefs: ["label:agent-integrated"],
            }),
          ])
        }).pipe(Effect.provide(layer(tmp.path))),
      ),
    ),
  )

  it.live("keeps dependency-blocked issues from creating worker spawn requests", () =>
    Effect.acquireRelease(
      Effect.promise(() => tmpdir()),
      (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
    ).pipe(
      Effect.flatMap((tmp) =>
        Effect.gen(function* () {
          const lightbulb = yield* Lightbulb.Service
          const database = yield* Database.Service
          const accountID = Lightbulb.AccountID.create()
          const intake = yield* lightbulb.ingestIssueQueueSnapshots({
            snapshots: [
              snapshot(accountID, 74, "Structured pickup packets", ["ready-for-agent", "blocked-by-dependency"], {
                dependencyRefs: ["#9", "#12"],
              }),
            ],
          })
          const dispatch = yield* lightbulb.planWorkerDispatch({ issues: intake.routingInputs })

          expect(intake.routingInputs).toEqual([])
          expect(intake.skipped).toEqual([
            expect.objectContaining({
              issueRef: "#74",
              reason: "dependency_blocked",
              blockerRefs: ["#9", "#12"],
            }),
          ])
          expect(dispatch.spawnRequests).toEqual([])
          expect(yield* database.db.select().from(LightbulbRunTable).all().pipe(Effect.orDie)).toEqual([])
          expect(yield* database.db.select().from(LightbulbTaskPacketTable).all().pipe(Effect.orDie)).toEqual([])
        }).pipe(Effect.provide(layer(tmp.path))),
      ),
    ),
  )
})

function snapshot(
  accountID: Lightbulb.AccountID,
  number: number,
  title: string,
  labels: readonly string[],
  options?: {
    readonly bodyHandle?: string
    readonly bodySummary?: string
    readonly dependencyRefs?: readonly string[]
  },
) {
  return {
    accountID,
    number,
    title,
    url: "https://github.com/heyimcarlos/lightbulb/issues/" + number,
    labels,
    updatedAt: Date.UTC(2026, 0, number),
    bodyHandle: options?.bodyHandle,
    bodySummary: options?.bodySummary,
    dependencyRefs: options?.dependencyRefs,
  } satisfies Lightbulb.IssueQueueSnapshot
}
