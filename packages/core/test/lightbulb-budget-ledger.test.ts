import path from "path"
import { describe, expect } from "bun:test"
import { Effect, Layer } from "effect"
import { Database } from "@opencode-ai/core/database/database"
import { Lightbulb } from "@opencode-ai/core/lightbulb"
import { LightbulbLoopTable, LightbulbTaskPacketTable, LightbulbWorkerTable } from "@opencode-ai/core/lightbulb/sql"
import { tmpdir } from "./fixture/tmpdir"
import { it } from "./lib/effect"

const now = Date.UTC(2026, 5, 24, 10)
const DAY_MS = 24 * 60 * 60 * 1000
const defaultPolicy = {
  schedule: { enabled: true, cadenceMs: 60_000 },
  budget: { status: "open", maxRunsPerDay: 5, maxTokens: 1_000, maxCostUsd: 10, maxContextTokens: 10_000 },
} satisfies Lightbulb.LoopProfileDefaultPolicy

function layer(directory: string) {
  const database = Database.layerFromPath(path.join(directory, "lightbulb-budget-ledger.db")).pipe(Layer.fresh)
  return Layer.mergeAll(database, Lightbulb.layer.pipe(Layer.provide(database)))
}

describe("Lightbulb budget usage ledger", () => {
  it.live("records compact usage once and rolls up the current UTC day", () =>
    Effect.acquireRelease(
      Effect.promise(() => tmpdir()),
      (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
    ).pipe(
      Effect.flatMap((tmp) =>
        Effect.gen(function* () {
          const lightbulb = yield* Lightbulb.Service
          const database = yield* Database.Service
          const prepared = yield* prepareBudgetRun(lightbulb, database)

          yield* lightbulb.recordBudgetUsage({
            accountID: prepared.accountID,
            goalID: prepared.goalID,
            loopID: prepared.loopID,
            runID: prepared.runID,
            workerID: prepared.workerID,
            source: { kind: "local_report", issueRef: "#27", idempotencyKey: "previous-day" },
            costUnits: 9,
            tokenUnits: 900,
            contextUnits: 9_000,
            approvalCount: 1,
            usageAt: now - DAY_MS,
            now: now - DAY_MS,
          })
          const recorded = yield* lightbulb.recordBudgetUsage({
            accountID: prepared.accountID,
            goalID: prepared.goalID,
            loopID: prepared.loopID,
            runID: prepared.runID,
            workerID: prepared.workerID,
            source: {
              kind: "local_report",
              issueRef: "#27",
              artifactHandle: {
                uri: ".lightbulb/runs/budget-ledger.md",
                summary: "Budget ledger evidence handle.",
              },
              idempotencyKey: "current-day",
            },
            costUnits: 0.25,
            tokenUnits: 25,
            contextUnits: 100,
            approvalCount: 1,
            usageAt: now + 3_000,
            now: now + 3_000,
          })
          const duplicate = yield* lightbulb.recordBudgetUsage({
            accountID: prepared.accountID,
            goalID: prepared.goalID,
            loopID: prepared.loopID,
            runID: prepared.runID,
            workerID: prepared.workerID,
            source: {
              kind: "local_report",
              issueRef: "#27",
              artifactHandle: { uri: ".lightbulb/runs/budget-ledger.md" },
              idempotencyKey: "current-day",
            },
            costUnits: 0.25,
            tokenUnits: 25,
            contextUnits: 100,
            approvalCount: 1,
            usageAt: now + 4_000,
            now: now + 4_000,
          })
          const graph = yield* lightbulb.readAccountGraph(prepared.accountID)
          const budget = yield* lightbulb.readLoopBudget({
            accountID: prepared.accountID,
            loopID: prepared.loopID,
            now: now + 4_000,
          })

          expect(recorded.outcome).toBe("recorded")
          expect(duplicate.outcome).toBe("duplicate")
          expect(duplicate.entry.id).toBe(recorded.entry.id)
          expect(graph?.budgetUsage).toHaveLength(2)
          expect(budget).toMatchObject({
            state: "open",
            reason: null,
            used: {
              runsStartedToday: 1,
              costUnits: 0.25,
              tokenUnits: 25,
              contextUnits: 100,
              approvalCount: 1,
            },
            remaining: {
              runsToday: 4,
              costUnits: 9.75,
              tokenUnits: 975,
              contextUnits: 9_900,
              approvalCount: null,
            },
          })
          expect(JSON.stringify(graph?.budgetUsage)).not.toContain("transcript")
        }).pipe(Effect.provide(layer(tmp.path))),
      ),
    ),
  )

  it.live("ingests worker report usage and holds schedules on cost exhaustion", () =>
    Effect.acquireRelease(
      Effect.promise(() => tmpdir()),
      (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
    ).pipe(
      Effect.flatMap((tmp) =>
        Effect.gen(function* () {
          const lightbulb = yield* Lightbulb.Service
          const database = yield* Database.Service
          const prepared = yield* prepareBudgetRun(lightbulb, database, { maxCostUsd: 0.5 })

          const ingested = yield* lightbulb.ingestWorkerReport({
            accountID: prepared.accountID,
            runID: prepared.runID,
            workerID: prepared.workerID,
            taskPacketID: prepared.taskPacketID,
            status: "complete",
            summary: "Worker completed budgeted implementation.",
            artifacts: [{ uri: ".lightbulb/runs/budgeted-worker.md", summary: "Budgeted worker report." }],
            verification: {
              commands: ["cd packages/core && bun test test/lightbulb-budget-ledger.test.ts"],
              summary: "Budget ledger test covers worker report usage.",
            },
            usage: {
              totalTokens: 50,
              costUsd: 0.5,
              contextTokens: 500,
            },
            now: now + 3_000,
          })
          const budget = yield* lightbulb.readLoopBudget({
            accountID: prepared.accountID,
            loopID: prepared.loopID,
            now: now + 4_000,
          })
          const schedules = yield* lightbulb.readLoopSchedules({
            accountID: prepared.accountID,
            now: now + 4_000,
          })

          expect(ingested.budgetUsage).toMatchObject({
            outcome: "recorded",
            entry: expect.objectContaining({
              source: expect.objectContaining({
                kind: "worker_report",
                artifactHandle: expect.objectContaining({
                  uri: ".lightbulb/runs/budgeted-worker.md",
                }),
              }),
              costUnits: 0.5,
              tokenUnits: 50,
              contextUnits: 500,
            }),
          })
          expect(budget).toMatchObject({
            state: "exhausted",
            reason: "cost_budget_exhausted",
            exhaustedReasons: ["cost_budget_exhausted"],
            remaining: expect.objectContaining({ costUnits: 0 }),
          })
          expect(schedules).toEqual([
            expect.objectContaining({
              classification: "budget_held",
              reason: "cost_budget_exhausted",
            }),
          ])
        }).pipe(Effect.provide(layer(tmp.path))),
      ),
    ),
  )

  it.live("reports context and approval exhaustion with bounded reasons", () =>
    Effect.acquireRelease(
      Effect.promise(() => tmpdir()),
      (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
    ).pipe(
      Effect.flatMap((tmp) =>
        Effect.gen(function* () {
          const lightbulb = yield* Lightbulb.Service
          const database = yield* Database.Service
          const context = yield* prepareBudgetRun(lightbulb, database, { maxContextTokens: 100 })
          const approvals = yield* prepareBudgetRun(lightbulb, database, { maxApprovals: 1 })

          yield* lightbulb.recordBudgetUsage({
            accountID: context.accountID,
            goalID: context.goalID,
            loopID: context.loopID,
            runID: context.runID,
            source: { kind: "run_usage", issueRef: "#27", idempotencyKey: "context" },
            contextUnits: 100,
            usageAt: now + 3_000,
            now: now + 3_000,
          })
          yield* lightbulb.recordBudgetUsage({
            accountID: approvals.accountID,
            goalID: approvals.goalID,
            loopID: approvals.loopID,
            runID: approvals.runID,
            source: { kind: "run_usage", issueRef: "#27", idempotencyKey: "approval" },
            approvalCount: 1,
            usageAt: now + 3_000,
            now: now + 3_000,
          })

          const contextBudget = yield* lightbulb.readLoopBudget({
            accountID: context.accountID,
            loopID: context.loopID,
            now: now + 4_000,
          })
          const approvalBudget = yield* lightbulb.readLoopBudget({
            accountID: approvals.accountID,
            loopID: approvals.loopID,
            now: now + 4_000,
          })

          expect(contextBudget).toMatchObject({
            state: "exhausted",
            reason: "context_budget_exhausted",
            exhaustedReasons: ["context_budget_exhausted"],
          })
          expect(approvalBudget).toMatchObject({
            state: "exhausted",
            reason: "approval_budget_exhausted",
            exhaustedReasons: ["approval_budget_exhausted"],
            remaining: expect.objectContaining({ approvalCount: 0 }),
          })
        }).pipe(Effect.provide(layer(tmp.path))),
      ),
    ),
  )

  it.live("returns unknown budget state when a loop has no profile metadata", () =>
    Effect.acquireRelease(
      Effect.promise(() => tmpdir()),
      (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
    ).pipe(
      Effect.flatMap((tmp) =>
        Effect.gen(function* () {
          const lightbulb = yield* Lightbulb.Service
          const database = yield* Database.Service
          const created = yield* lightbulb.createOrAdoptGoal({
            accountName: "Unknown Budget Account",
            title: "Unknown budget loop",
            objective: "Expose missing profile metadata as an unknown budget state.",
          })
          const loopID = Lightbulb.LoopID.create()
          yield* database.db
            .insert(LightbulbLoopTable)
            .values({
              id: loopID,
              account_id: created.goal.account_id,
              goal_id: created.goal.id,
              kind: "status",
              status: "active",
              summary: "Loop without profile metadata.",
            })
            .run()
            .pipe(Effect.orDie)

          const budget = yield* lightbulb.readLoopBudget({
            accountID: created.goal.account_id,
            loopID,
            now,
          })

          expect(budget).toMatchObject({
            state: "unknown",
            reason: "budget_profile_missing",
            unknownReasons: ["budget_profile_missing"],
            limits: null,
            remaining: {
              runsToday: null,
              costUnits: null,
              tokenUnits: null,
              contextUnits: null,
              approvalCount: null,
            },
          })
        }).pipe(Effect.provide(layer(tmp.path))),
      ),
    ),
  )
})

function prepareBudgetRun(
  lightbulb: Lightbulb.Interface,
  database: Database.Interface,
  budget: Lightbulb.LoopProfileBudgetOverride = {},
) {
  return Effect.gen(function* () {
    const suffix = Lightbulb.EventID.create()
    const created = yield* lightbulb.createOrAdoptGoal({
      accountName: "Budget Ledger Account " + suffix,
      title: "Budget usage ledger " + suffix,
      objective: "Roll worker and run usage into a durable loop budget read model.",
    })
    const loopID = Lightbulb.loopIDForProfile(created.goal.id, "budget")
    yield* lightbulb.bootstrapLoopProfiles({
      accountID: created.goal.account_id,
      goalID: created.goal.id,
      profiles: [
        {
          profileID: "budget",
          kind: "implementation",
          summary: "Budgeted implementation loop.",
          schedule: { cadenceMs: 1_000 },
          budget,
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
        summary: "Worker should return budget usage.",
      })
      .run()
      .pipe(Effect.orDie)
    yield* database.db
      .insert(LightbulbTaskPacketTable)
      .values({
        id: taskPacketID,
        account_id: created.goal.account_id,
        worker_id: workerID,
        title: "Return budget usage",
        status: "ready",
        instructions: "Return a compact report with usage and artifact handles.",
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
