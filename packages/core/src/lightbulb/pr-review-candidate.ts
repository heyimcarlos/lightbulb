import { and, asc, eq } from "drizzle-orm"
import { Effect } from "effect"
import type { Database } from "../database/database"
import type { Lightbulb } from "../lightbulb"
import { LightbulbEventTable, LightbulbPRReviewCandidateTable } from "./sql"

export type PRReviewCandidateDiscoveryInput = {
  readonly accountID: Lightbulb.AccountID
  readonly repository: string
  readonly pulls: readonly Lightbulb.PRReviewCandidateScanPull[]
  readonly scannedAt?: number
  readonly source?: Record<string, unknown>
}

export type PRReviewCandidateDiscoveryResult = {
  readonly accountID: Lightbulb.AccountID
  readonly repository: string
  readonly scannedAt: number
  readonly eventID: Lightbulb.EventID
  readonly candidates: readonly Lightbulb.PRReviewCandidateSummary[]
  readonly staleCandidates: readonly Lightbulb.PRReviewCandidateSummary[]
}

export function discoverPRReviewCandidatesInDb(
  db: Database.Interface["db"],
  input: PRReviewCandidateDiscoveryInput,
  ids: {
    readonly candidate: () => Lightbulb.PRReviewCandidateID
    readonly event: () => Lightbulb.EventID
  },
) {
  return db
    .transaction((tx) =>
      Effect.gen(function* () {
        const scannedAt = input.scannedAt ?? Date.now()
        const repository = normalizeRepository(input.repository)
        const existing = yield* tx
          .select()
          .from(LightbulbPRReviewCandidateTable)
          .where(
            and(
              eq(LightbulbPRReviewCandidateTable.account_id, input.accountID),
              eq(LightbulbPRReviewCandidateTable.repository, repository),
            ),
          )
          .orderBy(asc(LightbulbPRReviewCandidateTable.pr_number))
          .all()
        const seen = new Set(input.pulls.map((pull) => pull.number))
        const candidates = yield* Effect.all(
          input.pulls.map((pull) =>
            tx
              .insert(LightbulbPRReviewCandidateTable)
              .values(candidateRow(input, repository, pull, scannedAt, existing, ids.candidate))
              .onConflictDoUpdate({
                target: [
                  LightbulbPRReviewCandidateTable.account_id,
                  LightbulbPRReviewCandidateTable.repository,
                  LightbulbPRReviewCandidateTable.pr_number,
                ],
                set: candidateUpdate(repository, pull, scannedAt, input.source),
              })
              .returning()
              .get(),
          ),
        )
        const staleCandidates = yield* Effect.all(
          existing
            .filter((candidate) => !seen.has(candidate.pr_number) && candidate.status !== "closed")
            .map((candidate) =>
              tx
                .update(LightbulbPRReviewCandidateTable)
                .set({
                  state: "unknown",
                  status: "stale",
                  last_checked_at: scannedAt,
                  evidence: {
                    observedAt: scannedAt,
                    source: input.source ?? {},
                    reason: "not_returned_by_scan" as const,
                  },
                  time_updated: scannedAt,
                })
                .where(eq(LightbulbPRReviewCandidateTable.id, candidate.id))
                .returning()
                .get(),
            ),
        )
        const eventID = ids.event()
        yield* tx
          .insert(LightbulbEventTable)
          .values({
            id: eventID,
            account_id: input.accountID,
            aggregate_type: "pr_review_candidate_scan",
            aggregate_id: repository,
            type: "lightbulb.pr_review_candidates.scanned",
            summary: scanSummary(repository, candidates.length, staleCandidates.length),
            data: {
              repository,
              candidate_count: candidates.length,
              stale_count: staleCandidates.length,
              pull_numbers: candidates.map((candidate) => candidate.pr_number),
              stale_pull_numbers: staleCandidates.map((candidate) => candidate.pr_number),
              source: input.source ?? {},
            },
            time_created: scannedAt,
          })
          .run()
        return {
          accountID: input.accountID,
          repository,
          scannedAt,
          eventID,
          candidates: candidates.map(toPRReviewCandidateSummary),
          staleCandidates: staleCandidates.map(toPRReviewCandidateSummary),
        }
      }),
    )
    .pipe(Effect.orDie)
}

export function toPRReviewCandidateSummary(
  row: typeof LightbulbPRReviewCandidateTable.$inferSelect,
): Lightbulb.PRReviewCandidateSummary {
  return {
    id: row.id,
    repository: row.repository,
    pullNumber: row.pr_number,
    title: row.title,
    url: row.url,
    state: row.state,
    status: row.status,
    baseRef: row.base_ref,
    headRef: row.head_ref,
    headSha: row.head_sha,
    lastSeenAt: row.last_seen_at,
    lastCheckedAt: row.last_checked_at,
    routeSeed: row.route_seed,
    evidence: row.evidence,
  }
}

function candidateRow(
  input: PRReviewCandidateDiscoveryInput,
  repository: string,
  pull: Lightbulb.PRReviewCandidateScanPull,
  scannedAt: number,
  existing: readonly (typeof LightbulbPRReviewCandidateTable.$inferSelect)[],
  candidateID: () => Lightbulb.PRReviewCandidateID,
): typeof LightbulbPRReviewCandidateTable.$inferInsert {
  return {
    id: existing.find((candidate) => candidate.pr_number === pull.number)?.id ?? candidateID(),
    account_id: input.accountID,
    repository,
    pr_number: pull.number,
    title: pull.title,
    url: pull.url,
    state: pull.state,
    status: candidateStatus(pull.state),
    base_ref: pull.baseRef,
    head_ref: pull.headRef,
    head_sha: pull.headSha ?? null,
    last_seen_at: scannedAt,
    last_checked_at: scannedAt,
    route_seed: routeSeed(repository, pull),
    evidence: {
      observedAt: scannedAt,
      source: input.source ?? {},
      reason: "returned_by_scan",
    },
    metadata: pull.metadata,
    time_created: scannedAt,
    time_updated: scannedAt,
  }
}

function candidateUpdate(
  repository: string,
  pull: Lightbulb.PRReviewCandidateScanPull,
  scannedAt: number,
  source: Record<string, unknown> | undefined,
) {
  return {
    title: pull.title,
    url: pull.url,
    state: pull.state,
    status: candidateStatus(pull.state),
    base_ref: pull.baseRef,
    head_ref: pull.headRef,
    head_sha: pull.headSha ?? null,
    last_seen_at: scannedAt,
    last_checked_at: scannedAt,
    route_seed: routeSeed(repository, pull),
    evidence: {
      observedAt: scannedAt,
      source: source ?? {},
      reason: "returned_by_scan" as const,
    },
    metadata: pull.metadata,
    time_updated: scannedAt,
  }
}

function candidateStatus(state: Lightbulb.PRReviewCandidateState): Lightbulb.PRReviewCandidateStatus {
  if (state === "open") return "ready"
  return "closed"
}

function routeSeed(
  repository: string,
  pull: Lightbulb.PRReviewCandidateScanPull,
): Lightbulb.PRReviewCandidateRouteSeed {
  return {
    sourceRef: `github:${repository}/pull/${pull.number}`,
    repository,
    pullNumber: pull.number,
    url: pull.url,
    baseRef: pull.baseRef,
    headRef: pull.headRef,
    headSha: pull.headSha ?? null,
  }
}

function normalizeRepository(repository: string) {
  return repository.trim()
}

function scanSummary(repository: string, candidateCount: number, staleCount: number) {
  if (staleCount === 0) return `Discovered ${candidateCount} PR review candidates for ${repository}.`
  return `Discovered ${candidateCount} PR review candidates for ${repository}; marked ${staleCount} stale.`
}
