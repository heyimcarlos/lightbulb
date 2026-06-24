import { asc, eq } from "drizzle-orm"
import { Effect } from "effect"
import type { Database } from "../database/database"
import type { Lightbulb } from "../lightbulb"
import { rollupLoopBudget, type LoopBudgetReadModel, type LoopBudgetStoredUsage } from "./budget-ledger"
import {
  readLoopProfileMetadata,
  type LoopProfileScheduleEnvelope,
} from "./loop-profile"
import { LightbulbBudgetUsageTable, LightbulbLoopTable, LightbulbRunTable } from "./sql"

export type LoopScheduleClassification = "due" | "not_due" | "disabled" | "budget_held"

export type LoopScheduleBudgetState = {
  readonly status: "open" | "held" | "unknown"
  readonly maxRunsPerDay: number
  readonly maxTokens: number
  readonly maxCostUsd: number
  readonly maxContextTokens: number
  readonly maxApprovals?: number | null
  readonly holdReason: string | null
  readonly runsStartedToday: number
  readonly remainingRunsToday: number | null
  readonly resetsAt: number
  readonly state?: LoopBudgetReadModel["state"]
  readonly exhausted?: boolean
  readonly exhaustedReasons?: LoopBudgetReadModel["exhaustedReasons"]
  readonly unknownReasons?: LoopBudgetReadModel["unknownReasons"]
  readonly used?: LoopBudgetReadModel["used"]
  readonly remaining?: LoopBudgetReadModel["remaining"]
  readonly limits?: LoopBudgetReadModel["limits"]
}

export type LoopScheduleReadModel = {
  readonly accountID: Lightbulb.AccountID
  readonly goalID: Lightbulb.GoalID
  readonly loopID: Lightbulb.LoopID
  readonly profileID: string | null
  readonly kind: Lightbulb.LoopKind
  readonly loopStatus: Lightbulb.LoopStatus
  readonly summary: string
  readonly schedule: LoopProfileScheduleEnvelope | null
  readonly budget: LoopScheduleBudgetState | null
  readonly classification: LoopScheduleClassification
  readonly reason: string | null
}

export type LoopScheduleStoredLoop = Pick<
  typeof LightbulbLoopTable.$inferSelect,
  "id" | "account_id" | "goal_id" | "kind" | "status" | "summary" | "metadata"
>

export type LoopScheduleStoredRun = Pick<typeof LightbulbRunTable.$inferSelect, "loop_id" | "started_at">

export type LoopScheduleClassifierInput = {
  readonly loop: LoopScheduleStoredLoop
  readonly runs: readonly LoopScheduleStoredRun[]
  readonly usage?: readonly LoopBudgetStoredUsage[]
  readonly now: number
}

export type ReadLoopSchedulesInput = {
  readonly accountID: Lightbulb.AccountID
  readonly now: number
}

export function classifyLoopSchedule(input: LoopScheduleClassifierInput): LoopScheduleReadModel {
  const profile = readLoopProfileMetadata(input.loop.metadata ?? null)
  const schedule = profile
    ? {
        enabled: profile.schedule.enabled,
        cadenceMs: profile.schedule.cadenceMs,
        nextDueAt: profile.schedule.nextDueAt,
      }
    : null
  const budget = profile ? toBudgetState(rollupLoopBudget({ ...input, usage: input.usage ?? [] })) : null

  if (!profile || !schedule || !budget) {
    return toReadModel(input, profile?.profileID ?? null, schedule, budget, "not_due", "schedule_not_configured")
  }
  if (input.loop.status === "disabled") return toReadModel(input, profile.profileID, schedule, budget, "disabled", "loop_disabled")
  if (!schedule.enabled) return toReadModel(input, profile.profileID, schedule, budget, "disabled", "schedule_disabled")
  if (budget.holdReason) return toReadModel(input, profile.profileID, schedule, budget, "budget_held", budget.holdReason)
  if (input.loop.status === "held") {
    return toReadModel(
      input,
      profile.profileID,
      schedule,
      { ...budget, status: "held", holdReason: "loop_held" },
      "budget_held",
      "loop_held",
    )
  }
  if (input.loop.status !== "active" && input.loop.status !== "idle") {
    return toReadModel(input, profile.profileID, schedule, budget, "not_due", "loop_not_runnable")
  }
  if (schedule.nextDueAt === null) return toReadModel(input, profile.profileID, schedule, budget, "not_due", "next_due_time_missing")
  if (schedule.nextDueAt <= input.now) return toReadModel(input, profile.profileID, schedule, budget, "due", null)
  return toReadModel(input, profile.profileID, schedule, budget, "not_due", "next_due_at_in_future")
}

export function readLoopSchedulesInDb(db: Database.Interface["db"], input: ReadLoopSchedulesInput) {
  return Effect.gen(function* () {
    const loops = yield* db
      .select()
      .from(LightbulbLoopTable)
      .where(eq(LightbulbLoopTable.account_id, input.accountID))
      .orderBy(asc(LightbulbLoopTable.time_created))
      .all()
      .pipe(Effect.orDie)
    const runs = yield* db
      .select({
        loop_id: LightbulbRunTable.loop_id,
        started_at: LightbulbRunTable.started_at,
      })
      .from(LightbulbRunTable)
      .where(eq(LightbulbRunTable.account_id, input.accountID))
      .orderBy(asc(LightbulbRunTable.started_at))
      .all()
      .pipe(Effect.orDie)
    const usage = yield* db
      .select({
        loop_id: LightbulbBudgetUsageTable.loop_id,
        cost_units: LightbulbBudgetUsageTable.cost_units,
        token_units: LightbulbBudgetUsageTable.token_units,
        context_units: LightbulbBudgetUsageTable.context_units,
        approval_count: LightbulbBudgetUsageTable.approval_count,
        usage_at: LightbulbBudgetUsageTable.usage_at,
      })
      .from(LightbulbBudgetUsageTable)
      .where(eq(LightbulbBudgetUsageTable.account_id, input.accountID))
      .orderBy(asc(LightbulbBudgetUsageTable.usage_at))
      .all()
      .pipe(Effect.orDie)

    return loops.map((loop) => classifyLoopSchedule({ loop, runs, usage, now: input.now }))
  })
}

function toBudgetState(budget: LoopBudgetReadModel): LoopScheduleBudgetState {
  return {
    ...budget,
    maxRunsPerDay: budget.limits?.maxRunsPerDay ?? 0,
    maxTokens: budget.limits?.maxTokenUnits ?? 0,
    maxCostUsd: budget.limits?.maxCostUnits ?? 0,
    maxContextTokens: budget.limits?.maxContextUnits ?? 0,
    maxApprovals: budget.limits?.maxApprovals ?? null,
    runsStartedToday: budget.used.runsStartedToday,
    remainingRunsToday: budget.remaining.runsToday,
  }
}

function toReadModel(
  input: LoopScheduleClassifierInput,
  profileID: string | null,
  schedule: LoopProfileScheduleEnvelope | null,
  budget: LoopScheduleBudgetState | null,
  classification: LoopScheduleClassification,
  reason: string | null,
): LoopScheduleReadModel {
  return {
    accountID: input.loop.account_id,
    goalID: input.loop.goal_id,
    loopID: input.loop.id,
    profileID,
    kind: input.loop.kind,
    loopStatus: input.loop.status,
    summary: input.loop.summary,
    schedule,
    budget,
    classification,
    reason,
  }
}
