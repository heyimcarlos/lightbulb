import { and, asc, eq, isNull } from "drizzle-orm"
import { Effect } from "effect"
import type { Database } from "../database/database"
import type { Lightbulb } from "../lightbulb"
import { readLoopProfileMetadata } from "./loop-profile"
import { classifyLoopSchedule, type LoopScheduleReadModel } from "./scheduler"
import {
  LightbulbAccountTable,
  LightbulbBudgetUsageTable,
  LightbulbEventTable,
  LightbulbGoalTable,
  LightbulbLoopTable,
  LightbulbRunTable,
} from "./sql"

export type LoopRunTrigger = "schedule" | "manual" | "recovery"
export type LoopRunAdmissionSourceValue = string | number | boolean | null

export type LoopRunAdmissionServiceInput = {
  readonly accountID: Lightbulb.AccountID
  readonly loopID: Lightbulb.LoopID
  readonly trigger?: LoopRunTrigger
  readonly now?: number
  readonly summary?: string
  readonly source?: Record<string, LoopRunAdmissionSourceValue>
}

export type LoopRunAdmissionInput = Omit<LoopRunAdmissionServiceInput, "now"> & {
  readonly now: number
}

export type LoopRunAdmissionResult =
  | {
      readonly outcome: "admitted"
      readonly runID: Lightbulb.RunID
      readonly eventID: Lightbulb.EventID
      readonly schedule: LoopScheduleReadModel
    }
  | {
      readonly outcome: "skipped"
      readonly eventID: Lightbulb.EventID | null
      readonly schedule: LoopScheduleReadModel | null
      readonly reason: string
    }

export function admitLoopRunInDb(
  db: Database.Interface["db"],
  input: LoopRunAdmissionInput,
  ids: { readonly run: () => Lightbulb.RunID; readonly event: () => Lightbulb.EventID },
): Effect.Effect<LoopRunAdmissionResult> {
  return db
    .transaction((tx) =>
      Effect.gen(function* () {
        const loop = yield* tx
          .select()
          .from(LightbulbLoopTable)
          .where(and(eq(LightbulbLoopTable.account_id, input.accountID), eq(LightbulbLoopTable.id, input.loopID)))
          .get()
        if (!loop) return { outcome: "skipped" as const, eventID: null, schedule: null, reason: "missing_loop" }

        const goal = yield* tx
          .select()
          .from(LightbulbGoalTable)
          .where(and(eq(LightbulbGoalTable.account_id, input.accountID), eq(LightbulbGoalTable.id, loop.goal_id)))
          .get()
        if (!goal) return { outcome: "skipped" as const, eventID: null, schedule: null, reason: "missing_goal" }

        const account = yield* tx
          .select()
          .from(LightbulbAccountTable)
          .where(eq(LightbulbAccountTable.id, input.accountID))
          .get()
        if (!account) return { outcome: "skipped" as const, eventID: null, schedule: null, reason: "missing_account" }

        const runs = yield* tx
          .select({
            loop_id: LightbulbRunTable.loop_id,
            started_at: LightbulbRunTable.started_at,
          })
          .from(LightbulbRunTable)
          .where(and(eq(LightbulbRunTable.account_id, input.accountID), eq(LightbulbRunTable.loop_id, input.loopID)))
          .orderBy(asc(LightbulbRunTable.started_at))
          .all()
        const usage = yield* tx
          .select({
            loop_id: LightbulbBudgetUsageTable.loop_id,
            cost_units: LightbulbBudgetUsageTable.cost_units,
            token_units: LightbulbBudgetUsageTable.token_units,
            context_units: LightbulbBudgetUsageTable.context_units,
            approval_count: LightbulbBudgetUsageTable.approval_count,
            usage_at: LightbulbBudgetUsageTable.usage_at,
          })
          .from(LightbulbBudgetUsageTable)
          .where(and(eq(LightbulbBudgetUsageTable.account_id, input.accountID), eq(LightbulbBudgetUsageTable.loop_id, input.loopID)))
          .orderBy(asc(LightbulbBudgetUsageTable.usage_at))
          .all()
        const schedule = classifyLoopSchedule({ loop, runs, usage, now: input.now })

        if (account.status !== "active") {
          return yield* insertSkippedEvent(tx, input, loop, schedule, ids.event(), "account_not_active", {
            account_status: account.status,
          })
        }

        if (goal.status !== "active") {
          return yield* insertSkippedEvent(tx, input, loop, schedule, ids.event(), "goal_not_active", {
            goal_status: goal.status,
          })
        }

        if (schedule.classification !== "due" || !schedule.schedule || !schedule.budget) {
          return yield* insertSkippedEvent(tx, input, loop, schedule, ids.event(), schedule.reason ?? schedule.classification)
        }

        const runID = ids.run()
        const eventID = ids.event()
        const data = eventData(input, loop, schedule)
        const claimed = yield* tx
          .update(LightbulbLoopTable)
          .set({
            metadata: advanceLoopMetadata(loop.metadata ?? null, input.now + schedule.schedule.cadenceMs, runID, input.now),
            time_updated: input.now,
          })
          .where(
            and(
              eq(LightbulbLoopTable.account_id, input.accountID),
              eq(LightbulbLoopTable.id, input.loopID),
              eq(LightbulbLoopTable.time_updated, loop.time_updated),
              sameMetadata(loop.metadata ?? null),
            ),
          )
          .returning({ id: LightbulbLoopTable.id })
          .get()
        if (!claimed) return yield* insertSkippedEvent(tx, input, loop, schedule, ids.event(), "admission_claim_lost")

        yield* tx
          .insert(LightbulbRunTable)
          .values({
            id: runID,
            account_id: input.accountID,
            loop_id: input.loopID,
            status: "queued",
            review_status: "not_requested",
            debug_status: "not_started",
            gate_status: "pending",
            summary: input.summary ?? "Admitted " + schedule.kind + " loop run from " + (input.trigger ?? "schedule") + " trigger.",
            started_at: input.now,
            metadata: { admission: data },
            time_created: input.now,
            time_updated: input.now,
          })
          .run()
        yield* tx
          .insert(LightbulbEventTable)
          .values({
            id: eventID,
            account_id: input.accountID,
            aggregate_type: "run",
            aggregate_id: runID,
            type: "lightbulb.loop_run.admitted",
            summary: "Admitted Lightbulb loop run from " + (input.trigger ?? "schedule") + " trigger.",
            data,
            time_created: input.now,
          })
          .run()

        return { outcome: "admitted" as const, runID, eventID, schedule }
      }),
    )
    .pipe(Effect.orDie)
}

function insertSkippedEvent(
  tx: Parameters<Parameters<Database.Interface["db"]["transaction"]>[0]>[0],
  input: LoopRunAdmissionInput,
  loop: typeof LightbulbLoopTable.$inferSelect,
  schedule: LoopScheduleReadModel,
  eventID: Lightbulb.EventID,
  reason: string,
  data?: Record<string, unknown>,
) {
  return Effect.gen(function* () {
    yield* tx
      .insert(LightbulbEventTable)
      .values({
        id: eventID,
        account_id: input.accountID,
        aggregate_type: "loop",
        aggregate_id: input.loopID,
        type: "lightbulb.loop_run.skipped",
        summary: "Skipped Lightbulb loop run admission: " + reason + ".",
        data: {
          ...eventData(input, loop, schedule),
          ...data,
          reason,
        },
        time_created: input.now,
      })
      .run()
    return { outcome: "skipped" as const, eventID, schedule, reason }
  })
}

function sameMetadata(metadata: Record<string, unknown> | null) {
  if (metadata === null) return isNull(LightbulbLoopTable.metadata)
  return eq(LightbulbLoopTable.metadata, metadata)
}

function eventData(
  input: LoopRunAdmissionInput,
  loop: typeof LightbulbLoopTable.$inferSelect,
  schedule: LoopScheduleReadModel,
) {
  return {
    account_id: input.accountID,
    goal_id: loop.goal_id,
    loop_id: input.loopID,
    profile_id: schedule.profileID,
    trigger: input.trigger ?? "schedule",
    classification: schedule.classification,
    reason: schedule.reason,
    schedule: schedule.schedule,
    budget: schedule.budget,
    source: input.source ?? null,
  }
}

function advanceLoopMetadata(
  metadata: Record<string, unknown> | null,
  nextDueAt: number,
  runID: Lightbulb.RunID,
  now: number,
) {
  const current = isRecord(metadata) ? metadata : {}
  const profile = readLoopProfileMetadata(metadata)
  if (!profile) return current
  const loopProfile = isRecord(current.loop_profile) ? current.loop_profile : {}
  const schedule = isRecord(loopProfile.schedule) ? loopProfile.schedule : {}
  return {
    ...current,
    loop_profile: {
      ...loopProfile,
      schedule: {
        ...schedule,
        next_due_at: nextDueAt,
      },
      last_admitted_run_id: runID,
      last_admitted_at: now,
    },
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
