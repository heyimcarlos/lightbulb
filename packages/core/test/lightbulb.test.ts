import path from "path"
import { describe, expect } from "bun:test"
import { Effect, Exit, Layer } from "effect"
import { Lightbulb } from "@opencode-ai/core/lightbulb"
import { LightbulbArtifactTable } from "@opencode-ai/core/lightbulb/sql"
import { Database } from "@opencode-ai/core/database/database"
import { tmpdir } from "./fixture/tmpdir"
import { it } from "./lib/effect"

function layer(directory: string) {
  const database = Database.layerFromPath(path.join(directory, "lightbulb.db")).pipe(Layer.fresh)
  return Layer.mergeAll(database, Lightbulb.layer.pipe(Layer.provide(database)))
}

describe("Lightbulb", () => {
  it.live("creates and reads one durable account goal graph", () =>
    Effect.acquireRelease(
      Effect.promise(() => tmpdir()),
      (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
    ).pipe(
      Effect.flatMap((tmp) =>
        Effect.gen(function* () {
          const lightbulb = yield* Lightbulb.Service
          const seeded = yield* lightbulb.seedTracerBullet({
            accountName: "Test Account",
            artifactUri: ".lightbulb/runs/issue-2-schema-codex.md",
            artifactSummary: "Worker report with changed files and verification results.",
          })
          const graph = yield* lightbulb.readAccountGraph(seeded.accountID)

          expect(graph?.account.name).toBe("Test Account")
          expect(graph?.goals.map((goal) => goal.id)).toEqual([seeded.goalID])
          expect(graph?.loops.map((loop) => [loop.id, loop.goal_id])).toEqual([[seeded.loopID, seeded.goalID]])
          expect(graph?.runs.map((run) => [run.id, run.loop_id, run.review_status, run.debug_status, run.gate_status])).toEqual([
            [seeded.runID, seeded.loopID, "requested", "fixed", "pending"],
          ])
          expect(graph?.workers.map((worker) => [worker.id, worker.run_id, worker.status])).toEqual([
            [seeded.workerID, seeded.runID, "complete"],
          ])
          expect(graph?.taskPackets.map((packet) => [packet.id, packet.worker_id, packet.status])).toEqual([
            [seeded.taskPacketID, seeded.workerID, "complete"],
          ])
          expect(graph?.artifacts.map((artifact) => [artifact.id, artifact.uri, artifact.producer_worker_id, artifact.task_packet_id])).toEqual([
            [seeded.artifactID, ".lightbulb/runs/issue-2-schema-codex.md", seeded.workerID, seeded.taskPacketID],
          ])
          expect(graph?.gates.map((gate) => [gate.id, gate.kind, gate.status, gate.artifact_id])).toEqual([
            [seeded.gateID, "review", "pending", seeded.artifactID],
          ])
          expect(graph?.events.map((event) => [event.aggregate_type, event.aggregate_id, event.type])).toEqual([
            ["run", seeded.runID, "lightbulb.tracer.seeded"],
          ])
        }).pipe(Effect.provide(layer(tmp.path))),
      ),
    ),
  )

  it.live("summarizes artifact handles for parent orchestration without raw logs", () =>
    Effect.acquireRelease(
      Effect.promise(() => tmpdir()),
      (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
    ).pipe(
      Effect.flatMap((tmp) =>
        Effect.gen(function* () {
          const lightbulb = yield* Lightbulb.Service
          const seeded = yield* lightbulb.seedTracerBullet({
            artifactSummary: "Concise report for parent review.",
            rawWorkerLog: "RAW MODEL STREAM SHOULD STAY OUT OF PARENT SUMMARY",
          })
          yield* lightbulb.consumeArtifact({
            artifactID: seeded.artifactID,
            consumerRunID: seeded.runID,
            consumerWorkerID: seeded.workerID,
            summary: "Parent reviewed the report handle.",
          })

          const graph = yield* lightbulb.readAccountGraph(seeded.accountID)
          const summary = yield* lightbulb.parentSummary(seeded.runID)

          expect(graph?.artifactEdges.map((edge) => edge.relation).sort()).toEqual(["consumed_by", "produced_by"])
          expect(graph?.artifacts[0]?.status).toBe("consumed")
          expect(JSON.stringify(graph)).not.toContain("RAW MODEL STREAM")
          expect(summary?.artifacts).toEqual([
            {
              id: seeded.artifactID,
              type: "report",
              uri: ".lightbulb/runs/schema-tracer-bullet.md",
              summary: "Concise report for parent review.",
              status: "consumed",
              producerRunID: seeded.runID,
              producerWorkerID: seeded.workerID,
            },
          ])
          expect(JSON.stringify(summary)).not.toContain("RAW MODEL STREAM")
          expect(summary?.gates).toEqual([
            {
              id: seeded.gateID,
              kind: "review",
              status: "pending",
              summary: "Parent review is pending against the report artifact.",
              artifactID: seeded.artifactID,
            },
          ])
        }).pipe(Effect.provide(layer(tmp.path))),
      ),
    ),
  )

  it.live("rejects internally inconsistent artifact producer lineage", () =>
    Effect.acquireRelease(
      Effect.promise(() => tmpdir()),
      (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
    ).pipe(
      Effect.flatMap((tmp) =>
        Effect.gen(function* () {
          const lightbulb = yield* Lightbulb.Service
          const first = yield* lightbulb.seedTracerBullet()
          const second = yield* lightbulb.seedTracerBullet()
          const database = yield* Database.Service
          const rejected = yield* database.db
            .insert(LightbulbArtifactTable)
            .values({
              id: Lightbulb.ArtifactID.create(),
              account_id: first.accountID,
              producer_run_id: first.runID,
              producer_worker_id: second.workerID,
              task_packet_id: first.taskPacketID,
              type: "report",
              uri: ".lightbulb/runs/invalid-lineage.md",
              checksum: null,
              status: "registered",
              summary: "This artifact mixes a run with a worker from another run.",
              retention_policy: "discard",
            })
            .run()
            .pipe(Effect.exit)

          expect(Exit.isFailure(rejected)).toBe(true)
        }).pipe(Effect.provide(layer(tmp.path))),
      ),
    ),
  )
})
