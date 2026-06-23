import path from "path"
import { describe, expect } from "bun:test"
import { asc, eq } from "drizzle-orm"
import { Effect, Layer } from "effect"
import { Database } from "@opencode-ai/core/database/database"
import { Lightbulb } from "@opencode-ai/core/lightbulb"
import {
  LightbulbEventTable,
  LightbulbRunTable,
  LightbulbTaskPacketTable,
  LightbulbWorkerLaunchAttemptTable,
  LightbulbWorkerTable,
} from "@opencode-ai/core/lightbulb/sql"
import { tmpdir } from "./fixture/tmpdir"
import { it } from "./lib/effect"

const now = Date.UTC(2026, 0, 3)

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
  const database = Database.layerFromPath(path.join(directory, "lightbulb-loop-runner-tick.db")).pipe(Layer.fresh)
  return Layer.mergeAll(database, Lightbulb.layer.pipe(Layer.provide(database)))
}

describe("Lightbulb account loop runner tick", () => {
  it.live("launches one ready issue through a durable run, task packet, worker request, and journal", () =>
    Effect.acquireRelease(
      Effect.promise(() => tmpdir()),
      (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
    ).pipe(
      Effect.flatMap((tmp) =>
        Effect.gen(function* () {
          const lightbulb = yield* Lightbulb.Service
          const database = yield* Database.Service
          const prepared = yield* prepareDueLoop(lightbulb, "runner-launch")

          const result = yield* lightbulb.runAccountLoopTick({
            accountID: prepared.accountID,
            tickID: "runner-tick-launch",
            now: now + 2_000,
            issues: [readyIssue(prepared.accountID, "#26", "Slice 18: account loop runner tick")],
            cwd: "/tmp/lightbulb-issue-26",
            worktreeID: "issue-26",
            command: "lightbulb run --agent lightbulb-worker --format json",
          })
          const graph = yield* lightbulb.readAccountGraph(prepared.accountID)
          const events = yield* database.db
            .select()
            .from(LightbulbEventTable)
            .where(eq(LightbulbEventTable.aggregate_type, "account_loop_runner_tick"))
            .all()
            .pipe(Effect.orDie)
          if (!result.selectedRunID || !result.workerID || !result.taskPacketID) throw new Error("expected runner tick handles")

          expect(result).toMatchObject({
            outcome: "launched",
            reason: "launched",
            replayed: false,
            selectedLoopID: prepared.loopID,
            issueRef: "#26",
            nextWakeAt: now + 3_000,
          })
          expect(graph?.runs.map((run) => [run.id, run.status])).toEqual([[result.selectedRunID, "running"]])
          expect(graph?.workers.map((worker) => [worker.id, worker.status])).toEqual([[result.workerID, "running"]])
          expect(graph?.taskPackets.map((packet) => [packet.id, packet.status, packet.title])).toEqual([
            [result.taskPacketID, "claimed", "Slice 18: account loop runner tick"],
          ])
          expect(graph?.workerLaunchAttempts.map((attempt) => [attempt.task_packet_id, attempt.status, attempt.cwd])).toEqual([
            [result.taskPacketID, "requested", "/tmp/lightbulb-issue-26"],
          ])
          expect(events).toHaveLength(1)
          expect(JSON.stringify(events[0]?.data)).not.toContain("transcript")
        }).pipe(Effect.provide(layer(tmp.path))),
      ),
    ),
  )

  it.live("retries the same tick without duplicating the run, worker, task packet, launch attempt, or journal", () =>
    Effect.acquireRelease(
      Effect.promise(() => tmpdir()),
      (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
    ).pipe(
      Effect.flatMap((tmp) =>
        Effect.gen(function* () {
          const lightbulb = yield* Lightbulb.Service
          const database = yield* Database.Service
          const prepared = yield* prepareDueLoop(lightbulb, "runner-retry")
          const input = {
            accountID: prepared.accountID,
            tickID: "runner-tick-retry",
            now: now + 2_000,
            issues: [readyIssue(prepared.accountID, "#26", "Slice 18: account loop runner tick")],
            cwd: "/tmp/lightbulb-issue-26",
            command: "lightbulb run --agent lightbulb-worker --format json",
          }

          const first = yield* lightbulb.runAccountLoopTick(input)
          const second = yield* lightbulb.runAccountLoopTick(input)
          const runs = yield* database.db.select().from(LightbulbRunTable).all().pipe(Effect.orDie)
          const workers = yield* database.db.select().from(LightbulbWorkerTable).all().pipe(Effect.orDie)
          const packets = yield* database.db.select().from(LightbulbTaskPacketTable).all().pipe(Effect.orDie)
          const attempts = yield* database.db.select().from(LightbulbWorkerLaunchAttemptTable).all().pipe(Effect.orDie)
          const runnerEvents = yield* database.db
            .select()
            .from(LightbulbEventTable)
            .where(eq(LightbulbEventTable.aggregate_type, "account_loop_runner_tick"))
            .all()
            .pipe(Effect.orDie)

          expect(first.outcome).toBe("launched")
          expect(second).toMatchObject({
            outcome: "already_active",
            replayed: true,
            eventID: first.eventID,
            selectedRunID: first.selectedRunID,
            workerID: first.workerID,
            taskPacketID: first.taskPacketID,
          })
          expect(runs).toHaveLength(1)
          expect(workers).toHaveLength(1)
          expect(packets).toHaveLength(1)
          expect(attempts).toHaveLength(1)
          expect(runnerEvents).toHaveLength(1)
        }).pipe(Effect.provide(layer(tmp.path))),
      ),
    ),
  )

  it.live("records held or not-ready work without admitting a run", () =>
    Effect.acquireRelease(
      Effect.promise(() => tmpdir()),
      (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
    ).pipe(
      Effect.flatMap((tmp) =>
        Effect.gen(function* () {
          const lightbulb = yield* Lightbulb.Service
          const database = yield* Database.Service
          const prepared = yield* prepareDueLoop(lightbulb, "runner-held")

          const result = yield* lightbulb.runAccountLoopTick({
            accountID: prepared.accountID,
            tickID: "runner-tick-held",
            now: now + 2_000,
            issues: [
              {
                accountID: prepared.accountID,
                issueRef: "#74",
                title: "Structured pickup packets",
                labels: ["ready-for-agent", "blocked-by-dependency"],
              },
            ],
          })
          const runs = yield* database.db.select().from(LightbulbRunTable).all().pipe(Effect.orDie)

          expect(result).toMatchObject({
            outcome: "skipped",
            reason: "dependency_held",
            scheduler: null,
            skippedWork: [
              expect.objectContaining({
                issueRef: "#74",
                reason: "dependency_held",
              }),
            ],
          })
          expect(runs).toEqual([])
        }).pipe(Effect.provide(layer(tmp.path))),
      ),
    ),
  )

  it.live("surfaces budget holds and launch failures as bounded runner reasons", () =>
    Effect.acquireRelease(
      Effect.promise(() => tmpdir()),
      (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
    ).pipe(
      Effect.flatMap((tmp) =>
        Effect.gen(function* () {
          const lightbulb = yield* Lightbulb.Service
          const database = yield* Database.Service
          const budgetHeld = yield* prepareDueLoop(lightbulb, "runner-budget-held", {
            status: "held",
            holdReason: "daily_cost_budget_exhausted",
          })
          const launchFailed = yield* prepareDueLoop(lightbulb, "runner-launch-failed")

          const budget = yield* lightbulb.runAccountLoopTick({
            accountID: budgetHeld.accountID,
            tickID: "runner-tick-budget",
            now: now + 2_000,
            issues: [readyIssue(budgetHeld.accountID, "#75", "Budget ledger")],
          })
          const failed = yield* lightbulb.runAccountLoopTick({
            accountID: launchFailed.accountID,
            tickID: "runner-tick-launch-failed",
            now: now + 2_000,
            issues: [readyIssue(launchFailed.accountID, "#26", "Runner tick")],
            launchStatus: "launch_failed",
            failureReason: "runtime_adapter_missing",
          })
          const failedRuns = yield* database.db
            .select()
            .from(LightbulbRunTable)
            .where(eq(LightbulbRunTable.account_id, launchFailed.accountID))
            .orderBy(asc(LightbulbRunTable.time_created))
            .all()
            .pipe(Effect.orDie)

          expect(budget).toMatchObject({
            outcome: "skipped",
            reason: "budget_held",
            selectedRunID: null,
          })
          expect(failed).toMatchObject({
            outcome: "launch_failed",
            reason: "launch_failed",
            issueRef: "#26",
          })
          if (!failed.selectedRunID) throw new Error("expected failed runner tick run handle")
          expect(failedRuns.map((run) => [run.id, run.status, run.gate_status])).toEqual([
            [failed.selectedRunID, "failed", "failed"],
          ])
        }).pipe(Effect.provide(layer(tmp.path))),
      ),
    ),
  )
})

function readyIssue(accountID: Lightbulb.AccountID, issueRef: string, title: string) {
  return {
    accountID,
    issueRef,
    title,
    labels: ["ready-for-agent"],
  } satisfies Lightbulb.IssueRoutingInput
}

function prepareDueLoop(
  lightbulb: Lightbulb.Interface,
  profileID: string,
  budget?: {
    readonly status: "held"
    readonly holdReason: string
  },
) {
  return Effect.gen(function* () {
    const created = yield* lightbulb.createOrAdoptGoal({
      accountName: "Runner Tick " + profileID,
      title: "Account loop runner tick",
      objective: "Run one deterministic loop tick without a live worker process.",
    })
    const loopID = Lightbulb.loopIDForProfile(created.goal.id, profileID)
    yield* lightbulb.bootstrapLoopProfiles({
      accountID: created.goal.account_id,
      goalID: created.goal.id,
      profiles: [
        {
          profileID,
          kind: "implementation",
          summary: "Due runner tick loop.",
          schedule: {
            cadenceMs: 1_000,
          },
          budget,
        },
      ],
      defaultPolicy,
      now,
    })
    return {
      accountID: created.goal.account_id,
      goalID: created.goal.id,
      loopID,
    }
  })
}
