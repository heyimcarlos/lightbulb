import path from "path"
import { describe, expect } from "bun:test"
import { eq } from "drizzle-orm"
import { Effect, Layer } from "effect"
import { Database } from "@opencode-ai/core/database/database"
import { Lightbulb } from "@opencode-ai/core/lightbulb"
import {
  LightbulbAccountTable,
  LightbulbPRReviewRouteTable,
} from "@opencode-ai/core/lightbulb/sql"
import { tmpdir } from "./fixture/tmpdir"
import { it } from "./lib/effect"

function layer(directory: string) {
  const database = Database.layerFromPath(path.join(directory, "lightbulb.db")).pipe(Layer.fresh)
  return Layer.mergeAll(database, Lightbulb.layer.pipe(Layer.provide(database)))
}

describe("Lightbulb PR review route state digest", () => {
  it.live("groups watched, escalated, and recent PR review route state", () =>
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

          const ciRoute = yield* admitRoute(lightbulb, accountID, "heyimcarlos/lightbulb", 109, "ci-red", 1_000)
          yield* lightbulb.recordPRReviewRouteWake({
            routeID: ciRoute.id,
            source: "ci_evidence",
            summary: "Unit checks failed on the current head.",
            now: 2_000,
            status: "failure",
            currentStopKind: "verification",
            nextWakeSource: "worker_report",
            data: { failedChecks: 1, rawTranscript: "must not appear in digest" },
          })

          const blockedRoute = yield* admitRoute(lightbulb, accountID, "heyimcarlos/lightbulb-tools", 78, "review-loop", 1_100)
          yield* lightbulb.recordPRReviewRouteWake({
            routeID: blockedRoute.id,
            source: "worker_report",
            summary: "Worker collected review comments.",
            now: 2_100,
            activeWorker: {
              id: Lightbulb.WorkerID.create(),
              role: "bounded PR reviewer",
              status: "complete",
              summary: "Review worker returned compact findings.",
            },
            currentStopKind: "review",
            nextWakeSource: "review_evidence",
          })
          yield* lightbulb.recordPRReviewRouteWake({
            routeID: blockedRoute.id,
            source: "review_evidence",
            summary: "Reviewer requested changes.",
            now: 2_200,
            status: "changes_requested",
            currentStopKind: "review",
            blockedReason: "changes_requested",
            nextWakeSource: "human_steering",
            activeWorker: null,
            data: { humanDecision: "needs_rework" },
          })

          const readyRoute = yield* admitRoute(lightbulb, accountID, "heyimcarlos/lightbulb-app", 68, "desktop-route", 1_200)
          yield* lightbulb.recordPRReviewRouteWake({
            routeID: readyRoute.id,
            source: "ci_evidence",
            summary: "Checks and review gates are green.",
            now: 2_300,
            status: "success",
            currentStopKind: "decision",
            nextWakeSource: "human_steering",
            mergeReady: true,
          })

          const recentRoute = yield* admitRoute(lightbulb, accountID, "heyimcarlos/lightbulb-recent", 67, "tui-status", 1_300)
          yield* lightbulb.recordPRReviewRouteWake({
            routeID: recentRoute.id,
            source: "human_steering",
            summary: "Human accepted the merge-ready report.",
            now: 3_500,
            status: "approved",
            currentStopKind: "decision",
            nextWakeSource: null,
            mergeReady: true,
            data: { humanDecision: "approved" },
          })
          yield* markRouteComplete(database, recentRoute.id, 3_500)

          const oldRoute = yield* admitRoute(lightbulb, accountID, "heyimcarlos/lightbulb-old", 66, "old-status", 500)
          yield* lightbulb.recordPRReviewRouteWake({
            routeID: oldRoute.id,
            source: "human_steering",
            summary: "Old route completed outside the retention window.",
            now: 1_000,
            currentStopKind: "decision",
            nextWakeSource: null,
            mergeReady: true,
          })
          yield* markRouteComplete(database, oldRoute.id, 1_000)

          const digest = yield* lightbulb.readPRReviewRouteDigest({
            accountID,
            now: 8_000,
            recentRetentionMs: 5_000,
            maxAttempts: 2,
          })
          const dashboard = yield* lightbulb.readDashboard(accountID)

          expect(digest.watched.map((item) => [item.repository, item.pullNumber, item.status, item.attemptCount])).toEqual([
            ["heyimcarlos/lightbulb", 109, "ci_red", 1],
            ["heyimcarlos/lightbulb-app", 68, "ready", 1],
          ])
          expect(digest.watched[0]?.latestEvidence?.data).toEqual({ failedChecks: 1 })
          expect(digest.watched[1]?.humanDecision).toBe("merge_ready")
          expect(digest.escalated.map((item) => [item.repository, item.status, item.escalationReasons])).toEqual([
            ["heyimcarlos/lightbulb-tools", "blocked", ["changes_requested", "attempt_budget_exhausted"]],
          ])
          expect(digest.escalated[0]?.activeWorker).toBeNull()
          expect(digest.escalated[0]?.humanDecision).toBe("needs_rework")
          expect(digest.recent.map((item) => [item.repository, item.pullNumber, item.humanDecision])).toEqual([
            ["heyimcarlos/lightbulb-recent", 67, "approved"],
          ])
          expect(JSON.stringify(digest)).not.toContain("rawTranscript")
          expect(dashboard?.inbox.prReviewRouteDigest.watched).toEqual(digest.watched)
          expect(dashboard?.inbox.prReviewRouteDigest.escalated).toEqual(digest.escalated)
        }).pipe(Effect.provide(layer(tmp.path))),
      ),
    ),
  )
})

function admitRoute(
  lightbulb: Lightbulb.Interface,
  accountID: Lightbulb.AccountID,
  repository: string,
  pullNumber: number,
  headRef: string,
  now: number,
) {
  return Effect.gen(function* () {
    const candidates = yield* lightbulb.discoverPRReviewCandidates({
      accountID,
      repository,
      scannedAt: now,
      pulls: [scanPull(repository, pullNumber, headRef)],
    })
    const admission = yield* lightbulb.admitPRReviewRoute({
      accountID,
      candidateID: candidates.candidates[0]!.id,
      now: now + 100,
    })
    return admission.route!
  })
}

function markRouteComplete(database: Database.Interface, routeID: Lightbulb.RouteID, now: number) {
  return database.db
    .update(LightbulbPRReviewRouteTable)
    .set({
      status: "complete",
      active_repository_key: null,
      time_updated: now,
    })
    .where(eq(LightbulbPRReviewRouteTable.id, routeID))
    .run()
    .pipe(Effect.orDie)
}

function scanPull(repository: string, number: number, headRef: string): Lightbulb.PRReviewCandidateScanPull {
  return {
    number,
    title: `Review ${repository}#${number}`,
    url: `https://github.com/${repository}/pull/${number}`,
    state: "open",
    baseRef: "lightbulb",
    headRef,
    headSha: `${number}`.repeat(40).slice(0, 40),
  }
}

function seedAccount(database: Database.Interface, accountID: Lightbulb.AccountID) {
  return database.db
    .insert(LightbulbAccountTable)
    .values({
      id: accountID,
      name: "PR Review Digest",
      status: "active",
      time_created: 1,
      time_updated: 1,
    })
    .run()
    .pipe(Effect.orDie)
}
