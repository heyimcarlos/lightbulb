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
  LightbulbPRReviewCandidateTable,
  LightbulbRunTable,
  LightbulbWorkerTable,
} from "@opencode-ai/core/lightbulb/sql"
import { tmpdir } from "./fixture/tmpdir"
import { it } from "./lib/effect"

function layer(directory: string) {
  const database = Database.layerFromPath(path.join(directory, "lightbulb.db")).pipe(Layer.fresh)
  return Layer.mergeAll(database, Lightbulb.layer.pipe(Layer.provide(database)))
}

describe("Lightbulb PR review candidate discovery", () => {
  it.live("discovers read-only PR review candidates and exposes bounded dashboard summaries", () =>
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

          const result = yield* lightbulb.discoverPRReviewCandidates({
            accountID,
            repository: "heyimcarlos/lightbulb",
            scannedAt: 1_000,
            source: { provider: "fixture", mode: "read-only" },
            pulls: [
              {
                number: 64,
                title: "Add recurring scheduler supervisor",
                url: "https://github.com/heyimcarlos/lightbulb/pull/64",
                state: "open",
                baseRef: "dev",
                headRef: "scheduler-supervisor",
                headSha: "4f9ecc4489d7381af72b7538d7f7990d9d3a9aad",
                metadata: { rawTranscript: "must not appear in dashboard" },
              },
            ],
          })
          const dashboard = yield* lightbulb.readDashboard(accountID)
          const events = yield* database.db
            .select()
            .from(LightbulbEventTable)
            .where(eq(LightbulbEventTable.type, "lightbulb.pr_review_candidates.scanned"))
            .all()
            .pipe(Effect.orDie)

          expect(result.candidates.map((candidate) => [candidate.repository, candidate.pullNumber, candidate.status])).toEqual([
            ["heyimcarlos/lightbulb", 64, "ready"],
          ])
          expect(result.staleCandidates).toEqual([])
          expect(dashboard?.inbox.prReviewCandidates).toEqual([
            {
              id: result.candidates[0]!.id,
              repository: "heyimcarlos/lightbulb",
              pullNumber: 64,
              title: "Add recurring scheduler supervisor",
              url: "https://github.com/heyimcarlos/lightbulb/pull/64",
              state: "open",
              status: "ready",
              baseRef: "dev",
              headRef: "scheduler-supervisor",
              headSha: "4f9ecc4489d7381af72b7538d7f7990d9d3a9aad",
              lastSeenAt: 1_000,
              lastCheckedAt: 1_000,
              routeSeed: {
                sourceRef: "github:heyimcarlos/lightbulb/pull/64",
                repository: "heyimcarlos/lightbulb",
                pullNumber: 64,
                url: "https://github.com/heyimcarlos/lightbulb/pull/64",
                baseRef: "dev",
                headRef: "scheduler-supervisor",
                headSha: "4f9ecc4489d7381af72b7538d7f7990d9d3a9aad",
              },
              evidence: {
                observedAt: 1_000,
                source: { provider: "fixture", mode: "read-only" },
                reason: "returned_by_scan",
              },
            },
          ])
          expect(JSON.stringify(dashboard)).not.toContain("rawTranscript")
          expect(events).toHaveLength(1)
          expect(events[0]?.data).toMatchObject({
            repository: "heyimcarlos/lightbulb",
            candidate_count: 1,
            stale_count: 0,
            pull_numbers: [64],
            source: { provider: "fixture", mode: "read-only" },
          })
          expect(yield* database.db.select().from(LightbulbGoalTable).all().pipe(Effect.orDie)).toEqual([])
          expect(yield* database.db.select().from(LightbulbRunTable).all().pipe(Effect.orDie)).toEqual([])
          expect(yield* database.db.select().from(LightbulbWorkerTable).all().pipe(Effect.orDie)).toEqual([])
        }).pipe(Effect.provide(layer(tmp.path))),
      ),
    ),
  )

  it.live("adopts existing candidates on repeated scans", () =>
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

          const first = yield* lightbulb.discoverPRReviewCandidates({
            accountID,
            repository: "heyimcarlos/lightbulb",
            scannedAt: 1_000,
            pulls: [scanPull(65, "Discover PR candidates", "pr-candidates")],
          })
          const second = yield* lightbulb.discoverPRReviewCandidates({
            accountID,
            repository: "heyimcarlos/lightbulb",
            scannedAt: 2_000,
            pulls: [scanPull(65, "Discover PR review goal candidates", "pr-candidates")],
          })
          const rows = yield* database.db
            .select()
            .from(LightbulbPRReviewCandidateTable)
            .where(eq(LightbulbPRReviewCandidateTable.account_id, accountID))
            .all()
            .pipe(Effect.orDie)
          const events = yield* database.db
            .select()
            .from(LightbulbEventTable)
            .where(eq(LightbulbEventTable.type, "lightbulb.pr_review_candidates.scanned"))
            .all()
            .pipe(Effect.orDie)

          expect(second.candidates[0]?.id).toBe(first.candidates[0]?.id)
          expect(rows.map((row) => [row.id, row.title, row.last_seen_at, row.time_created, row.time_updated])).toEqual([
            [first.candidates[0]!.id, "Discover PR review goal candidates", 2_000, 1_000, 2_000],
          ])
          expect(events).toHaveLength(2)
        }).pipe(Effect.provide(layer(tmp.path))),
      ),
    ),
  )

  it.live("marks missing candidates stale and explicit closed candidates closed", () =>
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

          const first = yield* lightbulb.discoverPRReviewCandidates({
            accountID,
            repository: "heyimcarlos/lightbulb",
            scannedAt: 1_000,
            pulls: [scanPull(66, "Route runner read model", "route-runner"), scanPull(67, "TUI PR review status", "tui-pr-status")],
          })
          const second = yield* lightbulb.discoverPRReviewCandidates({
            accountID,
            repository: "heyimcarlos/lightbulb",
            scannedAt: 2_000,
            pulls: [
              {
                ...scanPull(67, "TUI PR review status", "tui-pr-status"),
                state: "merged" as const,
              },
            ],
          })
          const rows = yield* database.db
            .select()
            .from(LightbulbPRReviewCandidateTable)
            .where(
              and(
                eq(LightbulbPRReviewCandidateTable.account_id, accountID),
                eq(LightbulbPRReviewCandidateTable.repository, "heyimcarlos/lightbulb"),
              ),
            )
            .all()
            .pipe(Effect.orDie)

          expect(second.staleCandidates.map((candidate) => [candidate.id, candidate.pullNumber, candidate.status])).toEqual([
            [first.candidates[0]!.id, 66, "stale"],
          ])
          expect(
            rows
              .sort((left, right) => left.pr_number - right.pr_number)
              .map((row) => [row.pr_number, row.state, row.status, row.last_seen_at, row.last_checked_at, row.evidence.reason]),
          ).toEqual([
            [66, "unknown", "stale", 1_000, 2_000, "not_returned_by_scan"],
            [67, "merged", "closed", 2_000, 2_000, "returned_by_scan"],
          ])
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
  }
}

function seedAccount(database: Database.Interface, accountID: Lightbulb.AccountID) {
  return database.db
    .insert(LightbulbAccountTable)
    .values({
      id: accountID,
      name: "PR Review Candidates",
      status: "active",
      time_created: 1,
      time_updated: 1,
    })
    .run()
    .pipe(Effect.orDie)
}
