import type { Lightbulb } from "../lightbulb"
import type { IssueRoutingInput } from "./decision-artifact"
import { createIssuePickupPacket, type PickupPacket } from "./pickup-packet"

export type IssueQueueCommentSnapshot = {
  readonly marker: string
  readonly bodyHandle: string
  readonly summary: string
}

export type IssueQueueSnapshot = {
  readonly accountID: Lightbulb.AccountID
  readonly number: number
  readonly title: string
  readonly url: string
  readonly labels: readonly string[]
  readonly updatedAt: number
  readonly state?: "open" | "closed"
  readonly body?: string
  readonly bodyHandle?: string
  readonly bodySummary?: string
  readonly dependencyRefs?: readonly string[]
  readonly possibleDuplicateRefs?: readonly string[]
  readonly blockedReason?: string | null
  readonly comments?: readonly IssueQueueCommentSnapshot[]
  readonly eventKeys?: readonly string[]
  readonly pickupPacket?: PickupPacket
}

export type DependencyIntegrationGateEvidence = {
  readonly dependencyRef: string
  readonly gateID: Lightbulb.GateID
  readonly status: "accepted" | "pending" | "rejected" | "needs-rework"
  readonly summary: string
  readonly artifactID?: Lightbulb.ArtifactID
}

export type DependencyBaseBranchEvidence = {
  readonly dependencyRef: string
  readonly baseRef: string
  readonly commitSha?: string
  readonly filePath?: string
  readonly summary?: string
}

export type DependencyUnblockEvidenceHandle = {
  readonly dependencyRef: string
  readonly kind: "issue" | "integration_gate" | "base_ref"
  readonly handle: string
  readonly summary: string
}

export type DependencyUnblockMutationRequest = {
  readonly issueRef: string
  readonly issueHandle: string
  readonly title: string
  readonly removeLabels: readonly string[]
  readonly addLabels: readonly string[]
  readonly setDependencyRefs: readonly string[]
  readonly setBlockedReason: string
  readonly evidenceHandles: readonly string[]
  readonly comment: {
    readonly marker: string
    readonly bodyHandle: string
    readonly summary: string
    readonly body: string
  } | null
}

export type DependencyUnblockEvent = {
  readonly key: string
  readonly issueRef: string
  readonly issueHandle: string
  readonly type: "lightbulb.issue_dependency.reconciled"
  readonly summary: string
  readonly evidenceHandles: readonly string[]
  readonly timeCreated: number | null
}

export type DependencyUnblockOperatorSummary = {
  readonly issueRef: string
  readonly issueHandle: string
  readonly title: string
  readonly status: "dependency_satisfied" | "remaining_holds" | "partial_dependency_satisfied"
  readonly evidenceHandles: readonly string[]
  readonly remainingHoldRefs: readonly string[]
  readonly summary: string
}

export type DependencyUnblockSkipped = {
  readonly issueRef: string
  readonly issueHandle: string
  readonly title: string
  readonly dependencyRefs: readonly string[]
  readonly reason: "missing_evidence"
  readonly summary: string
}

export type DependencyUnblockReconciliationInput = {
  readonly snapshots: readonly IssueQueueSnapshot[]
  readonly integrationGateEvidence?: readonly DependencyIntegrationGateEvidence[]
  readonly baseBranchEvidence?: readonly DependencyBaseBranchEvidence[]
  readonly now?: number
}

export type DependencyUnblockReconciliationResult = {
  readonly snapshots: readonly IssueQueueSnapshot[]
  readonly mutations: readonly DependencyUnblockMutationRequest[]
  readonly events: readonly DependencyUnblockEvent[]
  readonly operatorSummaries: readonly DependencyUnblockOperatorSummary[]
  readonly skipped: readonly DependencyUnblockSkipped[]
}

export type IssueQueueStatus =
  | "ready"
  | "dependency_blocked"
  | "human_held"
  | "active_worker_owned"
  | "integrated_done"
  | "not_ready"

export type IssueQueueClassification = {
  readonly issueRef: string
  readonly issueHandle: string
  readonly title: string
  readonly url: string
  readonly labels: readonly string[]
  readonly status: IssueQueueStatus
  readonly bodyHandle: string | null
  readonly bodySummary: string | null
  readonly dependencyRefs: readonly string[]
  readonly possibleDuplicateRefs: readonly string[]
  readonly blockerRefs: readonly string[]
  readonly updatedAt: number
  readonly promptHandle: string
  readonly instructionHandle: string
  readonly pickupPacket: PickupPacket
  readonly summary: string
}

export type IssueQueueTaskPacketRequest = {
  readonly accountID: Lightbulb.AccountID
  readonly issueRef: string
  readonly issueHandle: string
  readonly title: string
  readonly labels: readonly string[]
  readonly promptHandle: string
  readonly instructionHandle: string
  readonly bodyHandle: string | null
  readonly bodySummary: string | null
  readonly pickupPacket: PickupPacket
  readonly sourceUpdatedAt: number
}

export type IssueQueueSkippedWork = {
  readonly issueRef: string
  readonly issueHandle: string
  readonly title: string
  readonly reason: Exclude<IssueQueueStatus, "ready">
  readonly blockerRefs: readonly string[]
  readonly summary: string
}

export type IssueQueueIntakeResult = {
  readonly classifications: readonly IssueQueueClassification[]
  readonly routingInputs: readonly IssueRoutingInput[]
  readonly taskPacketRequests: readonly IssueQueueTaskPacketRequest[]
  readonly skipped: readonly IssueQueueSkippedWork[]
}

export function reconcileDependencyUnblocks(input: DependencyUnblockReconciliationInput) {
  const evidence = dependencyEvidenceByRef(input)
  const reconciled = input.snapshots.map((snapshot) => reconcileDependencySnapshot(snapshot, evidence, input.now ?? null))
  return {
    snapshots: reconciled.map((item) => item.snapshot),
    mutations: reconciled.flatMap((item) => (item.mutation ? [item.mutation] : [])),
    events: reconciled.flatMap((item) => item.events),
    operatorSummaries: reconciled.flatMap((item) => (item.operatorSummary ? [item.operatorSummary] : [])),
    skipped: reconciled.flatMap((item) => (item.skipped ? [item.skipped] : [])),
  } satisfies DependencyUnblockReconciliationResult
}

export function ingestIssueQueueSnapshots(input: { readonly snapshots: readonly IssueQueueSnapshot[] }) {
  const classifications = input.snapshots.map((snapshot) => classifyIssueQueueSnapshot(snapshot))
  return {
    classifications,
    routingInputs: classifications.flatMap((classification, index) =>
      classification.status === "ready" ? [toIssueRoutingInput(input.snapshots[index], classification)] : [],
    ),
    taskPacketRequests: classifications.flatMap((classification, index) =>
      classification.status === "ready" ? [toTaskPacketRequest(input.snapshots[index], classification)] : [],
    ),
    skipped: classifications.flatMap((classification) =>
      classification.status === "ready"
        ? []
        : [
            {
              issueRef: classification.issueRef,
              issueHandle: classification.issueHandle,
              title: classification.title,
              reason: classification.status,
              blockerRefs: classification.blockerRefs,
              summary: classification.summary,
            } satisfies IssueQueueSkippedWork,
          ],
    ),
  } satisfies IssueQueueIntakeResult
}

export function classifyIssueQueueSnapshot(snapshot: IssueQueueSnapshot): IssueQueueClassification {
  const issueRef = "#" + snapshot.number
  const labels = normalizeLabels(snapshot.labels)
  const issueHandle = "github:issue:" + snapshot.number
  const promptHandle = "github:issue:" + snapshot.number + ":prompt"
  const instructionHandle = snapshot.bodyHandle ?? "github:issue:" + snapshot.number + ":body"
  const dependencyRefs = uniqueRefs(snapshot.dependencyRefs ?? [])
  const possibleDuplicateRefs = uniqueRefs(snapshot.possibleDuplicateRefs ?? [])
  const pickupPacket = snapshot.pickupPacket ?? createIssuePickupPacket({
    issueRef,
    issueHandle,
    title: snapshot.title,
    url: snapshot.url,
    updatedAt: snapshot.updatedAt,
    body: snapshot.body,
    bodyHandle: snapshot.bodyHandle,
    bodySummary: snapshot.bodySummary,
    dependencyRefs,
    promptHandle,
    instructionHandle,
  })
  const status = issueQueueStatus(snapshot, labels, dependencyRefs)
  const blockerRefs = blockerRefsForStatus(snapshot, status, labels, dependencyRefs)
  return {
    issueRef,
    issueHandle,
    title: snapshot.title,
    url: snapshot.url,
    labels,
    status,
    bodyHandle: snapshot.bodyHandle ?? null,
    bodySummary: snapshot.bodySummary ?? null,
    dependencyRefs,
    possibleDuplicateRefs,
    blockerRefs,
    updatedAt: snapshot.updatedAt,
    promptHandle,
    instructionHandle,
    pickupPacket,
    summary: summaryForStatus(status, blockerRefs),
  }
}

function toIssueRoutingInput(snapshot: IssueQueueSnapshot, classification: IssueQueueClassification): IssueRoutingInput {
  return {
    accountID: snapshot.accountID,
    issueRef: classification.issueRef,
    issueHandle: classification.issueHandle,
    title: classification.title,
    url: classification.url,
    labels: classification.labels,
    bodyHandle: classification.bodyHandle ?? undefined,
    bodySummary: classification.bodySummary ?? undefined,
    updatedAt: classification.updatedAt,
    dependencyRefs: classification.dependencyRefs,
    promptHandle: classification.promptHandle,
    instructionHandle: classification.instructionHandle,
    pickupPacket: classification.pickupPacket,
  }
}

function toTaskPacketRequest(snapshot: IssueQueueSnapshot, classification: IssueQueueClassification): IssueQueueTaskPacketRequest {
  return {
    accountID: snapshot.accountID,
    issueRef: classification.issueRef,
    issueHandle: classification.issueHandle,
    title: classification.title,
    labels: classification.labels,
    promptHandle: classification.promptHandle,
    instructionHandle: classification.instructionHandle,
    bodyHandle: classification.bodyHandle,
    bodySummary: classification.bodySummary,
    pickupPacket: classification.pickupPacket,
    sourceUpdatedAt: classification.updatedAt,
  }
}

function issueQueueStatus(
  snapshot: IssueQueueSnapshot,
  labels: readonly string[],
  dependencyRefs: readonly string[],
): IssueQueueStatus {
  if (labels.includes("agent-integrated") || labels.includes("agent-reviewed") || snapshot.state === "closed") return "integrated_done"
  if (labels.includes("agent-running") || labels.includes("agent-done") || labels.includes("worker-owned")) return "active_worker_owned"
  if (labels.includes("blocked-by-dependency") || dependencyRefs.length > 0) return "dependency_blocked"
  if (holdLabelRefs(labels).length > 0) return "human_held"
  if (labels.includes("ready-for-agent")) return "ready"
  return "not_ready"
}

function blockerRefsForStatus(
  snapshot: IssueQueueSnapshot,
  status: IssueQueueStatus,
  labels: readonly string[],
  dependencyRefs: readonly string[],
) {
  if (status === "dependency_blocked") return dependencyRefs.length ? dependencyRefs : ["label:blocked-by-dependency"]
  if (status === "human_held") return holdLabelRefs(labels)
  if (status === "active_worker_owned") return labelRefs(labels, ["agent-running", "agent-done", "worker-owned"], "label:worker-owned")
  if (status === "integrated_done") return snapshot.state === "closed" ? ["state:closed"] : labelRefs(labels, ["agent-integrated", "agent-reviewed"], "label:agent-integrated")
  if (status === "not_ready") return ["label:ready-for-agent-missing"]
  return []
}

function summaryForStatus(status: IssueQueueStatus, blockerRefs: readonly string[]) {
  if (status === "ready") return "Issue is ready for bounded Lightbulb worker pickup."
  if (status === "dependency_blocked") return "Issue is dependency-blocked by " + blockerRefs.join(", ") + "."
  if (status === "human_held") return "Issue is held for human input or review."
  if (status === "active_worker_owned") return "Issue already has an active or completed Lightbulb worker lane."
  if (status === "integrated_done") return "Issue has already been integrated or closed."
  return "Issue is not labelled ready-for-agent."
}

function normalizeLabels(labels: readonly string[]) {
  return labels.map((label) => label.trim().toLowerCase()).filter((label) => label.length > 0)
}

function labelRefs(labels: readonly string[], names: readonly string[], fallback: string) {
  const refs = names.filter((name) => labels.includes(name)).map((name) => "label:" + name)
  return refs.length ? refs : [fallback]
}

function holdLabelRefs(labels: readonly string[]) {
  return [
    "ready-for-human",
    "needs-info",
    "needs-triage",
    "budget-held",
    "budget_held",
    "context-policy-held",
    "context-held",
    "adr-gate-held",
    "decision-held",
    "needs-adr",
  ]
    .filter((name) => labels.includes(name))
    .map((name) => "label:" + name)
}

function uniqueRefs(refs: readonly string[]) {
  return [...new Set(refs.map((ref) => ref.trim()).filter((ref) => ref.length > 0))]
}

function dependencyEvidenceByRef(input: DependencyUnblockReconciliationInput) {
  return [
    ...input.snapshots.flatMap((snapshot) => snapshotDependencyEvidence(snapshot)),
    ...(input.integrationGateEvidence ?? []).flatMap((item) => integrationGateEvidence(item)),
    ...(input.baseBranchEvidence ?? []).flatMap((item) => baseBranchEvidence(item)),
  ].reduce((evidence, item) => {
    const key = normalizeDependencyRef(item.dependencyRef)
    return key && !evidence.has(key) ? evidence.set(key, item) : evidence
  }, new Map<string, DependencyUnblockEvidenceHandle>())
}

function snapshotDependencyEvidence(snapshot: IssueQueueSnapshot) {
  const labels = normalizeLabels(snapshot.labels)
  const issueRef = "#" + snapshot.number
  if (snapshot.state === "closed") {
    return [
      {
        dependencyRef: issueRef,
        kind: "issue" as const,
        handle: "github:issue:" + snapshot.number + ":closed",
        summary: issueRef + " is closed.",
      },
    ]
  }
  if (labels.includes("agent-integrated") || labels.includes("agent-reviewed")) {
    return [
      {
        dependencyRef: issueRef,
        kind: "issue" as const,
        handle: "github:issue:" + snapshot.number + ":integrated",
        summary: issueRef + " has integrated issue evidence.",
      },
    ]
  }
  return []
}

function integrationGateEvidence(input: DependencyIntegrationGateEvidence) {
  if (input.status !== "accepted") return []
  return [
    {
      dependencyRef: input.dependencyRef,
      kind: "integration_gate" as const,
      handle: "lightbulb:gate:" + input.gateID + ":accepted",
      summary: input.summary,
    },
  ]
}

function baseBranchEvidence(input: DependencyBaseBranchEvidence) {
  if (!input.commitSha && !input.filePath) return []
  const location = input.commitSha ?? input.filePath ?? input.baseRef
  return [
    {
      dependencyRef: input.dependencyRef,
      kind: "base_ref" as const,
      handle: "git:" + input.baseRef + ":" + location,
      summary:
        input.summary ??
        input.dependencyRef + " has base-ref evidence on " + input.baseRef + " at " + location + ".",
    },
  ]
}

function reconcileDependencySnapshot(
  snapshot: IssueQueueSnapshot,
  evidence: ReadonlyMap<string, DependencyUnblockEvidenceHandle>,
  now: number | null,
) {
  const labels = normalizeLabels(snapshot.labels)
  const dependencyRefs = uniqueRefs(snapshot.dependencyRefs ?? [])
  if (!labels.includes("blocked-by-dependency") && dependencyRefs.length === 0) {
    return { snapshot: { ...snapshot, labels, dependencyRefs } satisfies IssueQueueSnapshot, events: [] }
  }

  const satisfiedEvidence = dependencyRefs.flatMap((ref) => {
    const item = evidence.get(normalizeDependencyRef(ref))
    return item ? [item] : []
  })
  if (satisfiedEvidence.length === 0) {
    return {
      snapshot: { ...snapshot, labels, dependencyRefs } satisfies IssueQueueSnapshot,
      events: [],
      skipped: {
        issueRef: "#" + snapshot.number,
        issueHandle: "github:issue:" + snapshot.number,
        title: snapshot.title,
        dependencyRefs,
        reason: "missing_evidence" as const,
        summary:
          "Issue #" +
          snapshot.number +
          " remains dependency-held; missing explicit evidence for " +
          (dependencyRefs.length ? dependencyRefs.join(", ") : "label:blocked-by-dependency") +
          ".",
      },
    }
  }

  const unresolvedRefs = dependencyRefs.filter((ref) => !evidence.has(normalizeDependencyRef(ref)))
  const evidenceHandles = uniqueRefs(satisfiedEvidence.map((item) => item.handle))
  const nextLabels = unresolvedRefs.length === 0 ? labels.filter((label) => label !== "blocked-by-dependency") : labels
  const remainingHoldRefs = [...unresolvedRefs.map((ref) => "dependency:" + ref), ...holdLabelRefs(nextLabels)]
  const setBlockedReason = blockedReasonForDependencyReconciliation(evidenceHandles, remainingHoldRefs)
  const eventKey = dependencyUnblockKey(snapshot.number, evidenceHandles)
  const marker = "lightbulb:dependency-unblocked:" + eventKey
  const existingComments = snapshot.comments ?? []
  const existingEventKeys = snapshot.eventKeys ?? []
  const comment = existingComments.some((item) => item.marker === marker)
    ? null
    : {
        marker,
        bodyHandle: "github:issue:" + snapshot.number + ":comment:" + eventKey,
        summary: "Dependency evidence accepted: " + evidenceHandles.join(", ") + ".",
        body: "Lightbulb dependency reconciliation: dependency satisfied by " + evidenceHandles.join(", ") + ".",
      }
  const nextSnapshot = {
    ...snapshot,
    labels: nextLabels,
    dependencyRefs: unresolvedRefs,
    blockedReason: setBlockedReason,
    comments: comment ? [...existingComments, { marker: comment.marker, bodyHandle: comment.bodyHandle, summary: comment.summary }] : existingComments,
    eventKeys: existingEventKeys.includes(eventKey) ? existingEventKeys : [...existingEventKeys, eventKey],
  } satisfies IssueQueueSnapshot

  return {
    snapshot: nextSnapshot,
    mutation: {
      issueRef: "#" + snapshot.number,
      issueHandle: "github:issue:" + snapshot.number,
      title: snapshot.title,
      removeLabels: labels.includes("blocked-by-dependency") && unresolvedRefs.length === 0 ? ["blocked-by-dependency"] : [],
      addLabels: [],
      setDependencyRefs: unresolvedRefs,
      setBlockedReason,
      evidenceHandles,
      comment,
    } satisfies DependencyUnblockMutationRequest,
    events: existingEventKeys.includes(eventKey)
      ? []
      : [
          {
            key: eventKey,
            issueRef: "#" + snapshot.number,
            issueHandle: "github:issue:" + snapshot.number,
            type: "lightbulb.issue_dependency.reconciled" as const,
            summary: "Reconciled dependency evidence for #" + snapshot.number + ": " + evidenceHandles.join(", ") + ".",
            evidenceHandles,
            timeCreated: now,
          },
        ],
    operatorSummary: {
      issueRef: "#" + snapshot.number,
      issueHandle: "github:issue:" + snapshot.number,
      title: snapshot.title,
      status:
        unresolvedRefs.length > 0
          ? ("partial_dependency_satisfied" as const)
          : remainingHoldRefs.length > 0
            ? ("remaining_holds" as const)
            : ("dependency_satisfied" as const),
      evidenceHandles,
      remainingHoldRefs,
      summary:
        remainingHoldRefs.length > 0
          ? "Issue #" +
            snapshot.number +
            " dependency hold reduced by " +
            evidenceHandles.join(", ") +
            "; remaining holds: " +
            remainingHoldRefs.join(", ") +
            "."
          : "Issue #" + snapshot.number + " dependency hold cleared by " + evidenceHandles.join(", ") + ".",
    } satisfies DependencyUnblockOperatorSummary,
  }
}

function blockedReasonForDependencyReconciliation(evidenceHandles: readonly string[], remainingHoldRefs: readonly string[]) {
  if (remainingHoldRefs.length > 0) {
    return "Still blocked by " + remainingHoldRefs.join(", ") + "; dependency satisfied by " + evidenceHandles.join(", ") + "."
  }
  return "None - dependency satisfied by " + evidenceHandles.join(", ") + "."
}

function dependencyUnblockKey(issueNumber: number, evidenceHandles: readonly string[]) {
  return "issue-" + issueNumber + ":" + evidenceHandles.join("+")
}

function normalizeDependencyRef(ref: string) {
  const trimmed = ref.trim()
  const issueURL = trimmed.match(/\/issues\/(\d+)(?:$|[#?])/)
  if (issueURL?.[1]) return "#" + issueURL[1]
  const issueHandle = trimmed.match(/^github:issue:(\d+)$/)
  if (issueHandle?.[1]) return "#" + issueHandle[1]
  const bareNumber = trimmed.match(/^#?(\d+)$/)
  if (bareNumber?.[1]) return "#" + bareNumber[1]
  return trimmed
}
