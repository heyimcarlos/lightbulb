import path from "path"
import { describe, expect } from "bun:test"
import { eq } from "drizzle-orm"
import { Effect, Layer } from "effect"
import { Database } from "@opencode-ai/core/database/database"
import { Lightbulb } from "@opencode-ai/core/lightbulb"
import { LightbulbLoopTable } from "@opencode-ai/core/lightbulb/sql"
import { tmpdir } from "./fixture/tmpdir"
import { it } from "./lib/effect"

const now = 1_000
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
  const database = Database.layerFromPath(path.join(directory, "lightbulb-loop-profile.db")).pipe(Layer.fresh)
  return Layer.mergeAll(database, Lightbulb.layer.pipe(Layer.provide(database)))
}

function discoveryProfile() {
  return Lightbulb.standardAccountLoopProfiles.filter((profile) => profile.profileID === "discovery")
}

describe("Lightbulb loop profile bootstrap", () => {
  it.live("creates standard account loop profiles and retries idempotently", () =>
    Effect.acquireRelease(
      Effect.promise(() => tmpdir()),
      (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
    ).pipe(
      Effect.flatMap((tmp) =>
        Effect.gen(function* () {
          const lightbulb = yield* Lightbulb.Service
          const created = yield* lightbulb.createOrAdoptGoal({
            accountName: "Loop Profile Account",
            title: "Bootstrap account loops",
            objective: "Create the standard loop profile set.",
          })
          const first = yield* lightbulb.bootstrapLoopProfiles({
            accountID: created.goal.account_id,
            goalID: created.goal.id,
            profiles: Lightbulb.standardAccountLoopProfiles,
            defaultPolicy,
            now,
          })
          const retry = yield* lightbulb.bootstrapLoopProfiles({
            accountID: created.goal.account_id,
            goalID: created.goal.id,
            profiles: Lightbulb.standardAccountLoopProfiles,
            defaultPolicy,
            now: now + 60_000,
          })
          const graph = yield* lightbulb.readAccountGraph(created.goal.account_id)

          expect(first.created.map((handle) => [handle.profileID, handle.loopID, handle.kind])).toEqual([
            ["discovery", Lightbulb.loopIDForProfile(created.goal.id, "discovery"), "discovery"],
            ["implementation", Lightbulb.loopIDForProfile(created.goal.id, "implementation"), "implementation"],
            ["debug", Lightbulb.loopIDForProfile(created.goal.id, "debug"), "debug"],
            ["review-integration", Lightbulb.loopIDForProfile(created.goal.id, "review-integration"), "integration"],
            ["status", Lightbulb.loopIDForProfile(created.goal.id, "status"), "status"],
          ])
          expect(first.handles.map((handle) => handle.schedule?.nextDueAt)).toEqual([
            now + defaultPolicy.schedule.cadenceMs,
            now + defaultPolicy.schedule.cadenceMs,
            now + defaultPolicy.schedule.cadenceMs,
            now + defaultPolicy.schedule.cadenceMs,
            now + defaultPolicy.schedule.cadenceMs,
          ])
          expect(retry.adopted.map((handle) => handle.profileID)).toEqual([
            "discovery",
            "implementation",
            "debug",
            "review-integration",
            "status",
          ])
          expect(retry.handles.map((handle) => handle.schedule?.nextDueAt)).toEqual(
            first.handles.map((handle) => handle.schedule?.nextDueAt),
          )
          expect(graph?.loops.map((loop) => [loop.id, loop.kind, loop.status])).toEqual([
            [Lightbulb.loopIDForProfile(created.goal.id, "discovery"), "discovery", "active"],
            [Lightbulb.loopIDForProfile(created.goal.id, "implementation"), "implementation", "active"],
            [Lightbulb.loopIDForProfile(created.goal.id, "debug"), "debug", "active"],
            [Lightbulb.loopIDForProfile(created.goal.id, "review-integration"), "integration", "active"],
            [Lightbulb.loopIDForProfile(created.goal.id, "status"), "status", "active"],
          ])
          expect(graph?.events.filter((event) => event.type === "lightbulb.loop_profile.created")).toHaveLength(5)
          expect(JSON.stringify(first)).not.toContain("transcript")
        }).pipe(Effect.provide(layer(tmp.path))),
      ),
    ),
  )

  it.live("adopts partial existing profiles and creates missing profiles", () =>
    Effect.acquireRelease(
      Effect.promise(() => tmpdir()),
      (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
    ).pipe(
      Effect.flatMap((tmp) =>
        Effect.gen(function* () {
          const lightbulb = yield* Lightbulb.Service
          const created = yield* lightbulb.createOrAdoptGoal({
            accountName: "Partial Profile Account",
            title: "Partial bootstrap",
            objective: "Adopt one existing loop and create a missing peer.",
          })
          yield* lightbulb.bootstrapLoopProfiles({
            accountID: created.goal.account_id,
            goalID: created.goal.id,
            profiles: discoveryProfile(),
            defaultPolicy,
            now,
          })
          const summary = yield* lightbulb.bootstrapLoopProfiles({
            accountID: created.goal.account_id,
            goalID: created.goal.id,
            profiles: Lightbulb.standardAccountLoopProfiles.filter((profile) =>
              profile.profileID === "discovery" || profile.profileID === "implementation",
            ),
            defaultPolicy,
            now,
          })
          const graph = yield* lightbulb.readAccountGraph(created.goal.account_id)

          expect(summary.adopted.map((handle) => handle.profileID)).toEqual(["discovery"])
          expect(summary.created.map((handle) => handle.profileID)).toEqual(["implementation"])
          expect(graph?.loops.map((loop) => loop.id)).toEqual([
            Lightbulb.loopIDForProfile(created.goal.id, "discovery"),
            Lightbulb.loopIDForProfile(created.goal.id, "implementation"),
          ])
          expect(graph?.events.filter((event) => event.type === "lightbulb.loop_profile.created")).toHaveLength(2)
        }).pipe(Effect.provide(layer(tmp.path))),
      ),
    ),
  )

  it.live("creates disabled loop handles from disabled defaults", () =>
    Effect.acquireRelease(
      Effect.promise(() => tmpdir()),
      (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
    ).pipe(
      Effect.flatMap((tmp) =>
        Effect.gen(function* () {
          const lightbulb = yield* Lightbulb.Service
          const created = yield* lightbulb.createOrAdoptGoal({
            accountName: "Disabled Profile Account",
            title: "Disabled bootstrap",
            objective: "Keep disabled profile state visible without scheduling work.",
          })
          const summary = yield* lightbulb.bootstrapLoopProfiles({
            accountID: created.goal.account_id,
            goalID: created.goal.id,
            profiles: discoveryProfile(),
            defaultPolicy: {
              ...defaultPolicy,
              schedule: {
                enabled: false,
                cadenceMs: defaultPolicy.schedule.cadenceMs,
              },
            },
            now,
          })
          const graph = yield* lightbulb.readAccountGraph(created.goal.account_id)

          expect(summary.skipped).toEqual([
            expect.objectContaining({
              profileID: "discovery",
              loopID: Lightbulb.loopIDForProfile(created.goal.id, "discovery"),
              outcome: "skipped",
              reason: "profile_disabled",
              schedule: {
                enabled: false,
                cadenceMs: defaultPolicy.schedule.cadenceMs,
                nextDueAt: null,
              },
            }),
          ])
          expect(graph?.loops.map((loop) => [loop.id, loop.status])).toEqual([
            [Lightbulb.loopIDForProfile(created.goal.id, "discovery"), "disabled"],
          ])
        }).pipe(Effect.provide(layer(tmp.path))),
      ),
    ),
  )

  it.live("creates held loop handles from budget-held defaults", () =>
    Effect.acquireRelease(
      Effect.promise(() => tmpdir()),
      (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
    ).pipe(
      Effect.flatMap((tmp) =>
        Effect.gen(function* () {
          const lightbulb = yield* Lightbulb.Service
          const created = yield* lightbulb.createOrAdoptGoal({
            accountName: "Held Profile Account",
            title: "Budget held bootstrap",
            objective: "Hold loops before dispatch when budget is exhausted.",
          })
          const summary = yield* lightbulb.bootstrapLoopProfiles({
            accountID: created.goal.account_id,
            goalID: created.goal.id,
            profiles: discoveryProfile(),
            defaultPolicy: {
              ...defaultPolicy,
              budget: {
                ...defaultPolicy.budget,
                status: "held",
                holdReason: "daily_cost_budget_exhausted",
              },
            },
            now,
          })
          const graph = yield* lightbulb.readAccountGraph(created.goal.account_id)

          expect(summary.held).toEqual([
            expect.objectContaining({
              profileID: "discovery",
              loopID: Lightbulb.loopIDForProfile(created.goal.id, "discovery"),
              outcome: "held",
              reason: "budget_held",
              schedule: {
                enabled: true,
                cadenceMs: defaultPolicy.schedule.cadenceMs,
                nextDueAt: null,
              },
              budget: expect.objectContaining({
                status: "held",
                holdReason: "daily_cost_budget_exhausted",
              }),
            }),
          ])
          expect(graph?.loops.map((loop) => [loop.id, loop.status])).toEqual([
            [Lightbulb.loopIDForProfile(created.goal.id, "discovery"), "held"],
          ])
        }).pipe(Effect.provide(layer(tmp.path))),
      ),
    ),
  )

  it.live("recomputes due time when a managed loop moves in and out of budget hold", () =>
    Effect.acquireRelease(
      Effect.promise(() => tmpdir()),
      (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
    ).pipe(
      Effect.flatMap((tmp) =>
        Effect.gen(function* () {
          const lightbulb = yield* Lightbulb.Service
          const created = yield* lightbulb.createOrAdoptGoal({
            accountName: "Budget Refresh Account",
            title: "Refresh budget holds",
            objective: "Recompute schedule due times when budget status changes.",
          })
          const first = yield* lightbulb.bootstrapLoopProfiles({
            accountID: created.goal.account_id,
            goalID: created.goal.id,
            profiles: discoveryProfile(),
            defaultPolicy,
            now,
          })
          const held = yield* lightbulb.bootstrapLoopProfiles({
            accountID: created.goal.account_id,
            goalID: created.goal.id,
            profiles: discoveryProfile(),
            defaultPolicy: {
              ...defaultPolicy,
              budget: {
                ...defaultPolicy.budget,
                status: "held",
                holdReason: "daily_cost_budget_exhausted",
              },
            },
            now: now + 60_000,
          })
          const reopened = yield* lightbulb.bootstrapLoopProfiles({
            accountID: created.goal.account_id,
            goalID: created.goal.id,
            profiles: discoveryProfile(),
            defaultPolicy,
            now: now + 120_000,
          })

          expect(first.created[0]?.schedule?.nextDueAt).toBe(now + defaultPolicy.schedule.cadenceMs)
          expect(held.held[0]?.schedule?.nextDueAt).toBe(null)
          expect(reopened.adopted[0]?.schedule?.nextDueAt).toBe(now + 120_000 + defaultPolicy.schedule.cadenceMs)
        }).pipe(Effect.provide(layer(tmp.path))),
      ),
    ),
  )

  it.live("recomputes due time when a managed loop budget envelope changes", () =>
    Effect.acquireRelease(
      Effect.promise(() => tmpdir()),
      (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
    ).pipe(
      Effect.flatMap((tmp) =>
        Effect.gen(function* () {
          const lightbulb = yield* Lightbulb.Service
          const created = yield* lightbulb.createOrAdoptGoal({
            accountName: "Budget Limit Refresh Account",
            title: "Refresh budget limits",
            objective: "Recompute schedule due times when managed budget limits change.",
          })
          yield* lightbulb.bootstrapLoopProfiles({
            accountID: created.goal.account_id,
            goalID: created.goal.id,
            profiles: discoveryProfile(),
            defaultPolicy,
            now,
          })
          const refreshed = yield* lightbulb.bootstrapLoopProfiles({
            accountID: created.goal.account_id,
            goalID: created.goal.id,
            profiles: discoveryProfile(),
            defaultPolicy: {
              ...defaultPolicy,
              budget: {
                ...defaultPolicy.budget,
                maxRunsPerDay: defaultPolicy.budget.maxRunsPerDay + 1,
              },
            },
            now: now + 180_000,
          })

          expect(refreshed.adopted[0]?.schedule?.nextDueAt).toBe(now + 180_000 + defaultPolicy.schedule.cadenceMs)
          expect(refreshed.adopted[0]?.budget?.maxRunsPerDay).toBe(defaultPolicy.budget.maxRunsPerDay + 1)
        }).pipe(Effect.provide(layer(tmp.path))),
      ),
    ),
  )

  it.live("rejects invalid profiles with bounded reasons and no loop rows", () =>
    Effect.acquireRelease(
      Effect.promise(() => tmpdir()),
      (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
    ).pipe(
      Effect.flatMap((tmp) =>
        Effect.gen(function* () {
          const lightbulb = yield* Lightbulb.Service
          const created = yield* lightbulb.createOrAdoptGoal({
            accountName: "Invalid Profile Account",
            title: "Invalid bootstrap",
            objective: "Reject malformed profile definitions before creating loops.",
          })
          const summary = yield* lightbulb.bootstrapLoopProfiles({
            accountID: created.goal.account_id,
            goalID: created.goal.id,
            profiles: [
              {
                profileID: "Bad ID",
                kind: "discovery",
                summary: "Invalid profile id.",
              },
              {
                profileID: "duplicate",
                kind: "debug",
                summary: "First duplicate.",
              },
              {
                profileID: "duplicate",
                kind: "implementation",
                summary: "Second duplicate.",
              },
              {
                profileID: "bad-kind",
                kind: "unknown" as Lightbulb.LoopKind,
                summary: "Invalid kind.",
              },
              {
                profileID: "bad-cadence",
                kind: "status",
                summary: "Invalid cadence.",
                schedule: {
                  cadenceMs: 0,
                },
              },
              {
                profileID: "bad-budget-status",
                kind: "implementation",
                summary: "Invalid budget status.",
                budget: {
                  status: "closed" as "open",
                },
              },
            ],
            defaultPolicy,
            now,
          })
          const graph = yield* lightbulb.readAccountGraph(created.goal.account_id)

          expect(summary.invalid.map((handle) => [handle.profileID, handle.reason])).toEqual([
            ["Bad ID", "invalid_profile_id"],
            ["duplicate", "duplicate_profile_id"],
            ["duplicate", "duplicate_profile_id"],
            ["bad-kind", "invalid_loop_kind"],
            ["bad-cadence", "invalid_cadence"],
            ["bad-budget-status", "invalid_budget"],
          ])
          expect(graph?.loops).toEqual([])
          expect(graph?.events.filter((event) => event.type === "lightbulb.loop_profile.created")).toEqual([])
        }).pipe(Effect.provide(layer(tmp.path))),
      ),
    ),
  )

  it.live("returns missing-goal skip reasons without creating operator events", () =>
    Effect.acquireRelease(
      Effect.promise(() => tmpdir()),
      (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
    ).pipe(
      Effect.flatMap((tmp) =>
        Effect.gen(function* () {
          const lightbulb = yield* Lightbulb.Service
          const summary = yield* lightbulb.bootstrapLoopProfiles({
            accountID: "lbacc_missing" as Lightbulb.AccountID,
            goalID: "lbgoal_missing" as Lightbulb.GoalID,
            profiles: discoveryProfile(),
            defaultPolicy,
            now,
          })
          const graph = yield* lightbulb.readAccountGraph("lbacc_missing" as Lightbulb.AccountID)

          expect(summary.skipped).toEqual([
            expect.objectContaining({
              profileID: "discovery",
              loopID: null,
              outcome: "skipped",
              reason: "missing_goal",
            }),
          ])
          expect(graph).toBeUndefined()
        }).pipe(Effect.provide(layer(tmp.path))),
      ),
    ),
  )

  it.live("skips intentional custom schedule policy without overwriting it", () =>
    Effect.acquireRelease(
      Effect.promise(() => tmpdir()),
      (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
    ).pipe(
      Effect.flatMap((tmp) =>
        Effect.gen(function* () {
          const lightbulb = yield* Lightbulb.Service
          const database = yield* Database.Service
          const created = yield* lightbulb.createOrAdoptGoal({
            accountName: "Custom Profile Account",
            title: "Custom bootstrap",
            objective: "Preserve operator-customized schedules.",
          })
          const loopID = Lightbulb.loopIDForProfile(created.goal.id, "discovery")
          yield* database.db
            .insert(LightbulbLoopTable)
            .values({
              id: loopID,
              account_id: created.goal.account_id,
              goal_id: created.goal.id,
              kind: "discovery",
              status: "active",
              summary: "Operator custom discovery cadence.",
              metadata: {
                loop_profile: {
                  profile_id: "discovery",
                  managed: true,
                  schedule: {
                    enabled: true,
                    cadence_ms: 123_000,
                    next_due_at: 999_000,
                    custom: true,
                  },
                  budget: {
                    status: "open",
                    max_runs_per_day: 3,
                    max_tokens: 120_000,
                    max_cost_usd: 12,
                    max_context_tokens: 480_000,
                    custom: false,
                  },
                },
              },
            })
            .run()
            .pipe(Effect.orDie)

          const summary = yield* lightbulb.bootstrapLoopProfiles({
            accountID: created.goal.account_id,
            goalID: created.goal.id,
            profiles: discoveryProfile(),
            defaultPolicy,
            now,
          })
          const loop = yield* database.db
            .select()
            .from(LightbulbLoopTable)
            .where(eq(LightbulbLoopTable.id, loopID))
            .get()
            .pipe(Effect.orDie)

          expect(summary.skipped).toEqual([
            expect.objectContaining({
              profileID: "discovery",
              loopID,
              outcome: "skipped",
              reason: "custom_policy",
              schedule: expect.objectContaining({
                enabled: true,
                cadenceMs: 123_000,
                nextDueAt: 999_000,
              }),
            }),
          ])
          expect(loop?.summary).toBe("Operator custom discovery cadence.")
          expect(loop?.metadata).toMatchObject({
            loop_profile: {
              schedule: {
                cadence_ms: 123_000,
                next_due_at: 999_000,
                custom: true,
              },
            },
          })
        }).pipe(Effect.provide(layer(tmp.path))),
      ),
    ),
  )
})
