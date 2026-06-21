import path from "path"
import { describe, expect } from "bun:test"
import { Effect, Layer } from "effect"
import { Database } from "@opencode-ai/core/database/database"
import { Lightbulb } from "@opencode-ai/core/lightbulb"
import { LightbulbRunTable } from "@opencode-ai/core/lightbulb/sql"
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
  const database = Database.layerFromPath(path.join(directory, "lightbulb-scheduler.db")).pipe(Layer.fresh)
  return Layer.mergeAll(database, Lightbulb.layer.pipe(Layer.provide(database)))
}

describe("Lightbulb recurring loop scheduler", () => {
  it.live("classifies persisted loops as due, not due, disabled, or budget-held", () =>
    Effect.acquireRelease(
      Effect.promise(() => tmpdir()),
      (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
    ).pipe(
      Effect.flatMap((tmp) =>
        Effect.gen(function* () {
          const lightbulb = yield* Lightbulb.Service
          const created = yield* lightbulb.createOrAdoptGoal({
            accountName: "Scheduler Account",
            title: "Recurring loop schedule",
            objective: "Persist recurring schedules and classify due state without provider calls.",
          })
          yield* lightbulb.bootstrapLoopProfiles({
            accountID: created.goal.account_id,
            goalID: created.goal.id,
            profiles: [
              {
                profileID: "due",
                kind: "discovery",
                summary: "Due recurring loop.",
                schedule: {
                  cadenceMs: 1_000,
                },
              },
              {
                profileID: "not-due",
                kind: "implementation",
                summary: "Future recurring loop.",
              },
              {
                profileID: "disabled",
                kind: "status",
                summary: "Disabled recurring loop.",
                schedule: {
                  enabled: false,
                },
              },
              {
                profileID: "budget-held",
                kind: "debug",
                summary: "Cost-held recurring loop.",
                budget: {
                  status: "held",
                  holdReason: "daily_cost_budget_exhausted",
                },
              },
            ],
            defaultPolicy,
            now,
          })

          const schedules = yield* lightbulb.readLoopSchedules({
            accountID: created.goal.account_id,
            now: now + 2_000,
          })
          const dashboard = yield* lightbulb.readDashboard(created.goal.account_id)

          expect(schedules.map((schedule) => [schedule.profileID, schedule.classification, schedule.reason])).toEqual([
            ["due", "due", null],
            ["not-due", "not_due", "next_due_at_in_future"],
            ["disabled", "disabled", "loop_disabled"],
            ["budget-held", "budget_held", "daily_cost_budget_exhausted"],
          ])
          expect(schedules[0]?.schedule).toEqual({
            enabled: true,
            cadenceMs: 1_000,
            nextDueAt: now + 1_000,
          })
          expect(schedules[0]?.budget).toMatchObject({
            status: "open",
            maxRunsPerDay: 3,
            maxCostUsd: 12,
            maxContextTokens: 480_000,
            holdReason: null,
          })
          expect(schedules[3]?.schedule).toEqual({
            enabled: true,
            cadenceMs: 60_000,
            nextDueAt: null,
          })
          expect(schedules[3]?.budget).toMatchObject({
            status: "held",
            holdReason: "daily_cost_budget_exhausted",
          })
          expect(
            dashboard?.goals[0]?.loops.map((loop) => [
              loop.profileID,
              loop.schedule?.nextDueAt,
              loop.budget?.holdReason,
            ]),
          ).toEqual([
            ["due", now + 1_000, null],
            ["not-due", now + 60_000, null],
            ["disabled", null, null],
            ["budget-held", null, "daily_cost_budget_exhausted"],
          ])
        }).pipe(Effect.provide(layer(tmp.path))),
      ),
    ),
  )

  it.live("holds due loops when the persisted daily run-count budget is exhausted", () =>
    Effect.acquireRelease(
      Effect.promise(() => tmpdir()),
      (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
    ).pipe(
      Effect.flatMap((tmp) =>
        Effect.gen(function* () {
          const lightbulb = yield* Lightbulb.Service
          const database = yield* Database.Service
          const created = yield* lightbulb.createOrAdoptGoal({
            accountName: "Run Budget Account",
            title: "Recurring loop run budget",
            objective: "Hold recurring loops after the daily run budget is exhausted.",
          })
          const loopID = Lightbulb.loopIDForProfile(created.goal.id, "run-budget")

          yield* lightbulb.bootstrapLoopProfiles({
            accountID: created.goal.account_id,
            goalID: created.goal.id,
            profiles: [
              {
                profileID: "run-budget",
                kind: "status",
                summary: "Run-count-held recurring loop.",
                schedule: {
                  cadenceMs: 1_000,
                },
                budget: {
                  maxRunsPerDay: 1,
                },
              },
            ],
            defaultPolicy,
            now,
          })
          yield* database.db
            .insert(LightbulbRunTable)
            .values({
              id: Lightbulb.RunID.create(),
              account_id: created.goal.account_id,
              loop_id: loopID,
              status: "complete",
              review_status: "not_requested",
              debug_status: "not_started",
              gate_status: "passed",
              summary: "Existing scheduler run for the current UTC day.",
              started_at: now + 500,
              completed_at: now + 600,
              time_created: now + 500,
              time_updated: now + 600,
            })
            .run()
            .pipe(Effect.orDie)

          const schedules = yield* lightbulb.readLoopSchedules({
            accountID: created.goal.account_id,
            now: now + 2_000,
          })

          expect(schedules).toEqual([
            expect.objectContaining({
              profileID: "run-budget",
              classification: "budget_held",
              reason: "daily_run_budget_exhausted",
              budget: expect.objectContaining({
                status: "held",
                holdReason: "daily_run_budget_exhausted",
                maxRunsPerDay: 1,
                runsStartedToday: 1,
                remainingRunsToday: 0,
              }),
            }),
          ])
        }).pipe(Effect.provide(layer(tmp.path))),
      ),
    ),
  )
})
