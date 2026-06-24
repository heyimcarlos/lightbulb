import path from "path"
import { describe, expect } from "bun:test"
import { asc, eq } from "drizzle-orm"
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

const now = Date.UTC(2026, 0, 2)

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
  const database = Database.layerFromPath(path.join(directory, "lightbulb-worker-launch.db")).pipe(Layer.fresh)
  return Layer.mergeAll(database, Lightbulb.layer.pipe(Layer.provide(database)))
}

describe("Lightbulb worker launch attempts", () => {
  it.live("records an active launch attempt and reuses it on retry", () =>
    Effect.acquireRelease(
      Effect.promise(() => tmpdir()),
      (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
    ).pipe(
      Effect.flatMap((tmp) =>
        Effect.gen(function* () {
          const lightbulb = yield* Lightbulb.Service
          const database = yield* Database.Service
          const prepared = yield* prepareLaunchPacket(lightbulb, database)

          const launched = yield* lightbulb.launchWorker({
            accountID: prepared.accountID,
            workerID: prepared.workerID,
            taskPacketID: prepared.taskPacketID,
            trigger: "scheduler",
            now: now + 3_000,
            cwd: "/tmp/lightbulb-worker-17",
            worktreeID: "issue-17",
            command: "lightbulb run --agent lightbulb-worker --format json",
            profileID: "implementation",
            sessionID: "session-worker-17",
            processID: 12345,
            heartbeatURI: ".lightbulb/worker-17/heartbeat.json",
            logURI: ".lightbulb/worker-17/launch.log",
            reportURI: ".lightbulb/runs/issue-17-worker.md",
            metadata: {
              issueRef: "#17",
            },
          })
          const retried = yield* lightbulb.launchWorker({
            accountID: prepared.accountID,
            workerID: prepared.workerID,
            taskPacketID: prepared.taskPacketID,
            trigger: "scheduler",
            now: now + 3_100,
            cwd: "/tmp/lightbulb-worker-17",
            command: "lightbulb run --agent lightbulb-worker --format json",
          })
          const graph = yield* lightbulb.readAccountGraph(prepared.accountID)
          const summary = yield* lightbulb.parentSummary(prepared.runID)
          const dashboard = yield* lightbulb.readDashboard(prepared.accountID)
          const events = yield* database.db
            .select()
            .from(LightbulbEventTable)
            .where(eq(LightbulbEventTable.aggregate_type, "worker_launch_attempt"))
            .all()
            .pipe(Effect.orDie)

          expect(launched).toMatchObject({
            outcome: "launched",
            attempt: {
              runID: prepared.runID,
              workerID: prepared.workerID,
              taskPacketID: prepared.taskPacketID,
              status: "running",
              trigger: "scheduler",
              cwd: "/tmp/lightbulb-worker-17",
              worktreeID: "issue-17",
              command: "lightbulb run --agent lightbulb-worker --format json",
              profileID: "implementation",
              sessionID: "session-worker-17",
              processID: 12345,
              heartbeatURI: ".lightbulb/worker-17/heartbeat.json",
              logURI: ".lightbulb/worker-17/launch.log",
              reportURI: ".lightbulb/runs/issue-17-worker.md",
              metadata: {
                issueRef: "#17",
              },
            },
          })
          expect(retried).toMatchObject({
            outcome: "already_active",
            attempt: {
              id: launched.outcome === "launched" ? launched.attempt.id : undefined,
            },
          })
          expect(graph?.runs.map((run) => [run.id, run.status])).toContainEqual([prepared.runID, "running"])
          expect(graph?.workers.map((worker) => [worker.id, worker.status])).toContainEqual([prepared.workerID, "running"])
          expect(graph?.taskPackets.map((packet) => [packet.id, packet.status])).toContainEqual([
            prepared.taskPacketID,
            "claimed",
          ])
          expect(graph?.workerLaunchAttempts).toHaveLength(1)
          expect(summary?.workers[0]?.launchAttempts).toEqual([
            expect.objectContaining({
              id: launched.outcome === "launched" ? launched.attempt.id : undefined,
              status: "running",
              logURI: ".lightbulb/worker-17/launch.log",
            }),
          ])
          expect(dashboard?.goals[0]?.loops[0]?.runs[0]?.workers[0]?.launchAttempts).toEqual(
            summary?.workers[0]?.launchAttempts,
          )
          expect(events.map((event) => event.type)).toEqual([
            "lightbulb.worker_launch.running",
            "lightbulb.worker_launch.already_active",
          ])
          expect(JSON.stringify(summary)).not.toContain("transcript")
          expect(JSON.stringify(dashboard)).not.toContain("transcript")
        }).pipe(Effect.provide(layer(tmp.path))),
      ),
    ),
  )

  it.live("marks a running launch attempt complete and clears active ownership", () =>
    Effect.acquireRelease(
      Effect.promise(() => tmpdir()),
      (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
    ).pipe(
      Effect.flatMap((tmp) =>
        Effect.gen(function* () {
          const lightbulb = yield* Lightbulb.Service
          const database = yield* Database.Service
          const prepared = yield* prepareLaunchPacket(lightbulb, database)

          const running = yield* lightbulb.launchWorker({
            accountID: prepared.accountID,
            workerID: prepared.workerID,
            taskPacketID: prepared.taskPacketID,
            trigger: "scheduler",
            now: now + 3_000,
            status: "running",
            cwd: "/tmp/lightbulb-worker-complete",
            command: "lightbulb run --agent lightbulb-worker --format json",
            processID: 22222,
            reportURI: ".lightbulb/runs/issue-9-worker.md",
          })
          const completed = yield* lightbulb.launchWorker({
            accountID: prepared.accountID,
            workerID: prepared.workerID,
            taskPacketID: prepared.taskPacketID,
            trigger: "scheduler",
            now: now + 3_100,
            status: "complete",
            cwd: "/tmp/lightbulb-worker-complete",
            command: "lightbulb run --agent lightbulb-worker --format json",
            summary: "Worker completed and produced a final-report handle.",
          })
          const retried = yield* lightbulb.launchWorker({
            accountID: prepared.accountID,
            workerID: prepared.workerID,
            taskPacketID: prepared.taskPacketID,
            trigger: "scheduler",
            now: now + 3_200,
            cwd: "/tmp/lightbulb-worker-complete",
            command: "lightbulb run --agent lightbulb-worker --format json",
          })
          const attempts = yield* database.db
            .select()
            .from(LightbulbWorkerLaunchAttemptTable)
            .where(eq(LightbulbWorkerLaunchAttemptTable.worker_id, prepared.workerID))
            .all()
            .pipe(Effect.orDie)
          const events = yield* database.db
            .select()
            .from(LightbulbEventTable)
            .where(eq(LightbulbEventTable.aggregate_type, "worker_launch_attempt"))
            .orderBy(asc(LightbulbEventTable.time_created))
            .all()
            .pipe(Effect.orDie)
          const graph = yield* lightbulb.readAccountGraph(prepared.accountID)
          const summary = yield* lightbulb.parentSummary(prepared.runID)

          if (running.outcome !== "launched" || completed.outcome !== "launched") throw new Error("expected launched attempts")
          expect(completed.attempt).toMatchObject({
            id: running.attempt.id,
            status: "complete",
            processID: 22222,
            reportURI: ".lightbulb/runs/issue-9-worker.md",
          })
          expect(retried).toMatchObject({
            outcome: "skipped",
            reason: "run_not_runnable",
          })
          expect(attempts).toEqual([
            expect.objectContaining({
              id: running.attempt.id,
              active_key: null,
              status: "complete",
              summary: "Worker completed and produced a final-report handle.",
            }),
          ])
          expect(events.map((event) => event.type)).toEqual([
            "lightbulb.worker_launch.running",
            "lightbulb.worker_launch.completed",
          ])
          expect(graph?.runs.map((run) => [run.id, run.status, run.gate_status, run.summary])).toContainEqual([
            prepared.runID,
            "complete",
            "pending",
            "Worker completed and produced a final-report handle.",
          ])
          expect(graph?.workers.map((worker) => [worker.id, worker.status])).toContainEqual([prepared.workerID, "complete"])
          expect(graph?.taskPackets.map((packet) => [packet.id, packet.status])).toContainEqual([
            prepared.taskPacketID,
            "complete",
          ])
          expect(summary?.workers).toContainEqual(
            expect.objectContaining({
              id: prepared.workerID,
              status: "complete",
            }),
          )
        }).pipe(Effect.provide(layer(tmp.path))),
      ),
    ),
  )

  it.live("refreshes a requested launch attempt with the running process handle", () =>
    Effect.acquireRelease(
      Effect.promise(() => tmpdir()),
      (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
    ).pipe(
      Effect.flatMap((tmp) =>
        Effect.gen(function* () {
          const lightbulb = yield* Lightbulb.Service
          const database = yield* Database.Service
          const prepared = yield* prepareLaunchPacket(lightbulb, database)

          const requested = yield* lightbulb.launchWorker({
            accountID: prepared.accountID,
            workerID: prepared.workerID,
            taskPacketID: prepared.taskPacketID,
            trigger: "manual",
            now: now + 3_200,
            status: "requested",
            issueRef: "#22",
            cwd: "/tmp/lightbulb-worker-refresh",
            worktreeID: "issue-22",
            command: "lightbulb run --agent lightbulb-worker --format json",
            profileID: "implementation",
            heartbeatURI: ".lightbulb/worker-refresh/heartbeat.json",
          })
          const running = yield* lightbulb.launchWorker({
            accountID: prepared.accountID,
            workerID: prepared.workerID,
            taskPacketID: prepared.taskPacketID,
            trigger: "manual",
            now: now + 3_300,
            status: "running",
            issueRef: "#22",
            cwd: "/tmp/lightbulb-worker-refresh",
            worktreeID: "issue-22",
            command: "lightbulb run --agent lightbulb-worker --format json",
            profileID: "implementation",
            sessionID: "session-worker-refresh",
            processID: 4242,
            heartbeatURI: ".lightbulb/worker-refresh/heartbeat.json",
            logURI: ".lightbulb/worker-refresh/launch.log",
            reportURI: ".lightbulb/runs/issue-22-worker.md",
          })
          const attempts = yield* database.db
            .select()
            .from(LightbulbWorkerLaunchAttemptTable)
            .where(eq(LightbulbWorkerLaunchAttemptTable.worker_id, prepared.workerID))
            .all()
            .pipe(Effect.orDie)
          const events = yield* database.db
            .select()
            .from(LightbulbEventTable)
            .where(eq(LightbulbEventTable.aggregate_type, "worker_launch_attempt"))
            .orderBy(asc(LightbulbEventTable.time_created))
            .all()
            .pipe(Effect.orDie)
          const graph = yield* lightbulb.readAccountGraph(prepared.accountID)

          expect(running).toMatchObject({
            outcome: "launched",
            attempt: {
              id: requested.outcome === "launched" ? requested.attempt.id : undefined,
              status: "running",
              sessionID: "session-worker-refresh",
              processID: 4242,
              logURI: ".lightbulb/worker-refresh/launch.log",
              reportURI: ".lightbulb/runs/issue-22-worker.md",
            },
          })
          expect(attempts).toEqual([
            expect.objectContaining({
              id: requested.outcome === "launched" ? requested.attempt.id : undefined,
              status: "running",
              active_key: prepared.accountID + ":" + prepared.taskPacketID,
              session_id: "session-worker-refresh",
              process_id: 4242,
              time_updated: now + 3_300,
            }),
          ])
          expect(graph?.workerLaunchAttempts).toHaveLength(1)
          expect(graph?.workers.map((worker) => [worker.id, worker.status])).toContainEqual([prepared.workerID, "running"])
          expect(graph?.taskPackets.map((packet) => [packet.id, packet.status])).toContainEqual([
            prepared.taskPacketID,
            "claimed",
          ])
          expect(events.map((event) => event.type)).toEqual([
            "lightbulb.worker_launch.requested",
            "lightbulb.worker_launch.running",
          ])
        }).pipe(Effect.provide(layer(tmp.path))),
      ),
    ),
  )

  it.live("records failed launch attempts as terminal evidence", () =>
    Effect.acquireRelease(
      Effect.promise(() => tmpdir()),
      (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
    ).pipe(
      Effect.flatMap((tmp) =>
        Effect.gen(function* () {
          const lightbulb = yield* Lightbulb.Service
          const database = yield* Database.Service
          const prepared = yield* prepareLaunchPacket(lightbulb, database)

          const failed = yield* lightbulb.launchWorker({
            accountID: prepared.accountID,
            workerID: prepared.workerID,
            taskPacketID: prepared.taskPacketID,
            trigger: "manual",
            now: now + 4_000,
            status: "launch_failed",
            cwd: "/tmp/lightbulb-worker-failed",
            command: "lightbulb run --agent missing-worker --format json",
            logURI: ".lightbulb/worker-failed/launch.log",
            failureReason: "worker command not found",
          })
          const attempts = yield* database.db
            .select()
            .from(LightbulbWorkerLaunchAttemptTable)
            .where(eq(LightbulbWorkerLaunchAttemptTable.worker_id, prepared.workerID))
            .all()
            .pipe(Effect.orDie)
          const events = yield* database.db
            .select()
            .from(LightbulbEventTable)
            .where(eq(LightbulbEventTable.type, "lightbulb.worker_launch.failed"))
            .all()
            .pipe(Effect.orDie)
          const graph = yield* lightbulb.readAccountGraph(prepared.accountID)

          expect(failed).toMatchObject({
            outcome: "launched",
            attempt: {
              status: "launch_failed",
              trigger: "manual",
              failureReason: "worker command not found",
            },
          })
          expect(attempts).toEqual([
            expect.objectContaining({
              status: "launch_failed",
              active_key: null,
              failure_reason: "worker command not found",
            }),
          ])
          expect(graph?.workers.map((worker) => [worker.id, worker.status])).toContainEqual([prepared.workerID, "failed"])
          expect(graph?.runs.map((run) => [run.id, run.status, run.gate_status, run.summary])).toContainEqual([
            prepared.runID,
            "failed",
            "failed",
            "Worker launch failed before a runnable process was established.",
          ])
          expect(graph?.taskPackets.map((packet) => [packet.id, packet.status])).toContainEqual([
            prepared.taskPacketID,
            "blocked",
          ])
          expect(events).toEqual([
            expect.objectContaining({
              aggregate_type: "worker_launch_attempt",
              data: expect.objectContaining({
                worker_id: prepared.workerID,
                task_packet_id: prepared.taskPacketID,
                status: "launch_failed",
                failure_reason: "worker command not found",
              }),
            }),
          ])
        }).pipe(Effect.provide(layer(tmp.path))),
      ),
    ),
  )

  it.live("blocks held launch requests with exact skipped reasons", () =>
    Effect.acquireRelease(
      Effect.promise(() => tmpdir()),
      (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
    ).pipe(
      Effect.flatMap((tmp) =>
        Effect.gen(function* () {
          const lightbulb = yield* Lightbulb.Service
          const database = yield* Database.Service
          const launches = yield* Effect.all(
            ([
              {
                holdReason: "budget_held",
                summary: "Budget hold prevented launch.",
              },
              {
                holdReason: "dependency_held",
                summary: "Dependency hold prevented launch.",
              },
              {
                holdReason: "human_review_held",
                summary: "Human review hold prevented launch.",
              },
              {
                holdReason: "context_policy_held",
                summary: "Context policy hold prevented launch.",
              },
            ] satisfies readonly { readonly holdReason: Lightbulb.WorkerLaunchHoldReason; readonly summary: string }[]).map(
              (hold, index) => launchHeldPacket(lightbulb, database, hold, index),
            ),
            { concurrency: 1 },
          )
          const prepared = launches[0]!.prepared
          const attempts = yield* database.db
            .select()
            .from(LightbulbWorkerLaunchAttemptTable)
            .all()
            .pipe(Effect.orDie)
          const events = yield* database.db
            .select()
            .from(LightbulbEventTable)
            .where(eq(LightbulbEventTable.type, "lightbulb.worker_launch.skipped"))
            .orderBy(asc(LightbulbEventTable.time_created))
            .all()
            .pipe(Effect.orDie)
          const graph = yield* lightbulb.readAccountGraph(prepared.accountID)

          expect(launches.map((launch) => launch.skipped)).toEqual([
            expect.objectContaining({ outcome: "skipped", reason: "budget_held" }),
            expect.objectContaining({ outcome: "skipped", reason: "dependency_held" }),
            expect.objectContaining({ outcome: "skipped", reason: "human_review_held" }),
            expect.objectContaining({ outcome: "skipped", reason: "context_policy_held" }),
          ])
          expect(attempts).toEqual([])
          expect(graph?.runs.map((run) => [run.id, run.status, run.gate_status, run.summary])).toContainEqual([
            prepared.runID,
            "blocked",
            "blocked",
            "Budget hold prevented launch.",
          ])
          expect(graph?.workers.map((worker) => [worker.id, worker.status, worker.summary])).toContainEqual([
            prepared.workerID,
            "blocked",
            "Budget hold prevented launch.",
          ])
          expect(graph?.taskPackets.map((packet) => [packet.id, packet.status])).toContainEqual([
            prepared.taskPacketID,
            "blocked",
          ])
          expect(events.map((event) => event.data.reason)).toEqual([
            "budget_held",
            "dependency_held",
            "human_review_held",
            "context_policy_held",
          ])
          expect(events[0]).toEqual(
            expect.objectContaining({
              aggregate_type: "run",
              aggregate_id: prepared.runID,
              data: expect.objectContaining({
                run_id: prepared.runID,
                worker_id: prepared.workerID,
                task_packet_id: prepared.taskPacketID,
                issue_ref: "#22",
                work_item_ref: "github:heyimcarlos/lightbulb/issues/22",
                environment_summary: {
                  profile: "implementation",
                  secrets: "redacted",
                },
                reason: "budget_held",
                hold_reason: "budget_held",
              }),
            }),
          )
        }).pipe(Effect.provide(layer(tmp.path))),
      ),
    ),
  )

  it.live("preserves hold reasons from blocked durable task packet metadata", () =>
    Effect.acquireRelease(
      Effect.promise(() => tmpdir()),
      (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
    ).pipe(
      Effect.flatMap((tmp) =>
        Effect.gen(function* () {
          const lightbulb = yield* Lightbulb.Service
          const database = yield* Database.Service
          const prepared = yield* prepareLaunchPacket(lightbulb, database)

          yield* database.db
            .update(LightbulbTaskPacketTable)
            .set({
              status: "blocked",
              metadata: {
                launch_hold: {
                  reason: "dependency_held",
                  dependency: "#9",
                },
              },
              time_updated: now + 5_900,
            })
            .where(eq(LightbulbTaskPacketTable.id, prepared.taskPacketID))
            .run()
            .pipe(Effect.orDie)

          const skipped = yield* lightbulb.launchWorker({
            accountID: prepared.accountID,
            workerID: prepared.workerID,
            taskPacketID: prepared.taskPacketID,
            trigger: "recovery",
            now: now + 6_000,
            cwd: "/tmp/lightbulb-worker-held",
            command: "lightbulb run --agent lightbulb-worker --format json",
          })
          const attempts = yield* database.db
            .select()
            .from(LightbulbWorkerLaunchAttemptTable)
            .all()
            .pipe(Effect.orDie)
          const events = yield* database.db
            .select()
            .from(LightbulbEventTable)
            .where(eq(LightbulbEventTable.type, "lightbulb.worker_launch.skipped"))
            .all()
            .pipe(Effect.orDie)

          expect(skipped).toMatchObject({
            outcome: "skipped",
            reason: "dependency_held",
          })
          expect(attempts).toEqual([])
          expect(events).toEqual([
            expect.objectContaining({
              aggregate_type: "run",
              aggregate_id: prepared.runID,
              data: expect.objectContaining({
                trigger: "recovery",
                reason: "dependency_held",
              }),
            }),
          ])
        }).pipe(Effect.provide(layer(tmp.path))),
      ),
    ),
  )

  it.live("records requested, launching, and blocked launch attempt handles without process IDs", () =>
    Effect.acquireRelease(
      Effect.promise(() => tmpdir()),
      (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
    ).pipe(
      Effect.flatMap((tmp) =>
        Effect.gen(function* () {
          const lightbulb = yield* Lightbulb.Service
          const database = yield* Database.Service
          const requestedPacket = yield* prepareLaunchPacket(lightbulb, database)
          const launchingPacket = yield* prepareLaunchPacket(lightbulb, database)
          const blockedPacket = yield* prepareLaunchPacket(lightbulb, database)

          const requested = yield* lightbulb.launchWorker({
            accountID: requestedPacket.accountID,
            workerID: requestedPacket.workerID,
            taskPacketID: requestedPacket.taskPacketID,
            trigger: "manual",
            now: now + 6_000,
            status: "requested",
            issueRef: "#22",
            cwd: "/tmp/lightbulb-worker-requested",
            command: "lightbulb run --agent lightbulb-worker --format json",
          })
          const launching = yield* lightbulb.launchWorker({
            accountID: launchingPacket.accountID,
            workerID: launchingPacket.workerID,
            taskPacketID: launchingPacket.taskPacketID,
            trigger: "manual",
            now: now + 6_100,
            status: "launching",
            issueRef: "#22",
            cwd: "/tmp/lightbulb-worker-launching",
            command: "lightbulb run --agent lightbulb-worker --format json",
          })
          const blocked = yield* lightbulb.launchWorker({
            accountID: blockedPacket.accountID,
            workerID: blockedPacket.workerID,
            taskPacketID: blockedPacket.taskPacketID,
            trigger: "manual",
            now: now + 6_200,
            status: "blocked",
            issueRef: "#22",
            cwd: "/tmp/lightbulb-worker-blocked",
            command: "lightbulb run --agent lightbulb-worker --format json",
            failureReason: "human_review_held",
          })
          const events = yield* database.db
            .select()
            .from(LightbulbEventTable)
            .where(eq(LightbulbEventTable.aggregate_type, "worker_launch_attempt"))
            .orderBy(asc(LightbulbEventTable.time_created))
            .all()
            .pipe(Effect.orDie)
          const requestedGraph = yield* lightbulb.readAccountGraph(requestedPacket.accountID)
          const launchingGraph = yield* lightbulb.readAccountGraph(launchingPacket.accountID)
          const blockedGraph = yield* lightbulb.readAccountGraph(blockedPacket.accountID)

          expect(requested).toMatchObject({
            outcome: "launched",
            attempt: {
              status: "requested",
              processID: null,
              sessionID: null,
            },
          })
          expect(launching).toMatchObject({
            outcome: "launched",
            attempt: {
              status: "launching",
              processID: null,
              sessionID: null,
            },
          })
          expect(blocked).toMatchObject({
            outcome: "launched",
            attempt: {
              status: "blocked",
              failureReason: "human_review_held",
            },
          })
          expect(requested.outcome === "launched" ? requested.attempt.metadata : null).toMatchObject({
            launch_hold_reason: null,
            issue_ref: "#22",
            work_item_ref: null,
            environment_summary: null,
          })
          expect(requested.outcome === "launched" ? requested.attempt.ownershipKeys : []).toContainEqual(
            expect.objectContaining({
              kind: "issue",
              key: "issue:#22",
            }),
          )
          expect(events.map((event) => event.type)).toEqual([
            "lightbulb.worker_launch.requested",
            "lightbulb.worker_launch.launching",
            "lightbulb.worker_launch.blocked",
          ])
          expect(requestedGraph?.runs.map((run) => [run.id, run.status, run.gate_status])).toContainEqual([
            requestedPacket.runID,
            "running",
            "pending",
          ])
          expect(launchingGraph?.runs.map((run) => [run.id, run.status, run.gate_status])).toContainEqual([
            launchingPacket.runID,
            "running",
            "pending",
          ])
          expect(blockedGraph?.runs.map((run) => [run.id, run.status, run.gate_status])).toContainEqual([
            blockedPacket.runID,
            "blocked",
            "blocked",
          ])
        }).pipe(Effect.provide(layer(tmp.path))),
      ),
    ),
  )

  it.live("skips missing and mismatched durable launch dependencies", () =>
    Effect.acquireRelease(
      Effect.promise(() => tmpdir()),
      (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
    ).pipe(
      Effect.flatMap((tmp) =>
        Effect.gen(function* () {
          const lightbulb = yield* Lightbulb.Service
          const database = yield* Database.Service
          const missingWorkerPacket = yield* prepareLaunchPacket(lightbulb, database)
          const mismatchedPacket = yield* prepareLaunchPacket(lightbulb, database)

          const missingWorker = yield* lightbulb.launchWorker({
            accountID: missingWorkerPacket.accountID,
            workerID: Lightbulb.WorkerID.create(),
            taskPacketID: missingWorkerPacket.taskPacketID,
            trigger: "recovery",
            now: now + 7_000,
            cwd: "/tmp/lightbulb-worker-missing",
            command: "lightbulb run --agent lightbulb-worker --format json",
          })
          const missingTaskPacket = yield* lightbulb.launchWorker({
            accountID: mismatchedPacket.accountID,
            workerID: mismatchedPacket.workerID,
            taskPacketID: Lightbulb.TaskPacketID.create(),
            trigger: "recovery",
            now: now + 7_100,
            cwd: "/tmp/lightbulb-worker-mismatch",
            command: "lightbulb run --agent lightbulb-worker --format json",
          })
          const attempts = yield* database.db
            .select()
            .from(LightbulbWorkerLaunchAttemptTable)
            .all()
            .pipe(Effect.orDie)
          const events = yield* database.db
            .select()
            .from(LightbulbEventTable)
            .where(eq(LightbulbEventTable.type, "lightbulb.worker_launch.skipped"))
            .orderBy(asc(LightbulbEventTable.time_created))
            .all()
            .pipe(Effect.orDie)

          expect(missingWorker).toMatchObject({
            outcome: "skipped",
            reason: "missing_worker",
          })
          expect(missingTaskPacket).toMatchObject({
            outcome: "skipped",
            reason: "missing_task_packet",
          })
          expect(attempts).toEqual([])
          expect(events.map((event) => event.data.reason)).toEqual(["missing_worker", "missing_task_packet"])
          expect(events.map((event) => event.aggregate_type)).toEqual(["account", "run"])
          expect(events[1]).toEqual(
            expect.objectContaining({
              aggregate_id: mismatchedPacket.runID,
              data: expect.objectContaining({
                goal_id: mismatchedPacket.goalID,
                loop_id: mismatchedPacket.loopID,
                run_id: mismatchedPacket.runID,
              }),
            }),
          )
        }).pipe(Effect.provide(layer(tmp.path))),
      ),
    ),
  )
})

function launchHeldPacket(
  lightbulb: Lightbulb.Interface,
  database: Database.Interface,
  hold: { readonly holdReason: Lightbulb.WorkerLaunchHoldReason; readonly summary: string },
  index: number,
) {
  return Effect.gen(function* () {
    const prepared = yield* prepareLaunchPacket(lightbulb, database)
    const skipped = yield* lightbulb.launchWorker({
      accountID: prepared.accountID,
      workerID: prepared.workerID,
      taskPacketID: prepared.taskPacketID,
      trigger: "scheduler",
      now: now + 5_000 + index,
      holdReason: hold.holdReason,
      issueRef: "#22",
      workItemRef: "github:heyimcarlos/lightbulb/issues/22",
      environmentSummary: {
        profile: "implementation",
        secrets: "redacted",
      },
      summary: hold.summary,
      cwd: "/tmp/lightbulb-worker-held",
      command: "lightbulb run --agent lightbulb-worker --format json",
    })
    return { prepared, skipped }
  })
}

function prepareLaunchPacket(lightbulb: Lightbulb.Interface, database: Database.Interface) {
  return Effect.gen(function* () {
    const suffix = Lightbulb.EventID.create()
    const created = yield* lightbulb.createOrAdoptGoal({
      accountName: "Worker Launch Account " + suffix,
      title: "Trace worker launches " + suffix,
      objective: "Bind worker processes to durable runs.",
    })
    const loopID = Lightbulb.loopIDForProfile(created.goal.id, "implementation")
    yield* lightbulb.bootstrapLoopProfiles({
      accountID: created.goal.account_id,
      goalID: created.goal.id,
      profiles: [
        {
          profileID: "implementation",
          kind: "implementation",
          summary: "Implementation loop dispatches workers.",
          schedule: {
            cadenceMs: 1_000,
          },
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
        summary: "Launch adapter should claim this worker.",
      })
      .run()
      .pipe(Effect.orDie)
    yield* database.db
      .insert(LightbulbTaskPacketTable)
      .values({
        id: taskPacketID,
        account_id: created.goal.account_id,
        worker_id: workerID,
        title: "Implement durable launch evidence",
        status: "ready",
        instructions: "Record launch handles before worker execution.",
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
