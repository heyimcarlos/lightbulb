import { and, asc, eq, inArray } from "drizzle-orm"
import { Effect } from "effect"
import type { Database } from "../database/database"
import type { Lightbulb } from "../lightbulb"
import { recordIssueMutationApplyResultInDb } from "./issue-mutation-outbox"
import { LightbulbIssueMutationOutboxTable } from "./sql"

type IssueMutationRow = typeof LightbulbIssueMutationOutboxTable.$inferSelect

export type IssueMutationApplyPassMode = "dry_run" | "apply"

export type IssueMutationApplyApproval = {
  readonly approved: boolean
  readonly approvedBy?: string
  readonly approvalHandle?: string
  readonly reason?: string
}

export type IssueMutationCurrentIssueSnapshot = {
  readonly repository: string
  readonly issueNumber: number
  readonly snapshotUpdatedAt: number
  readonly labels: readonly string[]
  readonly state: Lightbulb.IssueMutationIssueState
}

export type IssueMutationDependencyHold = {
  readonly mutationID?: Lightbulb.IssueMutationID
  readonly idempotencyKey?: string
  readonly reason?: string
}

export type IssueMutationApplyAction = {
  readonly mutationID: Lightbulb.IssueMutationID
  readonly repository: string
  readonly action: Lightbulb.IssueMutationAction
  readonly idempotencyKey: string
  readonly targetIssue: Lightbulb.IssueMutationRenderedTarget | null
  readonly title: string | null
  readonly body: string | null
  readonly labels: readonly string[]
  readonly addLabels: readonly string[]
  readonly removeLabels: readonly string[]
  readonly state: Lightbulb.IssueMutationIssueState | null
  readonly comment: Lightbulb.IssueMutationCommentProposal | null
  readonly summary: string
  readonly source: Lightbulb.IssueMutationSource
  readonly precondition: Lightbulb.IssueMutationSnapshotPrecondition | null
}

export type IssueMutationApplyAdapterResult = {
  readonly status: Exclude<Lightbulb.IssueMutationApplyStatus, "held">
  readonly summary: string
  readonly issueURL?: string
  readonly resultHandle?: string
  readonly errorHandle?: string
  readonly metadata?: Record<string, unknown>
}

export type IssueMutationApplyAdapter = {
  readonly capabilities: readonly Lightbulb.IssueMutationAction[]
  readonly apply: (action: IssueMutationApplyAction) => Effect.Effect<IssueMutationApplyAdapterResult>
}

export type IssueMutationApplyPassInput = {
  readonly accountID: Lightbulb.AccountID
  readonly mode: IssueMutationApplyPassMode
  readonly approval?: IssueMutationApplyApproval
  readonly adapter: IssueMutationApplyAdapter
  readonly issueSnapshots?: readonly IssueMutationCurrentIssueSnapshot[]
  readonly dependencyHolds?: readonly IssueMutationDependencyHold[]
  readonly retryFailed?: boolean
  readonly now?: number
}

export type IssueMutationApplyPassOutcome = {
  readonly mutationID: Lightbulb.IssueMutationID
  readonly idempotencyKey: string
  readonly action: Lightbulb.IssueMutationAction
  readonly status: Lightbulb.IssueMutationApplyStatus | "dry_run"
  readonly summary: string
  readonly issueURL: string | null
  readonly resultHandle: string | null
  readonly errorHandle: string | null
  readonly holdReasons: readonly Lightbulb.IssueMutationHoldReason[]
  readonly eventID: Lightbulb.EventID | null
  readonly changed: boolean
}

export type IssueMutationApplyPassGroup = {
  readonly source: Lightbulb.IssueMutationSource
  readonly actions: readonly IssueMutationApplyAction[]
}

export type IssueMutationApplyPassResult = {
  readonly accountID: Lightbulb.AccountID
  readonly mode: IssueMutationApplyPassMode
  readonly appliedAt: number
  readonly approval: IssueMutationApplyApproval | null
  readonly counts: {
    readonly pending: number
    readonly dryRun: number
    readonly applied: number
    readonly skipped: number
    readonly held: number
    readonly failed: number
    readonly superseded: number
  }
  readonly groups: readonly IssueMutationApplyPassGroup[]
  readonly outcomes: readonly IssueMutationApplyPassOutcome[]
}

export function runIssueMutationApplyPassInDb(
  db: Database.Interface["db"],
  input: IssueMutationApplyPassInput,
  ids: {
    readonly event: () => Lightbulb.EventID
  },
) {
  return Effect.gen(function* () {
    const appliedAt = input.now ?? Date.now()
    const statuses = input.retryFailed ? retryableStatuses : readyStatuses
    const rows = yield* db
      .select()
      .from(LightbulbIssueMutationOutboxTable)
      .where(
        and(
          eq(LightbulbIssueMutationOutboxTable.account_id, input.accountID),
          inArray(LightbulbIssueMutationOutboxTable.status, statuses),
        ),
      )
      .orderBy(asc(LightbulbIssueMutationOutboxTable.time_created))
      .all()
      .pipe(Effect.orDie)
    const actions = rows.map(toApplyAction)

    if (input.mode === "dry_run") {
      return {
        accountID: input.accountID,
        mode: input.mode,
        appliedAt,
        approval: input.approval ?? null,
        counts: {
          pending: actions.length,
          dryRun: actions.length,
          applied: 0,
          skipped: 0,
          held: 0,
          failed: 0,
          superseded: 0,
        },
        groups: groupActions(actions),
        outcomes: actions.map((action) => dryRunOutcome(action)),
      } satisfies IssueMutationApplyPassResult
    }

    const outcomes = yield* Effect.forEach(rows, (row) =>
      Effect.gen(function* () {
        const action = toApplyAction(row)
        const holdReasons = passHoldReasons(row, action, input)
        if (holdReasons.length > 0) {
          const recorded = yield* recordIssueMutationApplyResultInDb(
            db,
            {
              mutationID: row.id,
              status: "held",
              summary: "Held issue mutation: " + holdReasons.join(", ") + ".",
              errorHandle: "lightbulb:issue-mutation:" + row.id + ":held",
              appliedAt,
              holdReasons,
              metadata: {
                approval_handle: input.approval?.approvalHandle ?? null,
              },
            },
            ids,
          )
          return recordedOutcome(action, recorded, holdReasons)
        }

        const applied = yield* input.adapter.apply(action)
        const recorded = yield* recordIssueMutationApplyResultInDb(
          db,
          {
            mutationID: row.id,
            status: applied.status,
            summary: applied.summary,
            issueURL: applied.issueURL,
            resultHandle: applied.resultHandle,
            errorHandle: applied.errorHandle,
            appliedAt,
            metadata: applied.metadata,
          },
          ids,
        )
        return recordedOutcome(action, recorded, [])
      }),
    )

    return {
      accountID: input.accountID,
      mode: input.mode,
      appliedAt,
      approval: input.approval ?? null,
      counts: countOutcomes(rows.length, 0, outcomes),
      groups: groupActions(actions),
      outcomes,
    } satisfies IssueMutationApplyPassResult
  })
}

function toApplyAction(row: IssueMutationRow): IssueMutationApplyAction {
  return {
    mutationID: row.id,
    repository: row.repository,
    action: row.rendered_mutation.action,
    idempotencyKey: row.idempotency_key,
    targetIssue: row.rendered_mutation.targetIssue,
    title: row.rendered_mutation.title,
    body: row.rendered_mutation.body,
    labels: row.rendered_mutation.labels,
    addLabels: row.rendered_mutation.addLabels,
    removeLabels: row.rendered_mutation.removeLabels,
    state: row.rendered_mutation.state,
    comment: row.rendered_mutation.comment,
    summary: row.rendered_mutation.summary,
    source: row.rendered_mutation.source,
    precondition: row.rendered_mutation.precondition,
  }
}

function dryRunOutcome(action: IssueMutationApplyAction): IssueMutationApplyPassOutcome {
  return {
    mutationID: action.mutationID,
    idempotencyKey: action.idempotencyKey,
    action: action.action,
    status: "dry_run",
    summary: action.summary,
    issueURL: action.targetIssue?.issueURL ?? null,
    resultHandle: "lightbulb:issue-mutation:" + action.mutationID + ":dry-run",
    errorHandle: null,
    holdReasons: [],
    eventID: null,
    changed: false,
  }
}

function recordedOutcome(
  action: IssueMutationApplyAction,
  recorded: Lightbulb.IssueMutationApplyRecordResult,
  holdReasons: readonly Lightbulb.IssueMutationHoldReason[],
): IssueMutationApplyPassOutcome {
  return {
    mutationID: action.mutationID,
    idempotencyKey: action.idempotencyKey,
    action: action.action,
    status: recorded.item.status as Lightbulb.IssueMutationApplyStatus,
    summary: recorded.item.applyResult?.summary ?? recorded.item.applySummary,
    issueURL: recorded.item.applyResult?.issueURL ?? null,
    resultHandle: recorded.item.applyResult?.resultHandle ?? null,
    errorHandle: recorded.item.applyResult?.errorHandle ?? null,
    holdReasons: recorded.item.holdReasons.length ? recorded.item.holdReasons : holdReasons,
    eventID: recorded.eventID,
    changed: recorded.changed,
  }
}

function passHoldReasons(
  row: IssueMutationRow,
  action: IssueMutationApplyAction,
  input: IssueMutationApplyPassInput,
): readonly Lightbulb.IssueMutationHoldReason[] {
  return [
    ...dependencyHoldReasons(row, input),
    ...(input.approval?.approved === true ? [] : ["missing_operator_approval" as const]),
    ...unsupportedCapabilityReasons(action, input),
    ...staleSnapshotReasons(action, input),
    ...unsafeStateLabelReasons(action, input),
  ].filter(uniqueReason)
}

function dependencyHoldReasons(row: IssueMutationRow, input: IssueMutationApplyPassInput) {
  return (input.dependencyHolds ?? []).some(
    (hold) => hold.mutationID === row.id || hold.idempotencyKey === row.idempotency_key,
  )
    ? ["dependency_held" as const]
    : []
}

function unsupportedCapabilityReasons(action: IssueMutationApplyAction, input: IssueMutationApplyPassInput) {
  return input.adapter.capabilities.includes(action.action) ? [] : ["unsupported_adapter_capability" as const]
}

function staleSnapshotReasons(action: IssueMutationApplyAction, input: IssueMutationApplyPassInput) {
  const expected = action.precondition?.expectedSnapshotUpdatedAt
  if (expected === undefined) return []
  const snapshot = currentSnapshot(action, input)
  if (!snapshot) return []
  return snapshot.snapshotUpdatedAt === expected ? [] : ["stale_snapshot_precondition" as const]
}

function unsafeStateLabelReasons(action: IssueMutationApplyAction, input: IssueMutationApplyPassInput) {
  const labels = projectedLabels(action, currentSnapshot(action, input))
  return [
    ...(action.removeLabels.some((label) => unsafeRemovalLabelSet.has(label)) ? ["unsafe_label_removal" as const] : []),
    ...(action.state === "closed" && labels.includes("ready-for-agent") ? ["conflicting_state_label" as const] : []),
    ...(labels.includes("ready-for-agent") && labels.some((label) => conflictingReadyLabelSet.has(label))
      ? ["conflicting_state_label" as const]
      : []),
  ]
}

function currentSnapshot(action: IssueMutationApplyAction, input: IssueMutationApplyPassInput) {
  return (input.issueSnapshots ?? []).find(
    (snapshot) =>
      snapshot.repository === action.repository && snapshot.issueNumber === action.targetIssue?.issueNumber,
  )
}

function projectedLabels(
  action: IssueMutationApplyAction,
  snapshot: IssueMutationCurrentIssueSnapshot | undefined,
) {
  const labels = normalizeLabels(snapshot?.labels ?? action.targetIssue?.labels ?? [])
  if (action.action === "create_issue" || action.action === "edit_issue") return normalizeLabels([...labels, ...action.labels])
  if (action.action === "add_label") return normalizeLabels([...labels, ...action.addLabels])
  if (action.action === "remove_label") return labels.filter((label) => !action.removeLabels.includes(label))
  return labels
}

function groupActions(actions: readonly IssueMutationApplyAction[]): readonly IssueMutationApplyPassGroup[] {
  return actions.reduce<IssueMutationApplyPassGroup[]>((groups, action) => {
    const index = groups.findIndex((group) => sourceKey(group.source) === sourceKey(action.source))
    if (index === -1) return [...groups, { source: action.source, actions: [action] }]
    return groups.map((group, currentIndex) =>
      currentIndex === index ? { ...group, actions: [...group.actions, action] } : group,
    )
  }, [])
}

function sourceKey(source: Lightbulb.IssueMutationSource) {
  return [source.goalID ?? "", source.loopID ?? "", source.runID ?? "", source.plannerArtifactHandle ?? ""].join(":")
}

function countOutcomes(
  pending: number,
  dryRun: number,
  outcomes: readonly IssueMutationApplyPassOutcome[],
): IssueMutationApplyPassResult["counts"] {
  return {
    pending,
    dryRun,
    applied: outcomes.filter((outcome) => outcome.status === "applied").length,
    skipped: outcomes.filter((outcome) => outcome.status === "skipped").length,
    held: outcomes.filter((outcome) => outcome.status === "held").length,
    failed: outcomes.filter((outcome) => outcome.status === "failed").length,
    superseded: outcomes.filter((outcome) => outcome.status === "superseded").length,
  }
}

function normalizeLabels(labels: readonly string[]) {
  return [...new Set(labels.map((label) => label.trim().toLowerCase()).filter(Boolean))].sort()
}

function uniqueReason(
  reason: Lightbulb.IssueMutationHoldReason,
  index: number,
  reasons: readonly Lightbulb.IssueMutationHoldReason[],
) {
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

const readyStatuses = ["ready"] as const
const retryableStatuses = ["ready", "failed"] as const
