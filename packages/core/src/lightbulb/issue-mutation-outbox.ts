import { and, asc, eq } from "drizzle-orm"
import { Effect } from "effect"
import type { Database } from "../database/database"
import type { Lightbulb } from "../lightbulb"
import { Hash } from "../util/hash"
import {
  evaluateIssueMutationSafeWritePolicy,
  safeWritePolicyEvaluationMetadata,
  type SafeWritePolicyEvaluation,
} from "./safe-write-policy"
import { LightbulbEventTable, LightbulbIssueMutationOutboxTable } from "./sql"

type IssueMutationRow = typeof LightbulbIssueMutationOutboxTable.$inferSelect

type IssueMutationDraft = {
  readonly accountID: Lightbulb.AccountID
  readonly repository: string
  readonly action: Lightbulb.IssueMutationAction
  readonly status: Lightbulb.IssueMutationStatus
  readonly targetIssue: Lightbulb.IssueMutationRenderedTarget | null
  readonly desiredLabels: readonly string[]
  readonly desiredState: Lightbulb.IssueMutationIssueState | null
  readonly idempotencyKey: string
  readonly source: Lightbulb.IssueMutationSource
  readonly renderedMutation: Lightbulb.IssueMutationRenderedMutation
  readonly holdReasons: readonly Lightbulb.IssueMutationHoldReason[]
  readonly applySummary: string
  readonly metadata: Record<string, unknown> | null
  readonly now: number
}

export function proposeIssueMutationInDb(
  db: Database.Interface["db"],
  input: Lightbulb.IssueMutationProposalInput,
  ids: {
    readonly mutation: () => Lightbulb.IssueMutationID
    readonly event: () => Lightbulb.EventID
  },
) {
  return db
    .transaction((tx) =>
      Effect.gen(function* () {
        const draft = buildIssueMutationDraft(input)
        const existing = yield* tx
          .select()
          .from(LightbulbIssueMutationOutboxTable)
          .where(
            and(
              eq(LightbulbIssueMutationOutboxTable.account_id, draft.accountID),
              eq(LightbulbIssueMutationOutboxTable.idempotency_key, draft.idempotencyKey),
            ),
          )
          .get()

        if (existing) {
          return {
            item: toIssueMutationOutboxItem(existing),
            created: false,
            eventID: null,
          } satisfies Lightbulb.IssueMutationProposalResult
        }

        const row = yield* tx
          .insert(LightbulbIssueMutationOutboxTable)
          .values({
            id: ids.mutation(),
            account_id: draft.accountID,
            source_goal_id: draft.source.goalID,
            source_loop_id: draft.source.loopID,
            source_run_id: draft.source.runID,
            repository: draft.repository,
            action: draft.action,
            status: draft.status,
            target_issue_number: draft.targetIssue?.issueNumber,
            target_issue_ref: draft.targetIssue?.issueRef,
            target_issue_url: draft.targetIssue?.issueURL,
            desired_labels: draft.desiredLabels,
            desired_state: draft.desiredState,
            idempotency_key: draft.idempotencyKey,
            source_handles: draft.source,
            rendered_mutation: draft.renderedMutation,
            hold_reasons: draft.holdReasons,
            apply_summary: draft.applySummary,
            apply_result: null,
            metadata: draft.metadata,
            time_created: draft.now,
            time_updated: draft.now,
          })
          .returning()
          .get()
        const eventID = ids.event()
        yield* tx
          .insert(LightbulbEventTable)
          .values({
            id: eventID,
            account_id: draft.accountID,
            aggregate_type: "issue_mutation_outbox",
            aggregate_id: row.id,
            type: "lightbulb.issue_mutation.proposed",
            summary: draft.applySummary,
            data: {
              repository: draft.repository,
              action: draft.action,
              status: draft.status,
              target_issue_ref: draft.targetIssue?.issueRef ?? null,
              desired_labels: draft.desiredLabels,
              desired_state: draft.desiredState,
              idempotency_key: draft.idempotencyKey,
              hold_reasons: draft.holdReasons,
              safe_write_policy: draft.metadata?.safe_write_policy ?? null,
              source: draft.source,
            },
            time_created: draft.now,
          })
          .run()

        return {
          item: toIssueMutationOutboxItem(row),
          created: true,
          eventID,
        } satisfies Lightbulb.IssueMutationProposalResult
      }),
    )
    .pipe(Effect.orDie)
}

export function readIssueMutationOutboxInDb(
  db: Database.Interface["db"],
  input: Lightbulb.IssueMutationOutboxReadInput,
) {
  return (
    input.status
      ? db
          .select()
          .from(LightbulbIssueMutationOutboxTable)
          .where(
            and(
              eq(LightbulbIssueMutationOutboxTable.account_id, input.accountID),
              eq(LightbulbIssueMutationOutboxTable.status, input.status),
            ),
          )
          .orderBy(asc(LightbulbIssueMutationOutboxTable.time_created))
          .all()
      : db
          .select()
          .from(LightbulbIssueMutationOutboxTable)
          .where(eq(LightbulbIssueMutationOutboxTable.account_id, input.accountID))
          .orderBy(asc(LightbulbIssueMutationOutboxTable.time_created))
          .all()
  ).pipe(Effect.orDie, Effect.map((rows) => rows.map(toIssueMutationOutboxItem)))
}

export function recordIssueMutationApplyResultInDb(
  db: Database.Interface["db"],
  input: Lightbulb.IssueMutationApplyResultInput,
  ids: {
    readonly event: () => Lightbulb.EventID
  },
) {
  return db
    .transaction((tx) =>
      Effect.gen(function* () {
        const existing = yield* tx
          .select()
          .from(LightbulbIssueMutationOutboxTable)
          .where(eq(LightbulbIssueMutationOutboxTable.id, input.mutationID))
          .get()
        if (!existing) return yield* Effect.die(new Error("Lightbulb issue mutation not found: " + input.mutationID))

        const applyResult = normalizeApplyResult(input)
        const holdReasons = input.holdReasons ?? existing.hold_reasons
        if (
          existing.status === input.status &&
          sameApplyResult(existing.apply_result ?? null, applyResult) &&
          stringListMatches(existing.hold_reasons, holdReasons)
        ) {
          return {
            item: toIssueMutationOutboxItem(existing),
            changed: false,
            eventID: null,
          } satisfies Lightbulb.IssueMutationApplyRecordResult
        }

        const row = yield* tx
          .update(LightbulbIssueMutationOutboxTable)
          .set({
            status: input.status,
            apply_result: applyResult,
            hold_reasons: holdReasons,
            time_updated: applyResult.appliedAt,
          })
          .where(eq(LightbulbIssueMutationOutboxTable.id, input.mutationID))
          .returning()
          .get()
        const eventID = ids.event()
        yield* tx
          .insert(LightbulbEventTable)
          .values({
            id: eventID,
            account_id: row.account_id,
            aggregate_type: "issue_mutation_outbox",
            aggregate_id: row.id,
            type: "lightbulb.issue_mutation.apply_recorded",
            summary: applyResult.summary,
            data: {
              repository: row.repository,
              action: row.action,
              status: input.status,
              target_issue_ref: row.target_issue_ref,
              idempotency_key: row.idempotency_key,
              issue_url: applyResult.issueURL,
              result_handle: applyResult.resultHandle,
              error_handle: applyResult.errorHandle,
              hold_reasons: holdReasons,
              source: row.source_handles,
            },
            time_created: applyResult.appliedAt,
          })
          .run()

        return {
          item: toIssueMutationOutboxItem(row),
          changed: true,
          eventID,
        } satisfies Lightbulb.IssueMutationApplyRecordResult
      }),
    )
    .pipe(Effect.orDie)
}

export function buildIssueMutationDraft(input: Lightbulb.IssueMutationProposalInput): IssueMutationDraft {
  const now = input.now ?? Date.now()
  const repository = input.repository.trim()
  const source = normalizeSource(input.source)
  const targetIssue = normalizeTargetIssue(repository, input.targetIssue)
  const labels = normalizeLabels(input.labels ?? [])
  const addLabels = normalizeLabels(input.addLabels ?? [])
  const removeLabels = normalizeLabels(input.removeLabels ?? [])
  const desiredLabels = desiredLabelsForAction(input.action, labels, addLabels, removeLabels)
  const desiredState = input.state ?? null
  const idempotencyKey = input.idempotencyKey?.trim() || deterministicIdempotencyKey({
    repository,
    action: input.action,
    targetIssue: targetIssueIdentity(targetIssue),
    title: cleanOptionalText(input.title),
    body: cleanOptionalText(input.body),
    labels,
    addLabels,
    removeLabels,
    state: desiredState,
    comment: normalizeComment(input.comment),
  })
  const applySummary = input.applySummary?.trim() || summaryForMutation(input.action, targetIssue, {
    title: cleanOptionalText(input.title),
    labels,
    addLabels,
    removeLabels,
    state: desiredState,
    comment: normalizeComment(input.comment),
  })
  const renderedMutation = {
    action: input.action,
    repository,
    idempotencyKey,
    targetIssue,
    title: cleanOptionalText(input.title),
    body: cleanOptionalText(input.body),
    labels,
    addLabels,
    removeLabels,
    state: desiredState,
    comment: normalizeComment(input.comment),
    summary: applySummary,
    source,
    precondition: input.precondition ?? null,
  } satisfies Lightbulb.IssueMutationRenderedMutation
  const safeWriteEvaluation = evaluateIssueMutationSafeWritePolicy({
    mutation: renderedMutation,
    policy: input.safeWritePolicy,
  })
  const holdReasons = holdReasonsForProposal(input, renderedMutation, safeWriteEvaluation)

  return {
    accountID: input.accountID,
    repository,
    action: input.action,
    status: holdReasons.length ? "held" : "ready",
    targetIssue,
    desiredLabels,
    desiredState,
    idempotencyKey,
    source,
    renderedMutation,
    holdReasons,
    applySummary,
    metadata: metadataWithSafeWritePolicy(input.metadata, safeWriteEvaluation),
    now,
  }
}

export function toIssueMutationOutboxItem(row: IssueMutationRow): Lightbulb.IssueMutationOutboxItem {
  return {
    id: row.id,
    accountID: row.account_id,
    repository: row.repository,
    action: row.action,
    status: row.status,
    targetIssue: row.rendered_mutation.targetIssue,
    desiredLabels: row.desired_labels,
    desiredState: row.desired_state ?? null,
    idempotencyKey: row.idempotency_key,
    source: row.source_handles,
    renderedMutation: row.status === "ready" ? row.rendered_mutation : null,
    holdReasons: row.hold_reasons,
    applySummary: row.apply_summary,
    applyResult: row.apply_result ?? null,
    metadata: row.metadata ?? null,
    timeCreated: row.time_created,
    timeUpdated: row.time_updated,
  }
}

function holdReasonsForProposal(
  input: Lightbulb.IssueMutationProposalInput,
  renderedMutation: Lightbulb.IssueMutationRenderedMutation,
  safeWriteEvaluation: SafeWritePolicyEvaluation | null,
) {
  return [
    ...missingCreateFieldReasons(renderedMutation),
    ...missingTargetReasons(renderedMutation),
    ...conflictingStateLabelReasons(renderedMutation),
    ...unsafeLabelRemovalReasons(renderedMutation),
    ...staleSnapshotReasons(input, renderedMutation),
    ...(safeWriteEvaluation?.holdReasons ?? []),
  ].filter(uniqueReason)
}

function missingCreateFieldReasons(renderedMutation: Lightbulb.IssueMutationRenderedMutation) {
  if (renderedMutation.action !== "create_issue") return []
  return [
    renderedMutation.title ? null : "missing_create_title",
    renderedMutation.body ? null : "missing_create_body",
  ].filter((reason): reason is Lightbulb.IssueMutationHoldReason => reason !== null)
}

function missingTargetReasons(renderedMutation: Lightbulb.IssueMutationRenderedMutation) {
  if (renderedMutation.action === "create_issue") return []
  return renderedMutation.targetIssue ? [] : ["missing_target_issue" as const]
}

function conflictingStateLabelReasons(renderedMutation: Lightbulb.IssueMutationRenderedMutation) {
  const labels = projectedLabelsForConflict(renderedMutation)
  if (renderedMutation.state === "closed" && labels.includes("ready-for-agent")) {
    return ["conflicting_state_label" as const]
  }
  if (labels.includes("ready-for-agent") && labels.some((label) => conflictingReadyLabelSet.has(label))) {
    return ["conflicting_state_label" as const]
  }
  return []
}

function projectedLabelsForConflict(renderedMutation: Lightbulb.IssueMutationRenderedMutation) {
  if (renderedMutation.action === "create_issue") {
    return renderedMutation.labels
  }
  const targetLabels = renderedMutation.targetIssue?.labels ?? []
  if (renderedMutation.action === "edit_issue") {
    return normalizeLabels([...targetLabels, ...renderedMutation.labels])
  }
  if (renderedMutation.action === "add_label") {
    return normalizeLabels([...targetLabels, ...renderedMutation.addLabels])
  }
  if (renderedMutation.action === "remove_label") {
    return targetLabels.filter((label) => !renderedMutation.removeLabels.includes(label))
  }
  return targetLabels
}

function unsafeLabelRemovalReasons(renderedMutation: Lightbulb.IssueMutationRenderedMutation) {
  return renderedMutation.removeLabels.some((label) => unsafeRemovalLabelSet.has(label))
    ? ["unsafe_label_removal" as const]
    : []
}

function staleSnapshotReasons(
  input: Lightbulb.IssueMutationProposalInput,
  renderedMutation: Lightbulb.IssueMutationRenderedMutation,
) {
  const expected = input.precondition?.expectedSnapshotUpdatedAt
  const actual = renderedMutation.targetIssue?.snapshotUpdatedAt
  if (expected === undefined || actual === undefined || actual === null || expected === actual) return []
  return ["stale_snapshot_precondition" as const]
}

function normalizeTargetIssue(
  repository: string,
  targetIssue: Lightbulb.IssueMutationTargetIssue | undefined,
): Lightbulb.IssueMutationRenderedTarget | null {
  if (!targetIssue) return null
  const issueRef = targetIssue.ref?.trim() || "#" + targetIssue.number
  return {
    issueNumber: targetIssue.number,
    issueRef,
    issueHandle: targetIssue.handle?.trim() || "github:issue:" + targetIssue.number,
    issueURL: targetIssue.url?.trim() || "https://github.com/" + repository + "/issues/" + targetIssue.number,
    snapshotUpdatedAt: targetIssue.snapshotUpdatedAt ?? null,
    labels: normalizeLabels(targetIssue.labels ?? []),
    state: targetIssue.state ?? null,
  }
}

function normalizeSource(source: Lightbulb.IssueMutationSource | undefined): Lightbulb.IssueMutationSource {
  return {
    ...(source?.goalID ? { goalID: source.goalID } : {}),
    ...(source?.loopID ? { loopID: source.loopID } : {}),
    ...(source?.runID ? { runID: source.runID } : {}),
    ...(source?.artifactIDs ? { artifactIDs: [...source.artifactIDs].sort() } : {}),
    ...(source?.artifactHandles ? { artifactHandles: [...source.artifactHandles].map((item) => item.trim()).filter(Boolean).sort() } : {}),
    ...(source?.plannerArtifactHandle ? { plannerArtifactHandle: source.plannerArtifactHandle.trim() } : {}),
  }
}

function normalizeComment(
  comment: Lightbulb.IssueMutationCommentProposal | undefined,
): Lightbulb.IssueMutationCommentProposal | null {
  if (!comment) return null
  return {
    body: comment.body.trim(),
    ...(comment.bodyHandle?.trim() ? { bodyHandle: comment.bodyHandle.trim() } : {}),
    ...(comment.marker?.trim() ? { marker: comment.marker.trim() } : {}),
    ...(comment.summary?.trim() ? { summary: comment.summary.trim() } : {}),
  }
}

function desiredLabelsForAction(
  action: Lightbulb.IssueMutationAction,
  labels: readonly string[],
  addLabels: readonly string[],
  removeLabels: readonly string[],
) {
  if (action === "create_issue" || action === "edit_issue") return labels
  if (action === "add_label") return addLabels
  if (action === "remove_label") return removeLabels
  return []
}

function deterministicIdempotencyKey(input: {
  readonly repository: string
  readonly action: Lightbulb.IssueMutationAction
  readonly targetIssue: IssueMutationTargetIdentity | null
  readonly title: string | null
  readonly body: string | null
  readonly labels: readonly string[]
  readonly addLabels: readonly string[]
  readonly removeLabels: readonly string[]
  readonly state: Lightbulb.IssueMutationIssueState | null
  readonly comment: Lightbulb.IssueMutationCommentProposal | null
}) {
  return "issue-mutation:" + Hash.fast(JSON.stringify(input))
}

type IssueMutationTargetIdentity = {
  readonly issueNumber: number
  readonly issueRef: string
  readonly issueHandle: string
  readonly issueURL: string
}

function targetIssueIdentity(targetIssue: Lightbulb.IssueMutationRenderedTarget | null): IssueMutationTargetIdentity | null {
  if (!targetIssue) return null
  return {
    issueNumber: targetIssue.issueNumber,
    issueRef: targetIssue.issueRef,
    issueHandle: targetIssue.issueHandle,
    issueURL: targetIssue.issueURL,
  }
}

function summaryForMutation(
  action: Lightbulb.IssueMutationAction,
  targetIssue: Lightbulb.IssueMutationRenderedTarget | null,
  payload: {
    readonly title: string | null
    readonly labels: readonly string[]
    readonly addLabels: readonly string[]
    readonly removeLabels: readonly string[]
    readonly state: Lightbulb.IssueMutationIssueState | null
    readonly comment: Lightbulb.IssueMutationCommentProposal | null
  },
) {
  const target = targetIssue?.issueRef ?? "new issue"
  if (action === "create_issue") return "Create " + target + ": " + (payload.title ?? "untitled issue") + "."
  if (action === "edit_issue") return "Edit " + target + " title/body/state."
  if (action === "add_label") return "Add labels to " + target + ": " + payload.addLabels.join(", ") + "."
  if (action === "remove_label") return "Remove labels from " + target + ": " + payload.removeLabels.join(", ") + "."
  return "Add comment to " + target + ": " + (payload.comment?.summary ?? "proposed comment") + "."
}

function normalizeApplyResult(input: Lightbulb.IssueMutationApplyResultInput): Lightbulb.IssueMutationApplyResult {
  return {
    status: input.status,
    summary: input.summary,
    issueURL: input.issueURL ?? null,
    resultHandle: input.resultHandle ?? null,
    errorHandle: input.errorHandle ?? null,
    appliedAt: input.appliedAt ?? Date.now(),
    metadata: input.metadata ?? null,
  }
}

function metadataWithSafeWritePolicy(
  metadata: Record<string, unknown> | undefined,
  evaluation: SafeWritePolicyEvaluation | null,
) {
  if (!evaluation) return metadata ?? null
  return {
    ...(metadata ?? {}),
    safe_write_policy: safeWritePolicyEvaluationMetadata(evaluation),
  }
}

function sameApplyResult(left: Lightbulb.IssueMutationApplyResult | null, right: Lightbulb.IssueMutationApplyResult) {
  return Boolean(left) && JSON.stringify(left) === JSON.stringify(right)
}

function stringListMatches(current: readonly string[], next: readonly string[]) {
  return current.length === next.length && current.every((value, index) => value === next[index])
}

function cleanOptionalText(value: string | null | undefined) {
  const cleaned = value?.trim()
  return cleaned ? cleaned : null
}

function normalizeLabels(labels: readonly string[]) {
  return [...new Set(labels.map((label) => label.trim().toLowerCase()).filter(Boolean))].sort()
}

function uniqueReason(reason: Lightbulb.IssueMutationHoldReason, index: number, reasons: readonly Lightbulb.IssueMutationHoldReason[]) {
  return reasons.indexOf(reason) === index
}

const conflictingReadyLabelSet = new Set([
  "blocked-by-dependency",
  "needs-info",
  "ready-for-human",
  "agent-running",
  "agent-done",
  "agent-integrated",
  "agent-reviewed",
  "budget-held",
  "context-policy-held",
  "adr-gate-held",
  "decision-held",
  "needs-adr",
])

const unsafeRemovalLabelSet = new Set([
  "needs-info",
  "ready-for-human",
  "budget-held",
  "context-policy-held",
  "context-held",
  "adr-gate-held",
  "decision-held",
  "needs-adr",
  "agent-running",
  "agent-done",
  "agent-integrated",
  "agent-reviewed",
])
