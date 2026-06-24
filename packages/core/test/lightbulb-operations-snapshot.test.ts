import path from "path"
import { describe, expect } from "bun:test"
import { eq } from "drizzle-orm"
import { Effect, Layer } from "effect"
import { Database } from "@opencode-ai/core/database/database"
import { Lightbulb } from "@opencode-ai/core/lightbulb"
import {
  LightbulbAccountTable,
  LightbulbEventTable,
  LightbulbLoopTable,
  LightbulbOperationsSnapshotTable,
} from "@opencode-ai/core/lightbulb/sql"
import { tmpdir } from "./fixture/tmpdir"
import { it } from "./lib/effect"

const now = Date.UTC(2026, 0, 4)

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
  const database = Database.layerFromPath(path.join(directory, "lightbulb-operations-snapshot.db")).pipe(Layer.fresh)
  return Layer.mergeAll(database, Lightbulb.layer.pipe(Layer.provide(database)))
}

describe("Lightbulb operations snapshot", () => {
  it.live("publishes one empty account snapshot and retries without duplicating rows or events", () =>
    Effect.acquireRelease(
      Effect.promise(() => tmpdir()),
      (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
    ).pipe(
      Effect.flatMap((tmp) =>
        Effect.gen(function* () {
          const lightbulb = yield* Lightbulb.Service
          const database = yield* Database.Service
          const accountID = Lightbulb.AccountID.create()
          yield* database.db
            .insert(LightbulbAccountTable)
            .values({
              id: accountID,
              name: "Empty Operations Account",
              status: "active",
              metadata: null,
              time_created: now,
              time_updated: now,
            })
            .run()
            .pipe(Effect.orDie)

          const first = yield* lightbulb.publishOperationsSnapshot({ accountID, now })
          const second = yield* lightbulb.publishOperationsSnapshot({ accountID, now: now + 1_000 })
          const rows = yield* database.db.select().from(LightbulbOperationsSnapshotTable).all().pipe(Effect.orDie)
          const events = yield* database.db
            .select()
            .from(LightbulbEventTable)
            .where(eq(LightbulbEventTable.type, "lightbulb.operations_snapshot.published"))
            .all()
            .pipe(Effect.orDie)
          const dashboard = yield* lightbulb.readDashboard(accountID)

          expect(first.changed).toBe(true)
          expect(first.eventID).toBeTruthy()
          expect(first.snapshot.status).toBe("empty")
          expect(first.snapshot.counts.loops.total).toBe(0)
          expect(second.changed).toBe(false)
          expect(second.eventID).toBeNull()
          expect(rows).toHaveLength(1)
          expect(events).toHaveLength(1)
          expect(dashboard?.operations.snapshot?.id).toBe(first.snapshot.id)
        }).pipe(Effect.provide(layer(tmp.path))),
      ),
    ),
  )

  it.live("summarizes seeded dogfood work with ready issue, launch attempt, review gate, and report handles", () =>
    Effect.acquireRelease(
      Effect.promise(() => tmpdir()),
      (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
    ).pipe(
      Effect.flatMap((tmp) =>
        Effect.gen(function* () {
          const lightbulb = yield* Lightbulb.Service
          const seeded = yield* lightbulb.seedTracerBullet()
          const result = yield* lightbulb.publishOperationsSnapshot({ accountID: seeded.accountID, now })
          const dashboard = yield* lightbulb.readDashboard(seeded.accountID)

          expect(result.snapshot.status).toBe("attention_required")
          expect(result.snapshot.counts.discovery.topActionable).toBe(1)
          expect(result.snapshot.counts.gates.pendingReview).toBe(1)
          expect(result.snapshot.counts.launchAttempts.complete).toBe(1)
          expect(result.snapshot.counts.artifacts.reports).toBe(1)
          expect(result.snapshot.handles.readyWork[0]).toMatchObject({
            id: "github:issue:33",
            issueRef: "#33",
            reason: "create_pickup_packet",
          })
          expect(result.snapshot.handles.reviewGates[0]?.id).toBe(seeded.gateID)
          expect(result.snapshot.handles.recentArtifacts[0]?.id).toBe(seeded.artifactID)
          expect(dashboard?.operations.snapshot?.sourceHash).toBe(result.snapshot.sourceHash)
        }).pipe(Effect.provide(layer(tmp.path))),
      ),
    ),
  )

  it.live("captures no-op, budget, dependency release, stale worker, and recovery hold state", () =>
    Effect.acquireRelease(
      Effect.promise(() => tmpdir()),
      (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
    ).pipe(
      Effect.flatMap((tmp) =>
        Effect.gen(function* () {
          const lightbulb = yield* Lightbulb.Service
          const database = yield* Database.Service
          const created = yield* lightbulb.createOrAdoptGoal({
            accountName: "Held Operations Account",
            title: "Operations snapshot holds",
            objective: "Expose held loop state through one compact snapshot.",
          })
          yield* lightbulb.bootstrapLoopProfiles({
            accountID: created.goal.account_id,
            goalID: created.goal.id,
            profiles: [
              {
                profileID: "future",
                kind: "status",
                summary: "Future status loop.",
              },
              {
                profileID: "budget",
                kind: "implementation",
                summary: "Budget-held implementation loop.",
                budget: {
                  status: "held",
                  holdReason: "daily_cost_budget_exhausted",
                },
              },
            ],
            defaultPolicy,
            now,
          })
          const heldLoopID = Lightbulb.loopIDForProfile(created.goal.id, "budget")
          const heldLoop = yield* database.db
            .select()
            .from(LightbulbLoopTable)
            .where(eq(LightbulbLoopTable.id, heldLoopID))
            .get()
            .pipe(Effect.orDie)
          yield* database.db
            .update(LightbulbLoopTable)
            .set({
              metadata: {
                ...(heldLoop?.metadata ?? {}),
                supervisor: {
                  stale_worker_reason: "heartbeat_missing",
                  recovery_required_reason: "previous_worker_exit_unknown",
                },
              },
            })
            .where(eq(LightbulbLoopTable.id, heldLoopID))
            .run()
            .pipe(Effect.orDie)
          yield* database.db
            .insert(LightbulbEventTable)
            .values({
              id: Lightbulb.EventID.create(),
              account_id: created.goal.account_id,
              aggregate_type: "issue",
              aggregate_id: "github:issue:29",
              type: "lightbulb.issue_dependency.reconciled",
              summary: "Issue #29 dependency hold cleared by github:issue:10:closed.",
              data: { issue_ref: "#29", status: "dependency_satisfied" },
              time_created: now,
            })
            .run()
            .pipe(Effect.orDie)
          yield* lightbulb.admitScheduledLoopRuns({
            accountID: created.goal.account_id,
            now,
            trigger: "manual",
          })

          const result = yield* lightbulb.publishOperationsSnapshot({ accountID: created.goal.account_id, now })

          expect(result.snapshot.status).toBe("attention_required")
          expect(result.snapshot.counts.loops.noOp).toBe(2)
          expect(result.snapshot.counts.budget.held).toBe(1)
          expect(result.snapshot.counts.budget.exhausted).toBe(1)
          expect(result.snapshot.counts.dependencies.released).toBe(1)
          expect(result.snapshot.counts.loops.stale).toBe(1)
          expect(result.snapshot.counts.loops.recoveryRequired).toBe(1)
          expect(result.snapshot.handles.budgetHolds[0]).toMatchObject({
            id: heldLoopID,
            reason: "daily_cost_budget_exhausted",
          })
          expect(result.snapshot.handles.dependencyReleases[0]).toMatchObject({
            issueRef: "#29",
            status: "dependency_satisfied",
          })
        }).pipe(Effect.provide(layer(tmp.path))),
      ),
    ),
  )
})
