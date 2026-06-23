import path from "path"
import { describe, expect } from "bun:test"
import { eq } from "drizzle-orm"
import { Effect, Layer } from "effect"
import { Database } from "@opencode-ai/core/database/database"
import { Lightbulb } from "@opencode-ai/core/lightbulb"
import {
  LightbulbEventTable,
  LightbulbTaskPacketTable,
  LightbulbWorkerLaunchAttemptTable,
  LightbulbWorkerTable,
} from "@opencode-ai/core/lightbulb/sql"
import { tmpdir } from "./fixture/tmpdir"
import { it } from "./lib/effect"

const now = Date.UTC(2026, 5, 23, 18)

const defaultPolicy = {
  schedule: {
    enabled: true,
    cadenceMs: 60_000,
  },
  budget: {
    status: "open",
    maxRunsPerDay: 3,
    maxTokens: 120_000,
    maxCostUsd: 12,
    maxContextTokens: 480_000,
  },
} satisfies Lightbulb.LoopProfileDefaultPolicy

function layer(directory: string) {
  const database = Database.layerFromPath(path.join(directory, "lightbulb-worker-report.db")).pipe(Layer.fresh)
  return Layer.mergeAll(database, Lightbulb.layer.pipe(Layer.provide(database)))
}

describe("Lightbulb worker report ingestion", () => {
  it.live("ingests a completed worker report with artifact handles and usage totals", () =>
    Effect.acquireRelease(
      Effect.promise(() => tmpdir()),
      (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
    ).pipe(
      Effect.flatMap((tmp) =>
        Effect.gen(function* () {
          const lightbulb = yield* Lightbulb.Service
          const database = yield* Database.Service
          const prepared = yield* prepareReportPacket(lightbulb, database)
          yield* Effect.promise(() => Bun.write(path.join(tmp.path, "final-report.md"), "Worker final report body"))
          yield* lightbulb.launchWorker({
            accountID: prepared.accountID,
            workerID: prepared.workerID,
            taskPacketID: prepared.taskPacketID,
            trigger: "manual",
            status: "running",
            now: now + 1_000,
            cwd: "/tmp/lightbulb-worker-report",
            command: "lightbulb run --agent lightbulb-worker --format json",
            reportURI: "final-report.md",
          })

          const ingested = yield* lightbulb.ingestWorkerReport({
            accountID: prepared.accountID,
            runID: prepared.runID,
            workerID: prepared.workerID,
            taskPacketID: prepared.taskPacketID,
            status: "complete",
            summary: "Worker completed issue #18 final report ingestion.",
            artifacts: [
              {
                type: "report",
                uri: "final-report.md",
                summary: "Bounded worker final report for issue #18.",
                retentionPolicy: { mode: "keep" },
                baseDirectory: tmp.path,
              },
            ],
            verification: {
              commands: ["cd packages/core && bun test test/lightbulb-worker-report.test.ts"],
              summary: "Focused worker report tests pass.",
            },
            usage: {
              inputTokens: 100,
              outputTokens: 25,
              totalTokens: 125,
              costUsd: 0.02,
              contextTokens: 2048,
            },
            now: now + 2_000,
          })
          const graph = yield* lightbulb.readAccountGraph(prepared.accountID)
          const summary = yield* lightbulb.parentSummary(prepared.runID)
          const events = yield* database.db
            .select()
            .from(LightbulbEventTable)
            .where(eq(LightbulbEventTable.type, "lightbulb.worker_report.ingested"))
            .all()
            .pipe(Effect.orDie)
          const attempts = yield* database.db
            .select()
            .from(LightbulbWorkerLaunchAttemptTable)
            .where(eq(LightbulbWorkerLaunchAttemptTable.worker_id, prepared.workerID))
            .all()
            .pipe(Effect.orDie)

          expect(ingested).toMatchObject({
            status: "complete",
            runID: prepared.runID,
            workerID: prepared.workerID,
            taskPacketID: prepared.taskPacketID,
            reviewGate: null,
          })
          expect(ingested.artifactHandles).toContainEqual(
            expect.objectContaining({
              type: "report",
              uri: "final-report.md",
              producerKind: "worker",
              producerRunID: prepared.runID,
              producerWorkerID: prepared.workerID,
              retentionDecision: "hold-for-active-run",
            }),
          )
          expect(graph?.runs.map((run) => [run.id, run.status, run.review_status, run.gate_status, run.completed_at])).toContainEqual([
            prepared.runID,
            "complete",
            "approved",
            "passed",
            now + 2_000,
          ])
          expect(graph?.workers.map((worker) => [worker.id, worker.status, worker.summary])).toContainEqual([
            prepared.workerID,
            "complete",
            "Worker completed issue #18 final report ingestion.",
          ])
          expect(graph?.taskPackets.map((packet) => [packet.id, packet.status])).toContainEqual([
            prepared.taskPacketID,
            "complete",
          ])
          expect(attempts).toEqual([
            expect.objectContaining({
              active_key: null,
              status: "complete",
              report_uri: "final-report.md",
            }),
          ])
          expect(summary?.artifacts.map((artifact) => artifact.id)).toContain(ingested.artifactHandles[0]?.id)
          expect(JSON.stringify(summary)).not.toContain("Worker final report body")
          expect(graph?.runs[0]?.metadata).toMatchObject({
            worker_report: {
              status: "complete",
              usage: {
                input_tokens: 100,
                output_tokens: 25,
                total_tokens: 125,
                cost_usd: 0.02,
                context_tokens: 2048,
              },
            },
          })
          expect(events).toEqual([
            expect.objectContaining({
              aggregate_type: "worker",
              aggregate_id: prepared.workerID,
              data: expect.objectContaining({
                status: "complete",
                usage: {
                  input_tokens: 100,
                  output_tokens: 25,
                  total_tokens: 125,
                  cost_usd: 0.02,
                  context_tokens: 2048,
                },
              }),
            }),
          ])
        }).pipe(Effect.provide(layer(tmp.path))),
      ),
    ),
  )

  it.live("opens a review gate when a final report needs parent review", () =>
    Effect.acquireRelease(
      Effect.promise(() => tmpdir()),
      (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
    ).pipe(
      Effect.flatMap((tmp) =>
        Effect.gen(function* () {
          const lightbulb = yield* Lightbulb.Service
          const database = yield* Database.Service
          const prepared = yield* prepareReportPacket(lightbulb, database)
          yield* lightbulb.launchWorker({
            accountID: prepared.accountID,
            workerID: prepared.workerID,
            taskPacketID: prepared.taskPacketID,
            trigger: "manual",
            status: "running",
            now: now + 3_000,
            cwd: "/tmp/lightbulb-worker-review",
            command: "lightbulb run --agent lightbulb-worker --format json",
          })

          const ingested = yield* lightbulb.ingestWorkerReport({
            accountID: prepared.accountID,
            runID: prepared.runID,
            workerID: prepared.workerID,
            taskPacketID: prepared.taskPacketID,
            status: "needs-review",
            summary: "Worker report is ready for parent review.",
            artifacts: [
              {
                uri: ".lightbulb/runs/issue-18-review.md",
                summary: "Worker report requiring parent review.",
              },
            ],
            verification: {
              commands: ["cd packages/core && bun test test/lightbulb-worker-report.test.ts"],
              summary: "Review-gate path covered.",
            },
            reviewer: "maintainer",
            reviewReason: "Parent should verify the report before integration.",
            now: now + 4_000,
          })
          const summary = yield* lightbulb.parentSummary(prepared.runID)
          const dashboard = yield* lightbulb.readDashboard(prepared.accountID)

          expect(ingested.reviewGate).toMatchObject({
            gateStatus: "pending",
            reviewStatus: "opened",
            targetKind: "artifact",
            targetArtifactID: ingested.artifactHandles[0]?.id,
            reviewer: "maintainer",
          })
          expect(summary).toMatchObject({
            status: "complete",
            reviewStatus: "requested",
            gateStatus: "pending",
          })
          expect(summary?.gates).toContainEqual(
            expect.objectContaining({
              id: ingested.reviewGate?.id,
              reviewGate: expect.objectContaining({
                status: "opened",
                targetKind: "artifact",
              }),
            }),
          )
          expect(dashboard?.inbox.gates).toContainEqual(
            expect.objectContaining({
              id: ingested.reviewGate?.id,
              reviewGate: expect.objectContaining({
                reviewer: "maintainer",
              }),
            }),
          )
        }).pipe(Effect.provide(layer(tmp.path))),
      ),
    ),
  )

  it.live("ingests failed and blocked worker reports with exact terminal state", () =>
    Effect.acquireRelease(
      Effect.promise(() => tmpdir()),
      (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
    ).pipe(
      Effect.flatMap((tmp) =>
        Effect.gen(function* () {
          const lightbulb = yield* Lightbulb.Service
          const database = yield* Database.Service
          const failed = yield* prepareReportPacket(lightbulb, database)
          const blocked = yield* prepareReportPacket(lightbulb, database)

          yield* lightbulb.ingestWorkerReport({
            accountID: failed.accountID,
            runID: failed.runID,
            workerID: failed.workerID,
            taskPacketID: failed.taskPacketID,
            status: "failed",
            summary: "Worker failed verification.",
            reason: "unit test failed",
            artifacts: [{ uri: ".lightbulb/runs/issue-18-failed.md", summary: "Failed worker report." }],
            verification: { commands: ["cd packages/core && bun test failing.test.ts"], summary: "Unit test failed." },
            now: now + 5_000,
          })
          yield* lightbulb.ingestWorkerReport({
            accountID: blocked.accountID,
            runID: blocked.runID,
            workerID: blocked.workerID,
            taskPacketID: blocked.taskPacketID,
            status: "blocked",
            summary: "Worker blocked on missing credential.",
            reason: "missing credential",
            artifacts: [{ uri: ".lightbulb/runs/issue-18-blocked.md", summary: "Blocked worker report." }],
            verification: { commands: ["cd packages/core && bun typecheck"], summary: "Typecheck not reached." },
            now: now + 6_000,
          })
          const failedGraph = yield* lightbulb.readAccountGraph(failed.accountID)
          const blockedGraph = yield* lightbulb.readAccountGraph(blocked.accountID)

          expect(failedGraph?.runs.map((run) => [run.id, run.status, run.gate_status])).toContainEqual([
            failed.runID,
            "failed",
            "failed",
          ])
          expect(failedGraph?.workers.map((worker) => [worker.id, worker.status])).toContainEqual([failed.workerID, "failed"])
          expect(failedGraph?.taskPackets.map((packet) => [packet.id, packet.status])).toContainEqual([
            failed.taskPacketID,
            "blocked",
          ])
          expect(blockedGraph?.runs.map((run) => [run.id, run.status, run.gate_status])).toContainEqual([
            blocked.runID,
            "blocked",
            "blocked",
          ])
          expect(blockedGraph?.workers.map((worker) => [worker.id, worker.status])).toContainEqual([blocked.workerID, "blocked"])
          expect(blockedGraph?.taskPackets.map((packet) => [packet.id, packet.status])).toContainEqual([
            blocked.taskPacketID,
            "blocked",
          ])
        }).pipe(Effect.provide(layer(tmp.path))),
      ),
    ),
  )

  it.live("rejects reports with missing evidence, wrong lineage, or raw transcript content", () =>
    Effect.acquireRelease(
      Effect.promise(() => tmpdir()),
      (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
    ).pipe(
      Effect.flatMap((tmp) =>
        Effect.gen(function* () {
          const lightbulb = yield* Lightbulb.Service
          const database = yield* Database.Service
          const prepared = yield* prepareReportPacket(lightbulb, database)
          const otherRun = yield* lightbulb.admitLoopRun({
            accountID: prepared.accountID,
            loopID: prepared.loopID,
            trigger: "manual",
            now: now + 10_000,
          })
          if (otherRun.outcome !== "admitted") return yield* Effect.die(new Error("expected second admitted run"))
          const otherWorkerID = Lightbulb.WorkerID.create()
          yield* database.db
            .insert(LightbulbWorkerTable)
            .values({
              id: otherWorkerID,
              account_id: prepared.accountID,
              run_id: otherRun.runID,
              role: "bounded implementation worker",
              status: "queued",
              summary: "Wrong run worker.",
            })
            .run()
            .pipe(Effect.orDie)

          const missingEvidence = yield* lightbulb
            .ingestWorkerReport({
              accountID: prepared.accountID,
              runID: prepared.runID,
              workerID: prepared.workerID,
              taskPacketID: prepared.taskPacketID,
              status: "complete",
              summary: "Missing verification commands.",
              artifacts: [{ uri: ".lightbulb/runs/missing-evidence.md", summary: "Missing evidence report." }],
              verification: { commands: [], summary: "No commands." },
              now,
            })
            .pipe(Effect.flip)
          const wrongWorker = yield* lightbulb
            .ingestWorkerReport({
              accountID: prepared.accountID,
              runID: prepared.runID,
              workerID: otherWorkerID,
              taskPacketID: prepared.taskPacketID,
              status: "complete",
              summary: "Wrong worker.",
              artifacts: [{ uri: ".lightbulb/runs/wrong-worker.md", summary: "Wrong worker report." }],
              verification: { commands: ["cd packages/core && bun typecheck"], summary: "Would pass." },
              now,
            })
            .pipe(Effect.flip)
          const rawTranscript = yield* lightbulb
            .ingestWorkerReport({
              accountID: prepared.accountID,
              runID: prepared.runID,
              workerID: prepared.workerID,
              taskPacketID: prepared.taskPacketID,
              status: "complete",
              summary: "Raw transcript should not be ingested.",
              artifacts: [{ uri: ".lightbulb/runs/raw-transcript.md", summary: "Raw transcript report." }],
              verification: { commands: ["cd packages/core && bun typecheck"], summary: "Would pass." },
              rawTranscript: "transcript ".repeat(1_000),
              now,
            })
            .pipe(Effect.flip)
          const rawArtifactMetadata = yield* lightbulb
            .ingestWorkerReport({
              accountID: prepared.accountID,
              runID: prepared.runID,
              workerID: prepared.workerID,
              taskPacketID: prepared.taskPacketID,
              status: "complete",
              summary: "Raw transcript metadata should not be ingested.",
              artifacts: [
                {
                  uri: ".lightbulb/runs/raw-artifact-metadata.md",
                  summary: "Raw artifact metadata report.",
                  metadata: { raw_transcript: "user: full child transcript" },
                },
              ],
              verification: { commands: ["cd packages/core && bun typecheck"], summary: "Would pass." },
              now,
            })
            .pipe(Effect.flip)
          const invalidUsage = yield* lightbulb
            .ingestWorkerReport({
              accountID: prepared.accountID,
              runID: prepared.runID,
              workerID: prepared.workerID,
              taskPacketID: prepared.taskPacketID,
              status: "complete",
              summary: "Invalid usage should not be ingested.",
              artifacts: [{ uri: ".lightbulb/runs/invalid-usage.md", summary: "Invalid usage report." }],
              verification: { commands: ["cd packages/core && bun typecheck"], summary: "Would pass." },
              usage: { costUsd: -1 },
              now,
            })
            .pipe(Effect.flip)

          expect(missingEvidence.reason).toBe("worker report verification commands are required")
          expect(wrongWorker.reason).toBe("worker report worker does not belong to run")
          expect(rawTranscript.reason).toBe("worker report ingestion does not accept raw transcript content")
          expect(rawArtifactMetadata.reason).toBe("worker report artifact metadata must not include raw transcript content")
          expect(invalidUsage.reason).toBe("worker report usage costUsd must be a non-negative finite number")
        }).pipe(Effect.provide(layer(tmp.path))),
      ),
    ),
  )
})

function prepareReportPacket(lightbulb: Lightbulb.Interface, database: Database.Interface) {
  return Effect.gen(function* () {
    const suffix = Lightbulb.EventID.create()
    const created = yield* lightbulb.createOrAdoptGoal({
      accountName: "Worker Report Account " + suffix,
      title: "Trace worker reports " + suffix,
      objective: "Ingest final worker reports into durable Lightbulb state.",
    })
    const loopID = Lightbulb.loopIDForProfile(created.goal.id, "implementation")
    yield* lightbulb.bootstrapLoopProfiles({
      accountID: created.goal.account_id,
      goalID: created.goal.id,
      profiles: [
        {
          profileID: "implementation",
          kind: "implementation",
          summary: "Implementation loop dispatches report-producing workers.",
          schedule: { cadenceMs: 1_000 },
        },
      ],
      defaultPolicy,
      now,
    })
    const admitted = yield* lightbulb.admitLoopRun({
      accountID: created.goal.account_id,
      loopID,
      trigger: "schedule",
      now: now + 2_000,
    })
    if (admitted.outcome !== "admitted") return yield* Effect.die(new Error("expected admitted run"))

    const workerID = Lightbulb.WorkerID.create()
    const taskPacketID = Lightbulb.TaskPacketID.create()
    yield* database.db
      .insert(LightbulbWorkerTable)
      .values({
        id: workerID,
        account_id: created.goal.account_id,
        run_id: admitted.runID,
        role: "bounded implementation worker",
        status: "queued",
        summary: "Worker should return a final report.",
      })
      .run()
      .pipe(Effect.orDie)
    yield* database.db
      .insert(LightbulbTaskPacketTable)
      .values({
        id: taskPacketID,
        account_id: created.goal.account_id,
        worker_id: workerID,
        title: "Return final report",
        status: "ready",
        instructions: "Return a compact final report with artifact handles and verification evidence.",
      })
      .run()
      .pipe(Effect.orDie)

    return {
      accountID: created.goal.account_id,
      goalID: created.goal.id,
      loopID,
      runID: admitted.runID,
      workerID,
      taskPacketID,
    }
  })
}
