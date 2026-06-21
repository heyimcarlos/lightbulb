import { asc, eq } from "drizzle-orm"
import { Effect } from "effect"
import type { Database } from "../database/database"
import type { Lightbulb } from "../lightbulb"
import {
  readLoopProfileMetadata,
  type LoopProfileBudgetEnvelope,
  type LoopProfileScheduleEnvelope,
} from "./loop-profile"
import { LightbulbLoopTable, LightbulbRunTable } from "./sql"

const DAY_MS = 24 * 60 * 60 * 1000

export type LoopScheduleClassification = "due" | "not_due" | "disabled" | "budget_held"

export type LoopScheduleBudgetState = {
  readonly status: "open" | "held"
  readonly maxRunsPerDay: number
  readonly maxTokens: number
  readonly maxCostUsd: number
  readonly maxContextTokens: number
  readonly holdReason: string | null
  readonly runsStartedToday: number
  readonly remainingRunsToday: number
  readonly resetsAt: number
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
  const budget = profile ? toBudgetState(profile.budget, input) : null

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

    return loops.map((loop) => classifyLoopSchedule({ loop, runs, now: input.now }))
  })
}

function toBudgetState(
  budget: LoopProfileBudgetEnvelope,
  input: LoopScheduleClassifierInput,
): LoopScheduleBudgetState {
  const date = new Date(input.now)
  const dayStart = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  const runsStartedToday = input.runs.filter(
    (run) => run.loop_id === input.loop.id && run.started_at >= dayStart && run.started_at <= input.now,
  ).length
  const holdReason =
    budget.status === "held"
      ? budget.holdReason ?? "budget_held"
      : runsStartedToday >= budget.maxRunsPerDay
        ? "daily_run_budget_exhausted"
        : null

  return {
    status: holdReason ? "held" : "open",
    maxRunsPerDay: budget.maxRunsPerDay,
    maxTokens: budget.maxTokens,
    maxCostUsd: budget.maxCostUsd,
    maxContextTokens: budget.maxContextTokens,
    holdReason,
    runsStartedToday,
    remainingRunsToday: Math.max(0, budget.maxRunsPerDay - runsStartedToday),
    resetsAt: dayStart + DAY_MS,
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
