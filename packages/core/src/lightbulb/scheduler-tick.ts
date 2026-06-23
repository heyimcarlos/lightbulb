import { asc, eq } from "drizzle-orm"
import { Effect } from "effect"
import type { Database } from "../database/database"
import type { Lightbulb } from "../lightbulb"
import {
  admitLoopRunInDb,
  type LoopRunAdmissionResult,
  type LoopRunAdmissionSourceValue,
  type LoopRunTrigger,
} from "./run-ledger"
import type { LoopScheduleReadModel } from "./scheduler"
import { LightbulbEventTable, LightbulbLoopTable } from "./sql"

export type LoopSchedulerTickServiceInput = {
  readonly accountID: Lightbulb.AccountID
  readonly now?: number
  readonly trigger?: LoopRunTrigger
  readonly source?: Record<string, LoopRunAdmissionSourceValue>
}

export type LoopSchedulerTickInput = Omit<LoopSchedulerTickServiceInput, "now"> & {
  readonly now: number
}

export type LoopSchedulerTickOutcome = {
  readonly loopID: Lightbulb.LoopID
  readonly profileID: string | null
  readonly kind: Lightbulb.LoopKind
  readonly outcome: LoopRunAdmissionResult["outcome"]
  readonly runID: Lightbulb.RunID | null
  readonly eventID: Lightbulb.EventID | null
  readonly classification: LoopScheduleReadModel["classification"] | null
  readonly reason: string | null
}

export type LoopSchedulerTickResult = {
  readonly accountID: Lightbulb.AccountID
  readonly now: number
  readonly trigger: LoopRunTrigger
  readonly eventID: Lightbulb.EventID
  readonly outcomes: readonly LoopSchedulerTickOutcome[]
  readonly admittedCount: number
  readonly skippedCount: number
}

export function admitScheduledLoopRunsInDb(
  db: Database.Interface["db"],
  input: LoopSchedulerTickInput,
  ids: { readonly run: () => Lightbulb.RunID; readonly event: () => Lightbulb.EventID },
): Effect.Effect<LoopSchedulerTickResult> {
  return Effect.gen(function* () {
    const trigger = input.trigger ?? "schedule"
    const loops = yield* db
      .select({
        id: LightbulbLoopTable.id,
        kind: LightbulbLoopTable.kind,
      })
      .from(LightbulbLoopTable)
      .where(eq(LightbulbLoopTable.account_id, input.accountID))
      .orderBy(asc(LightbulbLoopTable.time_created))
      .all()
      .pipe(Effect.orDie)
    const outcomes = yield* Effect.forEach(loops, (loop) =>
      admitLoopRunInDb(
        db,
        {
          accountID: input.accountID,
          loopID: loop.id,
          now: input.now,
          trigger,
          source: input.source,
        },
        ids,
      ).pipe(Effect.map((result) => toOutcome(loop, result))),
    )
    const admittedCount = outcomes.filter((outcome) => outcome.outcome === "admitted").length
    const skippedCount = outcomes.length - admittedCount
    const eventID = ids.event()

    yield* db
      .insert(LightbulbEventTable)
      .values({
        id: eventID,
        account_id: input.accountID,
        aggregate_type: "account",
        aggregate_id: input.accountID,
        type: "lightbulb.scheduler_tick.completed",
        summary: "Completed Lightbulb scheduler tick: " + admittedCount + " admitted, " + skippedCount + " skipped.",
        data: {
          account_id: input.accountID,
          trigger,
          source: input.source ?? null,
          admitted_count: admittedCount,
          skipped_count: skippedCount,
          outcome_count: outcomes.length,
          outcomes,
        },
        time_created: input.now,
      })
      .run()
      .pipe(Effect.orDie)

    return {
      accountID: input.accountID,
      now: input.now,
      trigger,
      eventID,
      outcomes,
      admittedCount,
      skippedCount,
    }
  })
}

function toOutcome(
  loop: { readonly id: Lightbulb.LoopID; readonly kind: Lightbulb.LoopKind },
  result: LoopRunAdmissionResult,
): LoopSchedulerTickOutcome {
  return {
    loopID: loop.id,
    profileID: result.schedule?.profileID ?? null,
    kind: result.schedule?.kind ?? loop.kind,
    outcome: result.outcome,
    runID: result.outcome === "admitted" ? result.runID : null,
    eventID: result.eventID,
    classification: result.schedule?.classification ?? null,
    reason: result.outcome === "skipped" ? result.reason : result.schedule.reason,
  }
}
