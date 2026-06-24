import { and, asc, eq } from "drizzle-orm"
import { Effect } from "effect"
import type { Database } from "../database/database"
import type { Lightbulb } from "../lightbulb"
import { ingestIssueQueueSnapshots, type IssueQueueClassification, type IssueQueueSnapshot } from "./issue-intake"
import { LightbulbDiscoveryCandidateTable, LightbulbEventTable } from "./sql"

export type DiscoveryInboxProjectionInput = {
  readonly accountID: Lightbulb.AccountID
  readonly issues: readonly IssueQueueSnapshot[]
  readonly projectedAt?: number
  readonly source?: Record<string, unknown>
}

export type DiscoveryInboxProjectionResult = {
  readonly accountID: Lightbulb.AccountID
  readonly projectedAt: number
  readonly eventID: Lightbulb.EventID
  readonly candidates: readonly Lightbulb.DiscoveryCandidateSummary[]
  readonly staleCandidates: readonly Lightbulb.DiscoveryCandidateSummary[]
  readonly inbox: Lightbulb.DiscoveryCandidateInbox
}

export function projectDiscoveryInboxInDb(
  db: Database.Interface["db"],
  input: DiscoveryInboxProjectionInput,
  ids: {
    readonly candidate: () => Lightbulb.DiscoveryCandidateID
    readonly event: () => Lightbulb.EventID
  },
) {
  return db
    .transaction((tx) =>
      Effect.gen(function* () {
        const projectedAt = input.projectedAt ?? Date.now()
        const intake = ingestIssueQueueSnapshots({ snapshots: input.issues })
        const existing = yield* tx
          .select()
          .from(LightbulbDiscoveryCandidateTable)
          .where(
            and(
              eq(LightbulbDiscoveryCandidateTable.account_id, input.accountID),
              eq(LightbulbDiscoveryCandidateTable.source_kind, "issue"),
            ),
          )
          .orderBy(asc(LightbulbDiscoveryCandidateTable.source_id))
          .all()
        const seen = new Set(intake.classifications.map((classification) => classification.issueHandle))
        const candidates = yield* Effect.all(
          intake.classifications.map((classification) =>
            tx
              .insert(LightbulbDiscoveryCandidateTable)
              .values(candidateRow(classification, input, projectedAt, existing, ids.candidate))
              .onConflictDoUpdate({
                target: [
                  LightbulbDiscoveryCandidateTable.account_id,
                  LightbulbDiscoveryCandidateTable.source_kind,
                  LightbulbDiscoveryCandidateTable.source_id,
                ],
                set: candidateUpdate(classification, input, projectedAt),
              })
              .returning()
              .get(),
          ),
        )
        const staleCandidates = yield* Effect.all(
          existing
            .filter((candidate) => !seen.has(candidate.source_id) && candidate.status !== "resolved")
            .map((candidate) =>
              tx
                .update(LightbulbDiscoveryCandidateTable)
                .set({
                  status: "ignored",
                  section: "noise",
                  score: 0,
                  reason: "Candidate was not returned by the latest discovery projection.",
                  suggested_action: "none",
                  last_projected_at: projectedAt,
                  metadata: { source: input.source ?? {}, stale: true },
                  time_updated: projectedAt,
                })
                .where(eq(LightbulbDiscoveryCandidateTable.id, candidate.id))
                .returning()
                .get(),
            ),
        )
        const allCandidates = yield* tx
          .select()
          .from(LightbulbDiscoveryCandidateTable)
          .where(eq(LightbulbDiscoveryCandidateTable.account_id, input.accountID))
          .orderBy(
            asc(LightbulbDiscoveryCandidateTable.section),
            asc(LightbulbDiscoveryCandidateTable.score),
            asc(LightbulbDiscoveryCandidateTable.source_id),
          )
          .all()
        const eventID = ids.event()
        const inbox = groupDiscoveryCandidates(allCandidates.map(toDiscoveryCandidateSummary))
        yield* tx
          .insert(LightbulbEventTable)
          .values({
            id: eventID,
            account_id: input.accountID,
            aggregate_type: "discovery_candidate_projection",
            aggregate_id: input.accountID,
            type: "lightbulb.discovery_inbox.projected",
            summary: projectionSummary(candidates.length, staleCandidates.length),
            data: {
              candidate_count: candidates.length,
              stale_count: staleCandidates.length,
              top_actionable_count: inbox.topActionable.length,
              needs_human_count: inbox.needsHuman.length,
              possible_duplicate_count: inbox.possibleDuplicates.length,
              proposed_action_count: inbox.proposedActions.length,
              watch_count: inbox.watch.length,
              noise_count: inbox.noise.length,
              recent_resolved_count: inbox.recentResolved.length,
              source: input.source ?? {},
            },
            time_created: projectedAt,
          })
          .run()
        return {
          accountID: input.accountID,
          projectedAt,
          eventID,
          candidates: candidates.map(toDiscoveryCandidateSummary),
          staleCandidates: staleCandidates.map(toDiscoveryCandidateSummary),
          inbox,
        }
      }),
    )
    .pipe(Effect.orDie)
}

export function toDiscoveryCandidateSummary(
  row: typeof LightbulbDiscoveryCandidateTable.$inferSelect,
): Lightbulb.DiscoveryCandidateSummary {
  return {
    id: row.id,
    sourceKind: row.source_kind,
    sourceID: row.source_id,
    title: row.title,
    url: row.url,
    status: row.status,
    section: row.section,
    score: row.score,
    reason: row.reason,
    suggestedAction: row.suggested_action,
    sourceHandles: row.source_handles,
    duplicateRefs: row.duplicate_refs,
    labels: row.labels,
    lastSeenAt: row.last_seen_at,
    lastProjectedAt: row.last_projected_at,
  }
}

export function groupDiscoveryCandidates(
  candidates: readonly Lightbulb.DiscoveryCandidateSummary[],
): Lightbulb.DiscoveryCandidateInbox {
  const sorted = [...candidates].sort((left, right) => right.score - left.score || left.sourceID.localeCompare(right.sourceID))
  return {
    topActionable: sorted.filter((candidate) => candidate.section === "top_actionable"),
    needsHuman: sorted.filter((candidate) => candidate.section === "needs_human"),
    possibleDuplicates: sorted.filter((candidate) => candidate.section === "possible_duplicates"),
    proposedActions: sorted
      .filter((candidate) => candidate.suggestedAction !== "none" && candidate.status !== "resolved" && candidate.status !== "ignored")
      .map((candidate) => ({
        candidateID: candidate.id,
        sourceID: candidate.sourceID,
        title: candidate.title,
        action: candidate.suggestedAction,
        reason: candidate.reason,
      })),
    watch: sorted.filter((candidate) => candidate.section === "watch"),
    noise: sorted.filter((candidate) => candidate.section === "noise"),
    recentResolved: sorted.filter((candidate) => candidate.section === "recent_resolved"),
  }
}

function candidateRow(
  classification: IssueQueueClassification,
  input: DiscoveryInboxProjectionInput,
  projectedAt: number,
  existing: readonly (typeof LightbulbDiscoveryCandidateTable.$inferSelect)[],
  candidateID: () => Lightbulb.DiscoveryCandidateID,
): typeof LightbulbDiscoveryCandidateTable.$inferInsert {
  return {
    id: existing.find((candidate) => candidate.source_id === classification.issueHandle)?.id ?? candidateID(),
    account_id: input.accountID,
    source_kind: "issue",
    source_id: classification.issueHandle,
    title: classification.title,
    url: classification.url,
    status: statusFor(classification),
    section: sectionFor(classification),
    score: scoreFor(classification),
    reason: classification.summary,
    suggested_action: suggestedActionFor(classification),
    source_handles: sourceHandlesFor(classification),
    duplicate_refs: duplicateRefsFor(classification),
    labels: classification.labels,
    last_seen_at: classification.updatedAt,
    last_projected_at: projectedAt,
    metadata: { source: input.source ?? {}, bodySummaryPresent: classification.bodySummary !== null },
    time_created: projectedAt,
    time_updated: projectedAt,
  }
}

function candidateUpdate(
  classification: IssueQueueClassification,
  input: DiscoveryInboxProjectionInput,
  projectedAt: number,
) {
  return {
    title: classification.title,
    url: classification.url,
    status: statusFor(classification),
    section: sectionFor(classification),
    score: scoreFor(classification),
    reason: classification.summary,
    suggested_action: suggestedActionFor(classification),
    source_handles: sourceHandlesFor(classification),
    duplicate_refs: duplicateRefsFor(classification),
    labels: classification.labels,
    last_seen_at: classification.updatedAt,
    last_projected_at: projectedAt,
    metadata: { source: input.source ?? {}, bodySummaryPresent: classification.bodySummary !== null },
    time_updated: projectedAt,
  }
}

function statusFor(classification: IssueQueueClassification): Lightbulb.DiscoveryCandidateStatus {
  if (classification.status === "ready") return "open"
  if (classification.status === "dependency_blocked") return "blocked"
  if (classification.status === "human_held") return "held"
  if (classification.status === "integrated_done") return "resolved"
  if (classification.status === "active_worker_owned") return "open"
  return "ignored"
}

function sectionFor(classification: IssueQueueClassification): Lightbulb.DiscoveryCandidateSection {
  if (duplicateRefsFor(classification).length > 0) return "possible_duplicates"
  if (classification.status === "ready") return "top_actionable"
  if (classification.status === "human_held") return "needs_human"
  if (classification.status === "dependency_blocked" || classification.status === "active_worker_owned") return "watch"
  if (classification.status === "integrated_done") return "recent_resolved"
  return "noise"
}

function scoreFor(classification: IssueQueueClassification) {
  if (classification.status === "ready") return 90
  if (classification.status === "human_held") return 70
  if (classification.status === "dependency_blocked") return 45
  if (classification.status === "active_worker_owned") return 35
  if (classification.status === "integrated_done") return 5
  return 0
}

function suggestedActionFor(classification: IssueQueueClassification) {
  if (classification.status === "ready") return "create_pickup_packet"
  if (classification.status === "human_held") return "request_human_input"
  if (classification.status === "dependency_blocked") return "wait_for_dependency"
  if (classification.status === "active_worker_owned") return "observe_existing_worker"
  return "none"
}

function sourceHandlesFor(classification: IssueQueueClassification): Lightbulb.DiscoveryCandidateSourceHandles {
  return {
    sourceRef: classification.issueHandle,
    issueRef: classification.issueRef,
    issueHandle: classification.issueHandle,
    promptHandle: classification.promptHandle,
    instructionHandle: classification.instructionHandle,
    url: classification.url,
  }
}

function duplicateRefsFor(classification: IssueQueueClassification) {
  return classification.possibleDuplicateRefs
}

function projectionSummary(candidateCount: number, staleCount: number) {
  if (staleCount === 0) return `Projected ${candidateCount} discovery candidates.`
  return `Projected ${candidateCount} discovery candidates; marked ${staleCount} stale.`
}
