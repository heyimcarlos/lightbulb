import path from "path"
import { describe, expect } from "bun:test"
import { eq } from "drizzle-orm"
import { Effect, Layer } from "effect"
import { Database } from "@opencode-ai/core/database/database"
import { Lightbulb } from "@opencode-ai/core/lightbulb"
import { LightbulbEventTable, LightbulbRunTable } from "@opencode-ai/core/lightbulb/sql"
import { tmpdir } from "./fixture/tmpdir"
import { it } from "./lib/effect"

const now = Date.UTC(2026, 0, 1)

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
  const database = Database.layerFromPath(path.join(directory, "lightbulb-loop-run.db")).pipe(Layer.fresh)
  return Layer.mergeAll(database, Lightbulb.layer.pipe(Layer.provide(database)))
}

describe("Lightbulb loop run admission", () => {
  it.live("admits due loops into the durable run ledger and advances the next due time", () =>
    Effect.acquireRelease(
      Effect.promise(() => tmpdir()),
      (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
    ).pipe(
      Effect.flatMap((tmp) =>
        Effect.gen(function* () {
          const lightbulb = yield* Lightbulb.Service
          const database = yield* Database.Service
          const created = yield* lightbulb.createOrAdoptGoal({
            accountName: "Loop Run Account",
            title: "Traceable loop admission",
            objective: "Admit due loops before worker dispatch.",
          })
          const loopID = Lightbulb.loopIDForProfile(created.goal.id, "trace")
          yield* lightbulb.bootstrapLoopProfiles({
            accountID: created.goal.account_id,
            goalID: created.goal.id,
            profiles: [
              {
                profileID: "trace",
                kind: "implementation",
                summary: "Traceable implementation loop.",
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
            source: { automation_id: "cron-123" },
          })
          const retried = yield* lightbulb.admitLoopRun({
            accountID: created.goal.account_id,
            loopID,
            trigger: "schedule",
            now: now + 2_000,
            source: { automation_id: "cron-123-retry" },
          })
          const runs = yield* database.db
            .select()
            .from(LightbulbRunTable)
            .where(eq(LightbulbRunTable.loop_id, loopID))
            .all()
            .pipe(Effect.orDie)
          const schedules = yield* lightbulb.readLoopSchedules({
            accountID: created.goal.account_id,
            now: now + 2_000,
          })
          const events = yield* database.db
            .select()
            .from(LightbulbEventTable)
            .where(eq(LightbulbEventTable.type, "lightbulb.loop_run.admitted"))
            .all()
            .pipe(Effect.orDie)
          const skippedEvents = yield* database.db
            .select()
            .from(LightbulbEventTable)
            .where(eq(LightbulbEventTable.type, "lightbulb.loop_run.skipped"))
            .all()
            .pipe(Effect.orDie)

          expect(admitted).toMatchObject({ outcome: "admitted", schedule: expect.objectContaining({ classification: "due" }) })
          expect(retried).toMatchObject({
            outcome: "skipped",
            reason: "next_due_at_in_future",
            schedule: expect.objectContaining({ classification: "not_due" }),
          })
          expect(runs).toHaveLength(1)
          expect(runs[0]).toMatchObject({
            status: "queued",
            review_status: "not_requested",
            debug_status: "not_started",
            gate_status: "pending",
            started_at: now + 2_000,
          })
          expect(runs[0]?.metadata).toEqual({
            admission: expect.objectContaining({
              loop_id: loopID,
              profile_id: "trace",
              trigger: "schedule",
              classification: "due",
              source: { automation_id: "cron-123" },
            }),
          })
          expect(schedules).toEqual([
            expect.objectContaining({
              profileID: "trace",
              classification: "not_due",
              reason: "next_due_at_in_future",
              schedule: expect.objectContaining({ nextDueAt: now + 3_000 }),
            }),
          ])
          expect(events).toHaveLength(1)
          expect(skippedEvents).toHaveLength(1)
          expect(skippedEvents[0]).toMatchObject({
            aggregate_type: "loop",
            aggregate_id: loopID,
            data: expect.objectContaining({
              loop_id: loopID,
              profile_id: "trace",
              classification: "not_due",
              reason: "next_due_at_in_future",
              source: { automation_id: "cron-123-retry" },
            }),
          })
          expect(events[0]).toMatchObject({
            aggregate_type: "run",
            aggregate_id: runs[0]?.id,
            data: expect.objectContaining({
              loop_id: loopID,
              profile_id: "trace",
              trigger: "schedule",
              classification: "due",
              source: { automation_id: "cron-123" },
            }),
          })
        }).pipe(Effect.provide(layer(tmp.path))),
      ),
    ),
  )

  it.live("records skipped scheduler decisions without creating a run", () =>
    Effect.acquireRelease(
      Effect.promise(() => tmpdir()),
      (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
    ).pipe(
      Effect.flatMap((tmp) =>
        Effect.gen(function* () {
          const lightbulb = yield* Lightbulb.Service
          const database = yield* Database.Service
          const created = yield* lightbulb.createOrAdoptGoal({
            accountName: "Skipped Loop Account",
            title: "Skipped loop admission",
            objective: "Trace no-op scheduler decisions.",
          })
          const loopID = Lightbulb.loopIDForProfile(created.goal.id, "not-ready")
          yield* lightbulb.bootstrapLoopProfiles({
            accountID: created.goal.account_id,
            goalID: created.goal.id,
            profiles: [
              {
                profileID: "not-ready",
                kind: "status",
                summary: "Future status loop.",
              },
            ],
            defaultPolicy,
            now,
          })

          const skipped = yield* lightbulb.admitLoopRun({
            accountID: created.goal.account_id,
            loopID,
            trigger: "schedule",
            now: now + 500,
          })
          const runs = yield* database.db
            .select()
            .from(LightbulbRunTable)
            .where(eq(LightbulbRunTable.loop_id, loopID))
            .all()
            .pipe(Effect.orDie)
          const events = yield* database.db
            .select()
            .from(LightbulbEventTable)
            .where(eq(LightbulbEventTable.type, "lightbulb.loop_run.skipped"))
            .all()
            .pipe(Effect.orDie)

          expect(skipped).toMatchObject({
            outcome: "skipped",
            reason: "next_due_at_in_future",
            schedule: expect.objectContaining({ classification: "not_due" }),
          })
          expect(runs).toHaveLength(0)
          expect(events).toHaveLength(1)
          expect(events[0]).toMatchObject({
            aggregate_type: "loop",
            aggregate_id: loopID,
            data: expect.objectContaining({
              loop_id: loopID,
              profile_id: "not-ready",
              classification: "not_due",
              reason: "next_due_at_in_future",
            }),
          })
        }).pipe(Effect.provide(layer(tmp.path))),
      ),
    ),
  )

  it.live("does not admit active loops for non-active goals", () =>
    Effect.acquireRelease(
      Effect.promise(() => tmpdir()),
      (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
    ).pipe(
      Effect.flatMap((tmp) =>
        Effect.gen(function* () {
          const lightbulb = yield* Lightbulb.Service
          const database = yield* Database.Service
          const created = yield* lightbulb.createOrAdoptGoal({
            accountName: "Held Goal Account",
            title: "Held goal admission",
            objective: "Do not restart work when a parent goal is held.",
          })
          const loopID = Lightbulb.loopIDForProfile(created.goal.id, "held-goal")
          yield* lightbulb.bootstrapLoopProfiles({
            accountID: created.goal.account_id,
            goalID: created.goal.id,
            profiles: [
              {
                profileID: "held-goal",
                kind: "implementation",
                summary: "Implementation loop on a held goal.",
                schedule: {
                  cadenceMs: 1_000,
                },
              },
            ],
            defaultPolicy,
            now,
          })
          yield* lightbulb.updateGoalStatus({
            goalID: created.goal.id,
            status: "held",
            reason: "Waiting for parent approval.",
          })

          const skipped = yield* lightbulb.admitLoopRun({
            accountID: created.goal.account_id,
            loopID,
            trigger: "schedule",
            now: now + 2_000,
          })
          const runs = yield* database.db
            .select()
            .from(LightbulbRunTable)
            .where(eq(LightbulbRunTable.loop_id, loopID))
            .all()
            .pipe(Effect.orDie)
          const events = yield* database.db
            .select()
            .from(LightbulbEventTable)
            .where(eq(LightbulbEventTable.type, "lightbulb.loop_run.skipped"))
            .all()
            .pipe(Effect.orDie)

          expect(skipped).toMatchObject({
            outcome: "skipped",
            reason: "goal_not_active",
            schedule: expect.objectContaining({ classification: "due" }),
          })
          expect(runs).toHaveLength(0)
          expect(events).toHaveLength(1)
          expect(events[0]).toMatchObject({
            aggregate_type: "loop",
            aggregate_id: loopID,
            data: expect.objectContaining({
              loop_id: loopID,
              goal_id: created.goal.id,
              profile_id: "held-goal",
              classification: "due",
              reason: "goal_not_active",
              goal_status: "held",
            }),
          })
        }).pipe(Effect.provide(layer(tmp.path))),
      ),
    ),
  )

  it.live("records scheduler tick outcomes for due, skipped, and empty wakeups", () =>
    Effect.acquireRelease(
      Effect.promise(() => tmpdir()),
      (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
    ).pipe(
      Effect.flatMap((tmp) =>
        Effect.gen(function* () {
          const lightbulb = yield* Lightbulb.Service
          const database = yield* Database.Service
          const created = yield* lightbulb.createOrAdoptGoal({
            accountName: "Scheduler Tick Account",
            title: "Trace scheduler wakeups",
            objective: "Record every scheduler wakeup before worker dispatch.",
          })
          const empty = yield* lightbulb.createOrAdoptGoal({
            accountName: "Empty Scheduler Tick Account",
            title: "Trace empty scheduler wakeups",
            objective: "Record account wakeups even when no loops exist.",
          })
          const dueLoopID = Lightbulb.loopIDForProfile(created.goal.id, "due")
          const futureLoopID = Lightbulb.loopIDForProfile(created.goal.id, "future")
          const disabledLoopID = Lightbulb.loopIDForProfile(created.goal.id, "disabled")
          yield* lightbulb.bootstrapLoopProfiles({
            accountID: created.goal.account_id,
            goalID: created.goal.id,
            profiles: [
              {
                profileID: "due",
                kind: "implementation",
                summary: "Due implementation loop.",
                schedule: {
                  cadenceMs: 1_000,
                },
              },
              {
                profileID: "future",
                kind: "status",
                summary: "Future status loop.",
              },
              {
                profileID: "disabled",
                kind: "review",
                summary: "Disabled review loop.",
                schedule: {
                  enabled: false,
                },
              },
            ],
            defaultPolicy,
            now,
          })

          const tick = yield* lightbulb.admitScheduledLoopRuns({
            accountID: created.goal.account_id,
            now: now + 2_000,
            source: { cron_id: "cron-heartbeat-1" },
          })
          const emptyTick = yield* lightbulb.admitScheduledLoopRuns({
            accountID: empty.goal.account_id,
            now: now + 2_000,
            source: { cron_id: "cron-heartbeat-empty" },
          })
          const runs = yield* database.db
            .select()
            .from(LightbulbRunTable)
            .where(eq(LightbulbRunTable.account_id, created.goal.account_id))
            .all()
            .pipe(Effect.orDie)
          const tickEvents = yield* database.db
            .select()
            .from(LightbulbEventTable)
            .where(eq(LightbulbEventTable.type, "lightbulb.scheduler_tick.completed"))
            .all()
            .pipe(Effect.orDie)
          const dashboard = yield* lightbulb.readDashboard(created.goal.account_id)

          expect(tick).toMatchObject({
            admittedCount: 1,
            skippedCount: 2,
            outcomes: [
              expect.objectContaining({
                loopID: dueLoopID,
                profileID: "due",
                outcome: "admitted",
                classification: "due",
                reason: null,
              }),
              expect.objectContaining({
                loopID: futureLoopID,
                profileID: "future",
                outcome: "skipped",
                classification: "not_due",
                reason: "next_due_at_in_future",
              }),
              expect.objectContaining({
                loopID: disabledLoopID,
                profileID: "disabled",
                outcome: "skipped",
                classification: "disabled",
                reason: "loop_disabled",
              }),
            ],
          })
          expect(emptyTick).toMatchObject({
            admittedCount: 0,
            skippedCount: 0,
            outcomes: [],
          })
          expect(runs).toHaveLength(1)
          expect(tickEvents).toHaveLength(2)
          expect(tickEvents).toEqual(
            expect.arrayContaining([
              expect.objectContaining({
                account_id: created.goal.account_id,
                aggregate_type: "account",
                aggregate_id: created.goal.account_id,
                data: expect.objectContaining({
                  admitted_count: 1,
                  skipped_count: 2,
                  outcome_count: 3,
                  source: { cron_id: "cron-heartbeat-1" },
                }),
              }),
              expect.objectContaining({
                account_id: empty.goal.account_id,
                aggregate_type: "account",
                aggregate_id: empty.goal.account_id,
                data: expect.objectContaining({
                  admitted_count: 0,
                  skipped_count: 0,
                  outcome_count: 0,
                  source: { cron_id: "cron-heartbeat-empty" },
                }),
              }),
            ]),
          )
          expect(dashboard?.operations.schedulerTicks).toEqual([
            expect.objectContaining({
              id: tick.eventID,
              trigger: "schedule",
              admittedCount: 1,
              skippedCount: 2,
              outcomeCount: 3,
              source: { cron_id: "cron-heartbeat-1" },
              outcomes: [
                expect.objectContaining({
                  loopID: dueLoopID,
                  profileID: "due",
                  outcome: "admitted",
                  classification: "due",
                  reason: null,
                }),
                expect.objectContaining({
                  loopID: futureLoopID,
                  profileID: "future",
                  outcome: "skipped",
                  classification: "not_due",
                  reason: "next_due_at_in_future",
                }),
                expect.objectContaining({
                  loopID: disabledLoopID,
                  profileID: "disabled",
                  outcome: "skipped",
                  classification: "disabled",
                  reason: "loop_disabled",
                }),
              ],
            }),
          ])
        }).pipe(Effect.provide(layer(tmp.path))),
      ),
    ),
  )
})
