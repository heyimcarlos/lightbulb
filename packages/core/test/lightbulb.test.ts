import path from "path"
import { describe, expect } from "bun:test"
import { Effect, Exit, Layer } from "effect"
import { Lightbulb } from "@opencode-ai/core/lightbulb"
import { LightbulbArtifactEdgeTable, LightbulbArtifactTable } from "@opencode-ai/core/lightbulb/sql"
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

  it.live("builds a dashboard read model for seeded account work", () =>
    Effect.acquireRelease(
      Effect.promise(() => tmpdir()),
      (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
    ).pipe(
      Effect.flatMap((tmp) =>
        Effect.gen(function* () {
          const lightbulb = yield* Lightbulb.Service
          const seeded = yield* lightbulb.seedTracerBullet({
            accountName: "Dashboard Account",
            artifactUri: ".lightbulb/runs/issue-3-dashboard.md",
            artifactSummary: "Dashboard artifact handle.",
          })
          const dashboard = yield* lightbulb.readDashboard(seeded.accountID)

          expect(dashboard?.account).toEqual({
            id: seeded.accountID,
            name: "Dashboard Account",
            status: "active",
          })
          expect(dashboard?.goals).toEqual([
            {
              id: seeded.goalID,
              title: "Bootstrap loop harness",
              status: "open",
              summary: "Create one durable Lightbulb goal graph.",
              loops: [
                {
                  id: seeded.loopID,
                  kind: "implementation",
                  status: "active",
                  summary: "Implementation loop owns the tracer bullet run.",
                  runs: [
                    {
                      id: seeded.runID,
                      status: "complete",
                      reviewStatus: "requested",
                      debugStatus: "fixed",
                      gateStatus: "pending",
                      summary: "Worker produced a durable implementation report artifact.",
                      workers: [
                        {
                          id: seeded.workerID,
                          role: "bounded implementation worker",
                          status: "complete",
                          summary: "Implemented the schema tracer bullet and returned artifact handles.",
                        },
                      ],
                      gates: [
                        {
                          id: seeded.gateID,
                          kind: "review",
                          status: "pending",
                          summary: "Parent review is pending against the report artifact.",
                          artifactID: seeded.artifactID,
                        },
                      ],
                      artifacts: [
                        {
                          id: seeded.artifactID,
                          type: "report",
                          uri: ".lightbulb/runs/issue-3-dashboard.md",
                          summary: "Dashboard artifact handle.",
                          status: "registered",
                          producerRunID: seeded.runID,
                          producerWorkerID: seeded.workerID,
                          lineage: [
                            {
                              relation: "produced_by",
                              runID: seeded.runID,
                              workerID: seeded.workerID,
                              summary: "Worker produced this artifact for parent review.",
                            },
                          ],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ])
          expect(dashboard?.inbox.taskPackets).toEqual([
            {
              id: seeded.taskPacketID,
              workerID: seeded.workerID,
              title: "Implement schema tracer bullet",
              status: "complete",
            },
          ])
          expect(dashboard?.inbox.gates).toEqual([
            {
              id: seeded.gateID,
              kind: "review",
              status: "pending",
              summary: "Parent review is pending against the report artifact.",
              artifactID: seeded.artifactID,
            },
          ])
          expect(dashboard?.artifactHandles.map((artifact) => [artifact.id, artifact.uri])).toEqual([
            [seeded.artifactID, ".lightbulb/runs/issue-3-dashboard.md"],
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
          const registered = yield* lightbulb.registerArtifact({
            producerRunID: seeded.runID,
            producerWorkerID: seeded.workerID,
            taskPacketID: seeded.taskPacketID,
            type: "report",
            uri: ".lightbulb/runs/issue-4-artifact-flow.md",
            summary: "Issue 4 worker report for parent review.",
          })
          yield* lightbulb.consumeArtifact({
            artifactID: registered.id,
            consumerRunID: seeded.runID,
            consumerWorkerID: seeded.workerID,
            summary: "Parent reviewed the report handle.",
          })

          const graph = yield* lightbulb.readAccountGraph(seeded.accountID)
          const summary = yield* lightbulb.parentSummary(seeded.runID)
          const consumed = summary?.artifacts.find((artifact) => artifact.id === registered.id)

          expect(registered).toEqual({
            id: registered.id,
            type: "report",
            uri: ".lightbulb/runs/issue-4-artifact-flow.md",
            summary: "Issue 4 worker report for parent review.",
            status: "registered",
            producerRunID: seeded.runID,
            producerWorkerID: seeded.workerID,
            lineage: [
              {
                relation: "produced_by",
                runID: seeded.runID,
                workerID: seeded.workerID,
                summary: "Worker produced this artifact for parent review.",
              },
            ],
          })
          expect(
            graph?.artifactEdges
              .filter((edge) => edge.artifact_id === registered.id)
              .map((edge) => edge.relation)
              .sort(),
          ).toEqual(["consumed_by", "produced_by"])
          expect(graph?.artifacts.find((artifact) => artifact.id === registered.id)?.status).toBe("consumed")
          expect(JSON.stringify(graph)).not.toContain("RAW MODEL STREAM")
          expect(consumed).toMatchObject({
            id: registered.id,
            type: "report",
            uri: ".lightbulb/runs/issue-4-artifact-flow.md",
            summary: "Issue 4 worker report for parent review.",
            status: "consumed",
            producerRunID: seeded.runID,
            producerWorkerID: seeded.workerID,
          })
          expect(
            consumed?.lineage
              .map((edge) => ({
                relation: edge.relation,
                runID: edge.runID,
                workerID: edge.workerID,
                summary: edge.summary,
              }))
              .sort((left, right) => left.relation.localeCompare(right.relation)),
          ).toEqual([
            {
              relation: "consumed_by",
              runID: seeded.runID,
              workerID: seeded.workerID,
              summary: "Parent reviewed the report handle.",
            },
            {
              relation: "produced_by",
              runID: seeded.runID,
              workerID: seeded.workerID,
              summary: "Worker produced this artifact for parent review.",
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

  it.live("rejects cross-account artifact consumption", () =>
    Effect.acquireRelease(
      Effect.promise(() => tmpdir()),
      (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
    ).pipe(
      Effect.flatMap((tmp) =>
        Effect.gen(function* () {
          const lightbulb = yield* Lightbulb.Service
          const first = yield* lightbulb.seedTracerBullet()
          const second = yield* lightbulb.seedTracerBullet()
          const serviceRejected = yield* lightbulb
            .consumeArtifact({
              artifactID: first.artifactID,
              consumerRunID: second.runID,
              consumerWorkerID: second.workerID,
              summary: "A different account must not consume this artifact.",
            })
            .pipe(Effect.exit)

          const database = yield* Database.Service
          const directRejected = yield* database.db
            .insert(LightbulbArtifactEdgeTable)
            .values({
              account_id: first.accountID,
              artifact_id: first.artifactID,
              consumer_run_id: second.runID,
              consumer_worker_id: second.workerID,
              relation: "consumed_by",
              summary: "A direct insert must also respect account boundaries.",
            })
            .run()
            .pipe(Effect.exit)

          expect(Exit.isFailure(serviceRejected)).toBe(true)
          expect(Exit.isFailure(directRejected)).toBe(true)
        }).pipe(Effect.provide(layer(tmp.path))),
      ),
    ),
  )
})
