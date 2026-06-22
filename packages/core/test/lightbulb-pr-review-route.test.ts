import path from "path"
import { describe, expect } from "bun:test"
import { and, eq } from "drizzle-orm"
import { Effect, Layer } from "effect"
import { Database } from "@opencode-ai/core/database/database"
import { Lightbulb } from "@opencode-ai/core/lightbulb"
import {
  LightbulbAccountTable,
  LightbulbEventTable,
  LightbulbGoalTable,
  LightbulbPRReviewRouteTable,
  LightbulbPRReviewRouteWakeTable,
  LightbulbRunTable,
  LightbulbWorkerTable,
} from "@opencode-ai/core/lightbulb/sql"
import { tmpdir } from "./fixture/tmpdir"
import { it } from "./lib/effect"

function layer(directory: string) {
  const database = Database.layerFromPath(path.join(directory, "lightbulb.db")).pipe(Layer.fresh)
  return Layer.mergeAll(database, Lightbulb.layer.pipe(Layer.provide(database)))
}

describe("Lightbulb PR review routes", () => {
  it.live("admits a PR review candidate into a visible read-only route", () =>
    Effect.acquireRelease(
      Effect.promise(() => tmpdir()),
      (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
    ).pipe(
      Effect.flatMap((tmp) =>
        Effect.gen(function* () {
          const lightbulb = yield* Lightbulb.Service
          const database = yield* Database.Service
          const accountID = Lightbulb.AccountID.create()
          yield* seedAccount(database, accountID)

          const candidates = yield* lightbulb.discoverPRReviewCandidates({
            accountID,
            repository: "heyimcarlos/lightbulb",
            scannedAt: 1_000,
            pulls: [scanPull(70, "Discover PR review goal candidates", "pr-candidates")],
          })
          const admission = yield* lightbulb.admitPRReviewRoute({
            accountID,
            candidateID: candidates.candidates[0]!.id,
            now: 2_000,
            source: { trigger: "scheduler" },
          })
          const dashboard = yield* lightbulb.readDashboard(accountID)
          const events = yield* database.db
            .select()
            .from(LightbulbEventTable)
            .where(eq(LightbulbEventTable.type, "lightbulb.pr_review_route.admitted"))
            .all()
            .pipe(Effect.orDie)

          expect(admission.outcome).toBe("admitted")
          expect(admission.heldReason).toBeNull()
          expect(admission.route?.repository).toBe("heyimcarlos/lightbulb")
          expect(admission.route?.pullNumber).toBe(70)
          expect(admission.route?.currentStop).toMatchObject({
            kind: "review",
            title: "Collect review evidence",
            status: "active",
          })
          expect(admission.route?.latestEvidence).toMatchObject({
            observedAt: 2_000,
            source: "schedule_tick",
            data: { trigger: "scheduler" },
          })
          expect(admission.route?.nextWakeSource).toBe("worker_report")
          expect(admission.route?.mergeReady).toBe(false)
          expect(dashboard?.inbox.prReviewRoutes).toEqual(admission.route ? [admission.route] : [])
          expect(JSON.stringify(dashboard)).not.toContain("rawTranscript")
          expect(events).toHaveLength(1)
          expect(events[0]?.data).toMatchObject({
            candidate_id: candidates.candidates[0]!.id,
            route_id: admission.route?.id,
            repository: "heyimcarlos/lightbulb",
            pr_number: 70,
            review_only: true,
          })
          expect(yield* database.db.select().from(LightbulbGoalTable).all().pipe(Effect.orDie)).toHaveLength(1)
          expect(yield* database.db.select().from(LightbulbRunTable).all().pipe(Effect.orDie)).toEqual([])
          expect(yield* database.db.select().from(LightbulbWorkerTable).all().pipe(Effect.orDie)).toEqual([])
        }).pipe(Effect.provide(layer(tmp.path))),
      ),
    ),
  )

  it.live("adopts existing routes and holds additional active PRs in the same repository", () =>
    Effect.acquireRelease(
      Effect.promise(() => tmpdir()),
      (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
    ).pipe(
      Effect.flatMap((tmp) =>
        Effect.gen(function* () {
          const lightbulb = yield* Lightbulb.Service
          const database = yield* Database.Service
          const accountID = Lightbulb.AccountID.create()
          yield* seedAccount(database, accountID)

          const candidates = yield* lightbulb.discoverPRReviewCandidates({
            accountID,
            repository: "heyimcarlos/lightbulb",
            scannedAt: 1_000,
            pulls: [
              scanPull(66, "Add PR review route runner read model", "review-route"),
              scanPull(67, "Show PR review goal status in TUI", "tui-route"),
            ],
          })
          const admitted = yield* lightbulb.admitPRReviewRoute({
            accountID,
            candidateID: candidates.candidates[0]!.id,
            now: 2_000,
          })
          const adopted = yield* lightbulb.admitPRReviewRoute({
            accountID,
            candidateID: candidates.candidates[0]!.id,
            now: 3_000,
          })
          const held = yield* lightbulb.admitPRReviewRoute({
            accountID,
            candidateID: candidates.candidates[1]!.id,
            now: 4_000,
          })
          const routeRows = yield* database.db
            .select()
            .from(LightbulbPRReviewRouteTable)
            .where(eq(LightbulbPRReviewRouteTable.account_id, accountID))
            .all()
            .pipe(Effect.orDie)
          const heldEvents = yield* database.db
            .select()
            .from(LightbulbEventTable)
            .where(eq(LightbulbEventTable.type, "lightbulb.pr_review_route.held"))
            .all()
            .pipe(Effect.orDie)

          expect(admitted.outcome).toBe("admitted")
          expect(adopted.outcome).toBe("adopted")
          expect(adopted.route?.id).toBe(admitted.route?.id)
          expect(held.outcome).toBe("held")
          expect(held.heldReason).toBe("active_repository_route")
          expect(held.route?.id).toBe(admitted.route?.id)
          expect(routeRows.map((row) => [row.repository, row.active_repository_key, row.pr_number, row.status])).toEqual([
            ["heyimcarlos/lightbulb", "heyimcarlos/lightbulb", 66, "active"],
          ])
          expect(heldEvents[0]?.data).toMatchObject({
            candidate_id: candidates.candidates[1]!.id,
            held_reason: "active_repository_route",
            active_route_id: admitted.route?.id,
          })
        }).pipe(Effect.provide(layer(tmp.path))),
      ),
    ),
  )

  it.live("records compact route wakes and coalesces the read model to the latest decision", () =>
    Effect.acquireRelease(
      Effect.promise(() => tmpdir()),
      (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
    ).pipe(
      Effect.flatMap((tmp) =>
        Effect.gen(function* () {
          const lightbulb = yield* Lightbulb.Service
          const database = yield* Database.Service
          const accountID = Lightbulb.AccountID.create()
          yield* seedAccount(database, accountID)

          const candidates = yield* lightbulb.discoverPRReviewCandidates({
            accountID,
            repository: "heyimcarlos/lightbulb",
            scannedAt: 1_000,
            pulls: [scanPull(71, "Review route wake evidence", "route-wake")],
          })
          const admitted = yield* lightbulb.admitPRReviewRoute({
            accountID,
            candidateID: candidates.candidates[0]!.id,
            now: 2_000,
          })
          const worker = {
            id: Lightbulb.WorkerID.create(),
            role: "bounded PR reviewer",
            status: "running" as const,
            summary: "Review worker is collecting comments.",
          }
          yield* lightbulb.recordPRReviewRouteWake({
            routeID: admitted.route!.id,
            source: "worker_report",
            summary: "Worker found no blocking review comments.",
            now: 3_000,
            activeWorker: worker,
            currentStopKind: "review",
            nextWakeSource: "ci_evidence",
            artifactID: Lightbulb.ArtifactID.make("lbartifact_worker_report"),
          })
          const ciWake = yield* lightbulb.recordPRReviewRouteWake({
            routeID: admitted.route!.id,
            source: "ci_evidence",
            summary: "Required checks are green; route can report merge readiness.",
            now: 4_000,
            status: "success",
            currentStopKind: "decision",
            nextWakeSource: "human_steering",
            activeWorker: null,
            mergeReady: true,
            data: { checkSuites: 9 },
          })
          const dashboard = yield* lightbulb.readDashboard(accountID)
          const wakes = yield* database.db
            .select()
            .from(LightbulbPRReviewRouteWakeTable)
            .where(eq(LightbulbPRReviewRouteWakeTable.route_id, admitted.route!.id))
            .all()
            .pipe(Effect.orDie)
          const wakeEvents = yield* database.db
            .select()
            .from(LightbulbEventTable)
            .where(
              and(
                eq(LightbulbEventTable.aggregate_id, admitted.route!.id),
                eq(LightbulbEventTable.type, "lightbulb.pr_review_route.woke"),
              ),
            )
            .all()
            .pipe(Effect.orDie)

          expect(ciWake.route.currentStop).toMatchObject({ kind: "decision", status: "active" })
          expect(ciWake.route.latestEvidence).toEqual({
            observedAt: 4_000,
            source: "ci_evidence",
            summary: "Required checks are green; route can report merge readiness.",
            status: "success",
            data: { checkSuites: 9 },
          })
          expect(ciWake.route.activeWorker).toBeNull()
          expect(ciWake.route.nextWakeSource).toBe("human_steering")
          expect(ciWake.route.mergeReady).toBe(true)
          expect(dashboard?.inbox.prReviewRoutes[0]).toEqual(ciWake.route)
          expect(wakes.map((wake) => [wake.source, wake.summary, wake.next_wake_source, wake.merge_ready])).toEqual([
            ["schedule_tick", "Admitted heyimcarlos/lightbulb#71 into the read-only PR review route.", "worker_report", false],
            ["worker_report", "Worker found no blocking review comments.", "ci_evidence", false],
            ["ci_evidence", "Required checks are green; route can report merge readiness.", "human_steering", true],
          ])
          expect(wakeEvents).toHaveLength(2)
        }).pipe(Effect.provide(layer(tmp.path))),
      ),
    ),
  )
})

function scanPull(number: number, title: string, headRef: string): Lightbulb.PRReviewCandidateScanPull {
  return {
    number,
    title,
    url: `https://github.com/heyimcarlos/lightbulb/pull/${number}`,
    state: "open",
    baseRef: "dev",
    headRef,
    headSha: `${number}`.repeat(40).slice(0, 40),
    metadata: { rawTranscript: "must not appear in dashboard" },
  }
}

function seedAccount(database: Database.Interface, accountID: Lightbulb.AccountID) {
  return database.db
    .insert(LightbulbAccountTable)
    .values({
      id: accountID,
      name: "PR Review Routes",
      status: "active",
      time_created: 1,
      time_updated: 1,
    })
    .run()
    .pipe(Effect.orDie)
}
