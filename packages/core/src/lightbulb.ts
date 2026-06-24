export * as Lightbulb from "./lightbulb"
export { ArtifactRegistrationRejected } from "./lightbulb/artifact-registration"
export { defaultContextBundlePolicy } from "./lightbulb/context-bundle"
export * from "./lightbulb/policy"
export type {
  DecisionArtifactHandle,
  DecisionArtifactStatus,
  DecisionArtifactSummary,
  DecisionArtifactType,
  IssueRoutingClassification,
  IssueRoutingInput,
  RegisterDecisionArtifactInput,
  TransitionDecisionArtifactInput,
  WorkerDispatchPlan,
} from "./lightbulb/decision-artifact"
export type {
  ContextBundleAssemblyResult,
  ContextBundleAssemblyServiceInput,
  ContextBundleDecisionHold,
  ContextBundleManifest,
  ContextBundleManifestHandle,
  ContextBundlePolicy,
  ContextBundlePolicyHold,
  ContextBundlePolicyOutcome,
  ContextBundleSourceExcerpt,
  ContextBundleSpawnReadyPacket,
  ContextBundleTaskPacketRequest,
  ContextBundleVerificationExpectation,
  ContextBundleWorkItemSummary,
} from "./lightbulb/context-bundle"
export * from "./lightbulb/loop-profile"
export * from "./lightbulb/loop-runner-tick"
export * from "./lightbulb/operations-snapshot"
export * from "./lightbulb/discovery-inbox"
export * from "./lightbulb/issue-mutation-outbox"
export * from "./lightbulb/issue-intake"
export * from "./lightbulb/pickup-packet"
export * from "./lightbulb/pr-review-candidate"
export * from "./lightbulb/pr-review-route"
export * from "./lightbulb/pr-review-state"
export * from "./lightbulb/review-gate"
export * from "./lightbulb/run-ledger"
export * from "./lightbulb/scheduler"
export * from "./lightbulb/scheduler-supervisor"
export * from "./lightbulb/scheduler-tick"
export * from "./lightbulb/worker-launch"
export * from "./lightbulb/worker-report"
export * from "./lightbulb/worker-runtime"
export * from "./lightbulb/budget-ledger"
export * from "./lightbulb/operator-export"
export * from "./lightbulb/loop-readiness"

import { and, asc, desc, eq, or } from "drizzle-orm"
import { Context, Effect, Layer, Schema } from "effect"
import { Database } from "./database/database"
import { LayerNode } from "./effect/layer-node"
import type { CreateGoalInput, CreateGoalResult, GoalLifecycle, GoalRunTree, GoalSummary, UpdateGoalStatusInput } from "./lightbulb/goal"
import { GoalLifecycleService } from "./lightbulb/goal"
import { withStatics } from "./schema"
import { Identifier } from "./util/identifier"
import { readArtifactHandle, readIssueArtifactsInDb, statusForRetentionDecision } from "./lightbulb/artifact"
import {
  ArtifactRegistrationRejected,
  registerArtifactInDb,
  registerHarnessArtifactInDb,
} from "./lightbulb/artifact-registration"
import { assembleContextBundle, databaseContextBundleStorage } from "./lightbulb/context-bundle"
import { toDashboard, toGoalRunTree } from "./lightbulb/dashboard"
import { applyGatePolicyInDb, gateBlockedReason, type GatePolicyInput, type GatePolicyTransition } from "./lightbulb/policy"
import { createIssuePickupPacket } from "./lightbulb/pickup-packet"
import {
  discoverPRReviewCandidatesInDb,
  type PRReviewCandidateDiscoveryInput,
  type PRReviewCandidateDiscoveryResult,
} from "./lightbulb/pr-review-candidate"
import {
  projectDiscoveryInboxInDb,
  toDiscoveryCandidateSummary,
  type DiscoveryInboxProjectionInput,
  type DiscoveryInboxProjectionResult,
} from "./lightbulb/discovery-inbox"
import {
  admitPRReviewRouteInDb,
  readActivePRReviewRoutesInDb,
  recordPRReviewRouteWakeInDb,
  type PRReviewRouteAdmissionResult,
  type PRReviewRouteAdmissionServiceInput,
  type PRReviewRouteWakeResult,
  type PRReviewRouteWakeServiceInput,
} from "./lightbulb/pr-review-route"
import {
  readPRReviewRouteDigestInDb,
  type PRReviewRouteDigestInput,
} from "./lightbulb/pr-review-state"
import {
  publishOperationsSnapshotInDb,
} from "./lightbulb/operations-snapshot"
import { buildOperatorExport, type OperatorExport } from "./lightbulb/operator-export"
import { buildLoopReadinessAudit, type LoopReadinessAudit } from "./lightbulb/loop-readiness"
import { planGoalRoute as planGoalRouteInDb, readGoalRoute as readGoalRouteFromDb, steerGoalRoute as steerGoalRouteInDb } from "./lightbulb/route"
import {
  classifyIssueRouting,
  planWorkerDispatch,
  registerDecisionArtifactInDb,
  toDecisionArtifactHandle,
  transitionDecisionArtifactInDb,
} from "./lightbulb/decision-artifact"
import type {
  DecisionArtifactHandle,
  IssueRoutingClassification,
  IssueRoutingInput,
  RegisterDecisionArtifactInput,
  TransitionDecisionArtifactInput,
  WorkerDispatchPlan,
} from "./lightbulb/decision-artifact"
import {
  ingestIssueQueueSnapshots,
  reconcileDependencyUnblocks,
  type DependencyUnblockReconciliationInput,
  type DependencyUnblockReconciliationResult,
  type IssueQueueIntakeResult,
  type IssueQueueSnapshot,
} from "./lightbulb/issue-intake"
import {
  proposeIssueMutationInDb,
  readIssueMutationOutboxInDb,
  recordIssueMutationApplyResultInDb,
} from "./lightbulb/issue-mutation-outbox"
import type { ContextBundleAssemblyResult, ContextBundleAssemblyServiceInput } from "./lightbulb/context-bundle"
import {
  LightbulbAccountTable,
  LightbulbArtifactEdgeTable,
  LightbulbArtifactTable,
  LightbulbBudgetUsageTable,
  LightbulbEventTable,
  LightbulbDiscoveryCandidateTable,
  LightbulbGateTable,
  LightbulbGoalTable,
  LightbulbIssueMutationOutboxTable,
  LightbulbLoopTable,
  LightbulbOperationsSnapshotTable,
  LightbulbPRReviewCandidateTable,
  LightbulbPRReviewRouteTable,
  LightbulbPRReviewRouteWakeTable,
  LightbulbRouteSteerTable,
  LightbulbRouteStopTable,
  LightbulbRouteTable,
  LightbulbRunTable,
  LightbulbTaskPacketTable,
  LightbulbWorkerLaunchAttemptTable,
  LightbulbWorkerTable,
} from "./lightbulb/sql"
import {
  openReviewGateInDb,
  ReviewGateRejected,
  toReviewGateReadModel,
  transitionReviewGateInDb,
  type OpenReviewGateServiceInput,
  type ReviewGateHandle,
  type ReviewGateReadModel,
  type TransitionReviewGateServiceInput,
} from "./lightbulb/review-gate"
import {
  bootstrapLoopProfiles,
  databaseLoopProfileStorage,
  readLoopProfileSummariesInDb,
  type LoopProfileBootstrapServiceInput,
  type LoopProfileBootstrapSummary,
  type LoopProfileCompactSummary,
} from "./lightbulb/loop-profile"
import {
  runAccountLoopTickInDb,
  type AccountLoopRunnerTickResult,
  type AccountLoopRunnerTickServiceInput,
} from "./lightbulb/loop-runner-tick"
import { admitLoopRunInDb, type LoopRunAdmissionResult, type LoopRunAdmissionServiceInput } from "./lightbulb/run-ledger"
import { readLoopSchedulesInDb, type LoopScheduleReadModel } from "./lightbulb/scheduler"
import {
  superviseScheduledLoopsInDb,
  type SchedulerSupervisorResult,
  type SchedulerSupervisorServiceInput,
} from "./lightbulb/scheduler-supervisor"
import {
  admitScheduledLoopRunsInDb,
  type LoopSchedulerTickOutcome,
  type LoopSchedulerTickResult,
  type LoopSchedulerTickServiceInput,
} from "./lightbulb/scheduler-tick"
import {
  launchWorkerInDb,
  toWorkerLaunchAttemptHandle,
  type WorkerLaunchAttemptHandle,
  type WorkerLaunchResult,
  type WorkerLaunchServiceInput,
} from "./lightbulb/worker-launch"
import {
  ingestWorkerReportInDb,
  WorkerReportRejected,
  type IngestWorkerReportServiceInput,
  type WorkerReportIngestionResult,
} from "./lightbulb/worker-report"
import {
  BudgetUsageRejected,
  readLoopBudgetInDb,
  recordBudgetUsageInDb,
  type BudgetUsageRecordResult,
  type BudgetUsageServiceInput,
  type LoopBudgetReadModel,
} from "./lightbulb/budget-ledger"

const prefixedID = <const Prefix extends string>(prefix: Prefix, brand: string) =>
  Schema.String.check(Schema.isStartsWith(`${prefix}_`)).pipe(
    Schema.brand(brand),
    withStatics((schema) => ({ create: () => schema.make(`${prefix}_${Identifier.ascending()}`) })),
  )

export const AccountID = prefixedID("lbacc", "Lightbulb.AccountID")
export type AccountID = typeof AccountID.Type
export const GoalID = prefixedID("lbgoal", "Lightbulb.GoalID")
export type GoalID = typeof GoalID.Type
export const LoopID = prefixedID("lbloop", "Lightbulb.LoopID")
export type LoopID = typeof LoopID.Type
export const RunID = prefixedID("lbrun", "Lightbulb.RunID")
export type RunID = typeof RunID.Type
export const WorkerID = prefixedID("lbworker", "Lightbulb.WorkerID")
export type WorkerID = typeof WorkerID.Type
export const TaskPacketID = prefixedID("lbpacket", "Lightbulb.TaskPacketID")
export type TaskPacketID = typeof TaskPacketID.Type
export const WorkerLaunchAttemptID = prefixedID("lblaunch", "Lightbulb.WorkerLaunchAttemptID")
export type WorkerLaunchAttemptID = typeof WorkerLaunchAttemptID.Type
export const ArtifactID = prefixedID("lbartifact", "Lightbulb.ArtifactID")
export type ArtifactID = typeof ArtifactID.Type
export const GateID = prefixedID("lbgate", "Lightbulb.GateID")
export type GateID = typeof GateID.Type
export const EventID = prefixedID("lbevent", "Lightbulb.EventID")
export type EventID = typeof EventID.Type
export const RouteID = prefixedID("lbroute", "Lightbulb.RouteID"); export type RouteID = typeof RouteID.Type
export const RouteStopID = prefixedID("lbstop", "Lightbulb.RouteStopID"); export type RouteStopID = typeof RouteStopID.Type
export const RouteSteerID = prefixedID("lbsteer", "Lightbulb.RouteSteerID"); export type RouteSteerID = typeof RouteSteerID.Type
export const PRReviewCandidateID = prefixedID("lbprcand", "Lightbulb.PRReviewCandidateID")
export type PRReviewCandidateID = typeof PRReviewCandidateID.Type
export const DiscoveryCandidateID = prefixedID("lbdiscand", "Lightbulb.DiscoveryCandidateID")
export type DiscoveryCandidateID = typeof DiscoveryCandidateID.Type
export const PRReviewRouteWakeID = prefixedID("lbprwake", "Lightbulb.PRReviewRouteWakeID")
export type PRReviewRouteWakeID = typeof PRReviewRouteWakeID.Type
export const OperationsSnapshotID = prefixedID("lbops", "Lightbulb.OperationsSnapshotID")
export type OperationsSnapshotID = typeof OperationsSnapshotID.Type
export const IssueMutationID = prefixedID("lbim", "Lightbulb.IssueMutationID")
export type IssueMutationID = typeof IssueMutationID.Type
export const BudgetUsageID = prefixedID("lbusage", "Lightbulb.BudgetUsageID")
export type BudgetUsageID = typeof BudgetUsageID.Type

export type AccountStatus = "active" | "paused" | "archived"
export type GoalStatus = "active" | "held" | "completed" | "cancelled" | "stopped"
export type LoopKind = "discovery" | "implementation" | "debug" | "review" | "integration" | "status"
export type LoopStatus = "active" | "idle" | "blocked" | "complete" | "disabled" | "held"
export type RunStatus = "queued" | "running" | "blocked" | "complete" | "failed"
export type ReviewStatus = "not_requested" | "requested" | "changes_requested" | "approved"
export type DebugStatus = "not_started" | "reproducing" | "isolating" | "fixed" | "blocked"
export type GateStatus = "pending" | "running" | "passed" | "failed" | "blocked"
export type WorkerStatus = "queued" | "running" | "blocked" | "complete" | "failed"
export type TaskPacketStatus = "ready" | "claimed" | "complete" | "blocked"
export type WorkerLaunchStatus = "requested" | "launching" | "running" | "launch_failed" | "blocked" | "complete" | "cancelled"
export type WorkerLaunchTrigger = "scheduler" | "manual" | "recovery"
export type WorkerLaunchHoldReason =
  | "dependency_held"
  | "human_review_held"
  | "budget_held"
  | "context_policy_held"
  | "ownership_collision"
export type BudgetUsageSourceKind = "worker_report" | "run_usage" | "local_report"
export type ArtifactType =
  | "report"
  | "plan"
  | "patch"
  | "test_result"
  | "handoff"
  | "log"
  | "prd"
  | "adr"
  | "design_discussion"
  | "html_decision"
  | "run_report"
  | "scaffold"
  | "operator_summary"
  | "context_manifest"
export type ArtifactStatus = "registered" | "consumed" | "superseded" | "expired"
export type ArtifactEdgeRelation = "produced_by" | "consumed_by" | "supersedes" | "verifies"
export type ArtifactProducerKind = "worker" | "harness"
export type GateKind = "review" | "debug" | "verification" | "policy"
export type ArtifactIntegrityStatus = "verified" | "changed" | "missing" | "unchecked"
export type RouteStatus = "active" | "rerouting" | "arrived" | "blocked" | "cancelled"
export type RouteStopKind = "discovery" | "implementation" | "debug" | "review" | "integration" | "verification" | "decision" | "cleanup"
export type RouteStopStatus = "pending" | "active" | "complete" | "blocked" | "skipped"
export type RouteSteerReason = "user" | "blocker" | "failed_gate" | "new_evidence" | "schedule" | "system"
export type PRReviewCandidateState = "open" | "closed" | "merged" | "unknown"
export type PRReviewCandidateStatus = "ready" | "stale" | "closed"
export type PRReviewRouteStatus = "active" | "blocked" | "complete" | "held"
export type PRReviewRouteWakeSource =
  | "worker_report"
  | "review_evidence"
  | "ci_evidence"
  | "schedule_tick"
  | "human_steering"
export type OperationsSnapshotStatus = "empty" | "active" | "attention_required" | "held"
export type IssueMutationAction = "create_issue" | "edit_issue" | "add_label" | "remove_label" | "add_comment"
export type IssueMutationStatus = "ready" | "held" | "applied" | "skipped" | "failed" | "superseded"
export type IssueMutationIssueState = "open" | "closed"
export type IssueMutationHoldReason =
  | "missing_create_title"
  | "missing_create_body"
  | "missing_target_issue"
  | "conflicting_state_label"
  | "unsafe_label_removal"
  | "stale_snapshot_precondition"
export type IssueMutationApplyStatus = "applied" | "skipped" | "failed" | "superseded"

export type IssueMutationSource = {
  readonly goalID?: GoalID
  readonly loopID?: LoopID
  readonly runID?: RunID
  readonly artifactIDs?: readonly ArtifactID[]
  readonly artifactHandles?: readonly string[]
  readonly plannerArtifactHandle?: string
}

export type IssueMutationTargetIssue = {
  readonly number: number
  readonly ref?: string
  readonly handle?: string
  readonly url?: string
  readonly snapshotUpdatedAt?: number
  readonly labels?: readonly string[]
  readonly state?: IssueMutationIssueState
}

export type IssueMutationSnapshotPrecondition = {
  readonly expectedSnapshotUpdatedAt?: number
}

export type IssueMutationCommentProposal = {
  readonly body: string
  readonly bodyHandle?: string
  readonly marker?: string
  readonly summary?: string
}

export type IssueMutationProposalInput = {
  readonly accountID: AccountID
  readonly repository: string
  readonly action: IssueMutationAction
  readonly source?: IssueMutationSource
  readonly targetIssue?: IssueMutationTargetIssue
  readonly title?: string | null
  readonly body?: string | null
  readonly labels?: readonly string[]
  readonly addLabels?: readonly string[]
  readonly removeLabels?: readonly string[]
  readonly state?: IssueMutationIssueState
  readonly comment?: IssueMutationCommentProposal
  readonly precondition?: IssueMutationSnapshotPrecondition
  readonly applySummary?: string
  readonly idempotencyKey?: string
  readonly now?: number
  readonly metadata?: Record<string, unknown>
}

export type IssueMutationRenderedTarget = {
  readonly issueNumber: number
  readonly issueRef: string
  readonly issueHandle: string
  readonly issueURL: string
  readonly snapshotUpdatedAt: number | null
  readonly labels: readonly string[]
  readonly state: IssueMutationIssueState | null
}

export type IssueMutationRenderedMutation = {
  readonly action: IssueMutationAction
  readonly repository: string
  readonly idempotencyKey: string
  readonly targetIssue: IssueMutationRenderedTarget | null
  readonly title: string | null
  readonly body: string | null
  readonly labels: readonly string[]
  readonly addLabels: readonly string[]
  readonly removeLabels: readonly string[]
  readonly state: IssueMutationIssueState | null
  readonly comment: IssueMutationCommentProposal | null
  readonly summary: string
  readonly source: IssueMutationSource
  readonly precondition: IssueMutationSnapshotPrecondition | null
}

export type IssueMutationApplyResult = {
  readonly status: IssueMutationApplyStatus
  readonly summary: string
  readonly issueURL: string | null
  readonly resultHandle: string | null
  readonly errorHandle: string | null
  readonly appliedAt: number
  readonly metadata: Record<string, unknown> | null
}

export type IssueMutationOutboxItem = {
  readonly id: IssueMutationID
  readonly accountID: AccountID
  readonly repository: string
  readonly action: IssueMutationAction
  readonly status: IssueMutationStatus
  readonly targetIssue: IssueMutationRenderedTarget | null
  readonly desiredLabels: readonly string[]
  readonly desiredState: IssueMutationIssueState | null
  readonly idempotencyKey: string
  readonly source: IssueMutationSource
  readonly renderedMutation: IssueMutationRenderedMutation | null
  readonly holdReasons: readonly IssueMutationHoldReason[]
  readonly applySummary: string
  readonly applyResult: IssueMutationApplyResult | null
  readonly metadata: Record<string, unknown> | null
  readonly timeCreated: number
  readonly timeUpdated: number
}

export type IssueMutationProposalResult = {
  readonly item: IssueMutationOutboxItem
  readonly created: boolean
  readonly eventID: EventID | null
}

export type IssueMutationOutboxReadInput = {
  readonly accountID: AccountID
  readonly status?: IssueMutationStatus
}

export type IssueMutationApplyResultInput = {
  readonly mutationID: IssueMutationID
  readonly status: IssueMutationApplyStatus
  readonly summary: string
  readonly issueURL?: string
  readonly resultHandle?: string
  readonly errorHandle?: string
  readonly appliedAt?: number
  readonly metadata?: Record<string, unknown>
}

export type IssueMutationApplyRecordResult = {
  readonly item: IssueMutationOutboxItem
  readonly changed: boolean
  readonly eventID: EventID | null
}

export type PRReviewCandidateRouteSeed = {
  readonly sourceRef: string
  readonly repository: string
  readonly pullNumber: number
  readonly url: string
  readonly baseRef: string
  readonly headRef: string
  readonly headSha: string | null
}

export type PRReviewCandidateEvidence = {
  readonly observedAt: number
  readonly source: Record<string, unknown>
  readonly reason: "returned_by_scan" | "not_returned_by_scan"
}

export type PRReviewCandidateScanPull = {
  readonly number: number
  readonly title: string
  readonly url: string
  readonly state: Exclude<PRReviewCandidateState, "unknown">
  readonly baseRef: string
  readonly headRef: string
  readonly headSha?: string | null
  readonly metadata?: Record<string, unknown>
}

export type PRReviewCandidateSummary = {
  readonly id: PRReviewCandidateID
  readonly repository: string
  readonly pullNumber: number
  readonly title: string
  readonly url: string
  readonly state: PRReviewCandidateState
  readonly status: PRReviewCandidateStatus
  readonly baseRef: string
  readonly headRef: string
  readonly headSha: string | null
  readonly lastSeenAt: number
  readonly lastCheckedAt: number
  readonly routeSeed: PRReviewCandidateRouteSeed
  readonly evidence: PRReviewCandidateEvidence
}

export type DiscoveryCandidateSourceKind = "issue" | "pull_request" | "ci" | "connector"
export type DiscoveryCandidateStatus = "open" | "held" | "blocked" | "resolved" | "ignored"
export type DiscoveryCandidateSection =
  | "top_actionable"
  | "needs_human"
  | "possible_duplicates"
  | "watch"
  | "noise"
  | "recent_resolved"

export type DiscoveryCandidateSourceHandles = {
  readonly sourceRef: string
  readonly issueRef?: string
  readonly issueHandle?: string
  readonly promptHandle?: string
  readonly instructionHandle?: string
  readonly url: string
}

export type DiscoveryCandidateSummary = {
  readonly id: DiscoveryCandidateID
  readonly sourceKind: DiscoveryCandidateSourceKind
  readonly sourceID: string
  readonly title: string
  readonly url: string
  readonly status: DiscoveryCandidateStatus
  readonly section: DiscoveryCandidateSection
  readonly score: number
  readonly reason: string
  readonly suggestedAction: string
  readonly sourceHandles: DiscoveryCandidateSourceHandles
  readonly duplicateRefs: readonly string[]
  readonly labels: readonly string[]
  readonly lastSeenAt: number
  readonly lastProjectedAt: number
}

export type DiscoveryCandidateAction = {
  readonly candidateID: DiscoveryCandidateID
  readonly sourceID: string
  readonly title: string
  readonly action: string
  readonly reason: string
}

export type DiscoveryCandidateInbox = {
  readonly topActionable: DiscoveryCandidateSummary[]
  readonly needsHuman: DiscoveryCandidateSummary[]
  readonly possibleDuplicates: DiscoveryCandidateSummary[]
  readonly proposedActions: DiscoveryCandidateAction[]
  readonly watch: DiscoveryCandidateSummary[]
  readonly noise: DiscoveryCandidateSummary[]
  readonly recentResolved: DiscoveryCandidateSummary[]
}

export type PRReviewRouteWorkerHandle = {
  readonly id: WorkerID
  readonly role: string
  readonly status: WorkerStatus
  readonly summary: string
}

export type PRReviewRouteEvidence = {
  readonly observedAt: number
  readonly source: PRReviewRouteWakeSource
  readonly summary: string
  readonly artifactID?: ArtifactID
  readonly status?: string
  readonly data?: Record<string, unknown>
}

export type PRReviewRouteCurrentStop = {
  readonly id: RouteStopID
  readonly kind: RouteStopKind
  readonly title: string
  readonly status: RouteStopStatus
}

export type PRReviewRouteSummary = {
  readonly id: RouteID
  readonly goalID: GoalID
  readonly candidateID: PRReviewCandidateID
  readonly repository: string
  readonly pullNumber: number
  readonly title: string
  readonly url: string
  readonly status: PRReviewRouteStatus
  readonly currentStop: PRReviewRouteCurrentStop | null
  readonly latestEvidence: PRReviewRouteEvidence | null
  readonly activeWorker: PRReviewRouteWorkerHandle | null
  readonly blockedReason: string | null
  readonly nextWakeSource: PRReviewRouteWakeSource | null
  readonly mergeReady: boolean
  readonly lastWokeAt: number | null
}

export type PRReviewRouteDigestStatus = "ci_red" | "changes_requested" | "ready" | "blocked" | "idle"

export type PRReviewRouteDigestItem = {
  readonly routeID: RouteID
  readonly candidateID: PRReviewCandidateID
  readonly repository: string
  readonly pullNumber: number
  readonly title: string
  readonly url: string
  readonly status: PRReviewRouteDigestStatus
  readonly routeStatus: PRReviewRouteStatus
  readonly currentStop: PRReviewRouteCurrentStop | null
  readonly attemptCount: number
  readonly maxAttempts: number
  readonly lastAction: string
  readonly latestEvidence: PRReviewRouteEvidence | null
  readonly activeWorker: PRReviewRouteWorkerHandle | null
  readonly humanDecision: string | null
  readonly blockedReason: string | null
  readonly escalationReasons: string[]
  readonly nextWakeSource: PRReviewRouteWakeSource | null
  readonly mergeReady: boolean
  readonly lastWokeAt: number | null
}

export type PRReviewRouteDigest = {
  readonly watched: PRReviewRouteDigestItem[]
  readonly escalated: PRReviewRouteDigestItem[]
  readonly recent: PRReviewRouteDigestItem[]
}

export type OperationsSnapshotCounts = {
  readonly goals: {
    readonly active: number
    readonly held: number
    readonly terminal: number
  }
  readonly loops: {
    readonly total: number
    readonly active: number
    readonly ready: number
    readonly held: number
    readonly disabled: number
    readonly noOp: number
    readonly stale: number
    readonly recoveryRequired: number
  }
  readonly runs: {
    readonly queued: number
    readonly running: number
    readonly blocked: number
    readonly complete: number
    readonly failed: number
  }
  readonly workers: {
    readonly queued: number
    readonly running: number
    readonly blocked: number
    readonly complete: number
    readonly failed: number
  }
  readonly gates: {
    readonly pendingReview: number
    readonly blocked: number
    readonly failed: number
    readonly passed: number
  }
  readonly discovery: {
    readonly topActionable: number
    readonly needsHuman: number
    readonly watch: number
    readonly noise: number
  }
  readonly budget: {
    readonly open: number
    readonly held: number
    readonly exhausted: number
  }
  readonly dependencies: {
    readonly released: number
    readonly blocked: number
  }
  readonly artifacts: {
    readonly reports: number
    readonly recent: number
  }
  readonly launchAttempts: {
    readonly active: number
    readonly failed: number
    readonly complete: number
    readonly collisionHolds: number
  }
}

export type OperationsSnapshotCompactHandle = {
  readonly id: string
  readonly kind: string
  readonly status?: string
  readonly summary: string
  readonly uri?: string
  readonly issueRef?: string
  readonly reason?: string
  readonly nextWakeAt?: number | null
}

export type OperationsSnapshotHandles = {
  readonly selectedLoop: OperationsSnapshotCompactHandle | null
  readonly activeOwnership: OperationsSnapshotCompactHandle[]
  readonly readyWork: OperationsSnapshotCompactHandle[]
  readonly heldLoops: OperationsSnapshotCompactHandle[]
  readonly staleWorkers: OperationsSnapshotCompactHandle[]
  readonly recoveryRequired: OperationsSnapshotCompactHandle[]
  readonly reviewGates: OperationsSnapshotCompactHandle[]
  readonly budgetHolds: OperationsSnapshotCompactHandle[]
  readonly dependencyReleases: OperationsSnapshotCompactHandle[]
  readonly recentArtifacts: OperationsSnapshotCompactHandle[]
}

export type OperationsSnapshot = {
  readonly id: OperationsSnapshotID
  readonly accountID: AccountID
  readonly snapshotKey: string
  readonly status: OperationsSnapshotStatus
  readonly summary: string
  readonly sourceHash: string
  readonly generatedAt: number
  readonly nextWakeAt: number | null
  readonly counts: OperationsSnapshotCounts
  readonly handles: OperationsSnapshotHandles
  readonly metadata: Record<string, unknown> | null
  readonly timeCreated: number
  readonly timeUpdated: number
}

export type PublishOperationsSnapshotInput = {
  readonly accountID: AccountID
  readonly snapshotKey?: string
  readonly now?: number
  readonly metadata?: Record<string, unknown>
}

export type PublishOperationsSnapshotResult = {
  readonly snapshot: OperationsSnapshot
  readonly changed: boolean
  readonly eventID: EventID | null
}

export type ArtifactRetentionDecision =
  | "keep"
  | "expire"
  | "supersede"
  | "hold-for-active-run"
  | "hold-for-gate"
  | "hold-for-dependency"

export type ArtifactRetentionPolicy =
  | { readonly mode: "keep" }
  | { readonly mode: "expire"; readonly expiresAt: number }
  | { readonly mode: "supersede"; readonly supersededByArtifactID?: ArtifactID }

export type DecisionStatus =
  | "draft"
  | "pending"
  | "accepted"
  | "rejected"
  | "superseded"
  | "needs-rework"
export type AdrDecisionStatus = DecisionStatus

export type ArtifactDecisionSummary = {
  readonly title: string | null
  readonly status: DecisionStatus
  readonly owner: string | null
  readonly reviewer: string | null
  readonly supersedesArtifactID: ArtifactID | null
  readonly supersededByArtifactID: ArtifactID | null
}

export type ArtifactIntegritySummary = {
  readonly status: ArtifactIntegrityStatus
  readonly checksum: string | null
  readonly checkedAt: number | null
  readonly uncheckedReason: string | null
  readonly expectedSizeBytes: number | null
  readonly actualChecksum: string | null
  readonly actualSizeBytes: number | null
}

export type { CreateGoalInput, CreateGoalResult, GoalLifecycle, GoalRunTree, GoalSummary, UpdateGoalStatusInput } from "./lightbulb/goal"
export type ArtifactLineageEdge = {
  readonly relation: ArtifactEdgeRelation
  readonly runID: RunID
  readonly workerID: WorkerID | null
  readonly summary: string
}

export type ArtifactSourceReferences = {
  readonly issueRef?: string
  readonly goalID?: GoalID
  readonly loopID?: LoopID
  readonly runID?: RunID
  readonly gateID?: GateID
}

export type ArtifactHandle = {
  readonly id: ArtifactID
  readonly type: ArtifactType
  readonly uri: string
  readonly summary: string
  readonly status: ArtifactStatus
  readonly integrity: ArtifactIntegritySummary
  readonly retentionPolicy: ArtifactRetentionPolicy
  readonly retentionDecision: ArtifactRetentionDecision
  readonly producerKind: ArtifactProducerKind
  readonly producerRunID: RunID | null
  readonly producerWorkerID: WorkerID | null
  readonly source: ArtifactSourceReferences
  readonly lineage: ArtifactLineageEdge[]
  readonly decision?: ArtifactDecisionSummary
}

export type RouteStopInput = { readonly kind: RouteStopKind; readonly title: string; readonly objective: string; readonly evidence: string; readonly metadata?: Record<string, unknown> }
export type PlanGoalRouteInput = { readonly goalID: GoalID; readonly destination: string; readonly summary?: string; readonly stops: readonly RouteStopInput[]; readonly metadata?: Record<string, unknown> }
export type SteerGoalRouteInput = { readonly routeID: RouteID; readonly reason: RouteSteerReason; readonly summary: string; readonly instruction?: string; readonly nextStopID?: RouteStopID; readonly metadata?: Record<string, unknown> }

export type GoalRoute = typeof LightbulbRouteTable.$inferSelect & {
  readonly currentStopID: RouteStopID | null
  readonly stops: (typeof LightbulbRouteStopTable.$inferSelect)[]
  readonly steers: (typeof LightbulbRouteSteerTable.$inferSelect)[]
}

export type AccountGraph = {
  readonly account: typeof LightbulbAccountTable.$inferSelect
  readonly goals: (typeof LightbulbGoalTable.$inferSelect)[]
  readonly loops: (typeof LightbulbLoopTable.$inferSelect)[]
  readonly runs: (typeof LightbulbRunTable.$inferSelect)[]
  readonly workers: (typeof LightbulbWorkerTable.$inferSelect)[]
  readonly taskPackets: (typeof LightbulbTaskPacketTable.$inferSelect)[]
  readonly workerLaunchAttempts: (typeof LightbulbWorkerLaunchAttemptTable.$inferSelect)[]
  readonly routes: (typeof LightbulbRouteTable.$inferSelect)[]
  readonly routeStops: (typeof LightbulbRouteStopTable.$inferSelect)[]
  readonly routeSteers: (typeof LightbulbRouteSteerTable.$inferSelect)[]
  readonly prReviewCandidates: (typeof LightbulbPRReviewCandidateTable.$inferSelect)[]
  readonly discoveryCandidates: (typeof LightbulbDiscoveryCandidateTable.$inferSelect)[]
  readonly operationsSnapshots: (typeof LightbulbOperationsSnapshotTable.$inferSelect)[]
  readonly issueMutationOutbox: (typeof LightbulbIssueMutationOutboxTable.$inferSelect)[]
  readonly prReviewRoutes: (typeof LightbulbPRReviewRouteTable.$inferSelect)[]
  readonly prReviewRouteWakes: (typeof LightbulbPRReviewRouteWakeTable.$inferSelect)[]
  readonly budgetUsage: (typeof LightbulbBudgetUsageTable.$inferSelect)[]
  readonly artifacts: (typeof LightbulbArtifactTable.$inferSelect)[]
  readonly artifactEdges: (typeof LightbulbArtifactEdgeTable.$inferSelect)[]
  readonly gates: (typeof LightbulbGateTable.$inferSelect)[]
  readonly events: (typeof LightbulbEventTable.$inferSelect)[]
}

export type SeededGraph = {
  readonly accountID: AccountID
  readonly goalID: GoalID
  readonly loopID: LoopID
  readonly runID: RunID
  readonly workerID: WorkerID
  readonly taskPacketID: TaskPacketID
  readonly launchAttemptID: WorkerLaunchAttemptID
  readonly artifactID: ArtifactID
  readonly gateID: GateID
}

export type ParentSummary = {
  readonly runID: RunID
  readonly status: RunStatus
  readonly reviewStatus: ReviewStatus
  readonly debugStatus: DebugStatus
  readonly gateStatus: GateStatus
  readonly summary: string
  readonly workers: {
    readonly id: WorkerID
    readonly role: string
    readonly status: WorkerStatus
    readonly summary: string
    readonly launchAttempts: WorkerLaunchAttemptHandle[]
  }[]
  readonly gates: {
    readonly id: GateID
    readonly kind: GateKind
    readonly status: GateStatus
    readonly summary: string
    readonly blockedReason: string | null
    readonly artifactID: ArtifactID | null
    readonly reviewGate?: ReviewGateReadModel
  }[]
  readonly artifacts: ArtifactHandle[]
  readonly decisionArtifacts: DecisionArtifactHandle[]
}

export type RegisterArtifactInput = {
  readonly artifactID?: ArtifactID
  readonly producerRunID: RunID
  readonly producerWorkerID: WorkerID
  readonly taskPacketID: TaskPacketID
  readonly type: ArtifactType
  readonly uri: string
  readonly summary: string
  readonly retentionPolicy: ArtifactRetentionPolicy
  readonly baseDirectory?: string
  readonly checksum?: string
  readonly sizeBytes?: number
  readonly uncheckedReason?: string
  readonly unresolvedDependencyIDs?: readonly string[]
  readonly metadata?: Record<string, unknown>
}

export type RegisterHarnessArtifactInput = {
  readonly artifactID?: ArtifactID
  readonly accountID: AccountID
  readonly producerKind: "harness"
  readonly type: ArtifactType
  readonly uri?: string
  readonly inlineContent?: string
  readonly summary: string
  readonly retentionPolicy: ArtifactRetentionPolicy
  readonly baseDirectory?: string
  readonly checksum?: string
  readonly sizeBytes?: number
  readonly uncheckedReason?: string
  readonly unresolvedDependencyIDs?: readonly string[]
  readonly source?: ArtifactSourceReferences
  readonly metadata?: Record<string, unknown>
}

export type ReadIssueArtifactsInput = {
  readonly accountID: AccountID
  readonly issueRef: string
  readonly type?: ArtifactType
}

export type RouteAdrDecisionArtifactInput = {
  readonly accountID: AccountID
  readonly issueRef: string
  readonly uri: string
  readonly summary: string
  readonly retentionPolicy?: ArtifactRetentionPolicy
  readonly baseDirectory?: string
  readonly checksum?: string
  readonly sizeBytes?: number
  readonly uncheckedReason?: string
  readonly unresolvedDependencyIDs?: readonly string[]
  readonly source?: Omit<ArtifactSourceReferences, "issueRef">
  readonly decisionTitle?: string
  readonly decisionStatus?: AdrDecisionStatus
  readonly decisionOwner?: string
  readonly decisionReviewer?: string
  readonly metadata?: Record<string, unknown>
}

export type Dashboard = {
  readonly account: {
    readonly id: AccountID
    readonly name: string
    readonly status: AccountStatus
  }
  readonly goals: DashboardGoal[]
  readonly readiness?: LoopReadinessAudit
  readonly inbox: {
    readonly taskPackets: {
      readonly id: TaskPacketID
      readonly workerID: WorkerID
      readonly title: string
      readonly status: TaskPacketStatus
    }[]
    readonly gates: DashboardGate[]
    readonly prReviewCandidates: PRReviewCandidateSummary[]
    readonly discoveryCandidates: DiscoveryCandidateInbox
    readonly prReviewRoutes: PRReviewRouteSummary[]
    readonly prReviewRouteDigest: PRReviewRouteDigest
  }
  readonly operations: {
    readonly schedulerTicks: DashboardSchedulerTick[]
    readonly snapshot: OperationsSnapshot | null
  }
  readonly artifactHandles: ArtifactHandle[]
}

export type DashboardGoal = {
  readonly id: GoalID
  readonly title: string
  readonly status: GoalStatus
  readonly summary: string
  readonly loops: DashboardLoop[]
}

export type DashboardLoop = {
  readonly id: LoopID
  readonly kind: LoopKind
  readonly status: LoopStatus
  readonly summary: string
  readonly profileID: string | null; readonly schedule: LoopScheduleReadModel["schedule"]; readonly budget: LoopScheduleReadModel["budget"]
  readonly scheduleClassification: LoopScheduleReadModel["classification"]; readonly scheduleReason: string | null
  readonly profile: LoopProfileCompactSummary | null
  readonly runs: DashboardRun[]
}

export type DashboardRun = {
  readonly id: RunID
  readonly status: RunStatus
  readonly reviewStatus: ReviewStatus
  readonly debugStatus: DebugStatus
  readonly gateStatus: GateStatus
  readonly summary: string
  readonly workers: {
    readonly id: WorkerID
    readonly role: string
    readonly status: WorkerStatus
    readonly summary: string
    readonly launchAttempts: WorkerLaunchAttemptHandle[]
  }[]
  readonly gates: DashboardGate[]
  readonly artifacts: ArtifactHandle[]
}

export type DashboardGate = {
  readonly id: GateID
  readonly kind: GateKind
  readonly status: GateStatus
  readonly summary: string
  readonly artifactID: ArtifactID | null
  readonly reviewGate?: ReviewGateReadModel
}

export type DashboardSchedulerTick = {
  readonly id: EventID
  readonly timeCreated: number
  readonly trigger: string
  readonly admittedCount: number
  readonly skippedCount: number
  readonly outcomeCount: number
  readonly source: Record<string, unknown> | null
  readonly outcomes: LoopSchedulerTickOutcome[]
}

export interface Interface {
  readonly createOrAdoptGoal: (input: CreateGoalInput) => Effect.Effect<CreateGoalResult>
  readonly readGoal: (goalID: GoalID) => Effect.Effect<GoalLifecycle | undefined>
  readonly updateGoalStatus: (input: UpdateGoalStatusInput) => Effect.Effect<GoalLifecycle>
  readonly bootstrapLoopProfiles: (input: LoopProfileBootstrapServiceInput) => Effect.Effect<LoopProfileBootstrapSummary>
  readonly admitLoopRun: (input: LoopRunAdmissionServiceInput) => Effect.Effect<LoopRunAdmissionResult>
  readonly superviseScheduledLoops: (input: SchedulerSupervisorServiceInput) => Effect.Effect<SchedulerSupervisorResult>
  readonly admitScheduledLoopRuns: (input: LoopSchedulerTickServiceInput) => Effect.Effect<LoopSchedulerTickResult>
  readonly runAccountLoopTick: (input: AccountLoopRunnerTickServiceInput) => Effect.Effect<AccountLoopRunnerTickResult>
  readonly launchWorker: (input: WorkerLaunchServiceInput) => Effect.Effect<WorkerLaunchResult>
  readonly ingestWorkerReport: (
    input: IngestWorkerReportServiceInput,
  ) => Effect.Effect<WorkerReportIngestionResult, WorkerReportRejected>
  readonly recordBudgetUsage: (
    input: BudgetUsageServiceInput,
  ) => Effect.Effect<BudgetUsageRecordResult, BudgetUsageRejected>
  readonly readLoopBudget: (input: {
    readonly accountID: AccountID
    readonly loopID: LoopID
    readonly now?: number
  }) => Effect.Effect<LoopBudgetReadModel | undefined>
  readonly readGoalRunTree: (goalID: GoalID) => Effect.Effect<GoalRunTree | undefined>
  readonly seedTracerBullet: (input?: {
    readonly accountName?: string
    readonly artifactUri?: string
    readonly artifactSummary?: string
    readonly rawWorkerLog?: string
  }) => Effect.Effect<SeededGraph>
  readonly registerArtifact: (input: RegisterArtifactInput) => Effect.Effect<ArtifactHandle, ArtifactRegistrationRejected>
  readonly planGoalRoute: (input: PlanGoalRouteInput) => Effect.Effect<GoalRoute>
  readonly steerGoalRoute: (input: SteerGoalRouteInput) => Effect.Effect<GoalRoute>
  readonly readGoalRoute: (routeID: RouteID) => Effect.Effect<GoalRoute | undefined>
  readonly registerHarnessArtifact: (input: RegisterHarnessArtifactInput) => Effect.Effect<ArtifactHandle, ArtifactRegistrationRejected>
  readonly routeAdrDecisionArtifact: (input: RouteAdrDecisionArtifactInput) => Effect.Effect<ArtifactHandle, ArtifactRegistrationRejected>
  readonly registerDecisionArtifact: (
    input: RegisterDecisionArtifactInput,
  ) => Effect.Effect<DecisionArtifactHandle, ArtifactRegistrationRejected>
  readonly transitionDecisionArtifact: (
    input: TransitionDecisionArtifactInput,
  ) => Effect.Effect<DecisionArtifactHandle, ArtifactRegistrationRejected>
  readonly classifyIssueRouting: (input: IssueRoutingInput) => Effect.Effect<IssueRoutingClassification>
  readonly ingestIssueQueueSnapshots: (input: { readonly snapshots: readonly IssueQueueSnapshot[] }) => Effect.Effect<IssueQueueIntakeResult>
  readonly projectDiscoveryInbox: (input: DiscoveryInboxProjectionInput) => Effect.Effect<DiscoveryInboxProjectionResult>
  readonly reconcileDependencyUnblocks: (
    input: DependencyUnblockReconciliationInput,
  ) => Effect.Effect<DependencyUnblockReconciliationResult>
  readonly planWorkerDispatch: (input: { readonly issues: readonly IssueRoutingInput[] }) => Effect.Effect<WorkerDispatchPlan>
  readonly discoverPRReviewCandidates: (
    input: PRReviewCandidateDiscoveryInput,
  ) => Effect.Effect<PRReviewCandidateDiscoveryResult>
  readonly admitPRReviewRoute: (input: PRReviewRouteAdmissionServiceInput) => Effect.Effect<PRReviewRouteAdmissionResult>
  readonly recordPRReviewRouteWake: (input: PRReviewRouteWakeServiceInput) => Effect.Effect<PRReviewRouteWakeResult>
  readonly readActivePRReviewRoutes: () => Effect.Effect<PRReviewRouteSummary[]>
  readonly readPRReviewRouteDigest: (input: PRReviewRouteDigestInput) => Effect.Effect<PRReviewRouteDigest>
  readonly assembleContextBundle: (
    input: ContextBundleAssemblyServiceInput,
  ) => Effect.Effect<ContextBundleAssemblyResult>
  readonly applyGatePolicy: (input: {
    readonly runID: RunID
    readonly workerID?: WorkerID
    readonly artifactID?: ArtifactID
    readonly policy: GatePolicyInput["thresholds"]
    readonly state: GatePolicyInput["state"]
  }) => Effect.Effect<GatePolicyTransition | undefined>
  readonly openReviewGate: (input: OpenReviewGateServiceInput) => Effect.Effect<ReviewGateHandle, ReviewGateRejected>
  readonly transitionReviewGate: (input: TransitionReviewGateServiceInput) => Effect.Effect<ReviewGateHandle, ReviewGateRejected>
  readonly readAccountGraph: (accountID: AccountID) => Effect.Effect<AccountGraph | undefined>
  readonly readLoopSchedules: (input: { readonly accountID: AccountID; readonly now?: number }) => Effect.Effect<LoopScheduleReadModel[]>
  readonly readLoopProfileSummaries: (input: { readonly accountID: AccountID; readonly goalID: GoalID }) => Effect.Effect<LoopProfileCompactSummary[]>
  readonly publishOperationsSnapshot: (input: PublishOperationsSnapshotInput) => Effect.Effect<PublishOperationsSnapshotResult>
  readonly readOperatorExport: (input: {
    readonly accountID: AccountID
    readonly now?: number
  }) => Effect.Effect<OperatorExport | undefined>
  readonly readLoopReadiness: (input: {
    readonly accountID: AccountID
    readonly now?: number
  }) => Effect.Effect<LoopReadinessAudit | undefined>
  readonly proposeIssueMutation: (input: IssueMutationProposalInput) => Effect.Effect<IssueMutationProposalResult>
  readonly readIssueMutationOutbox: (input: IssueMutationOutboxReadInput) => Effect.Effect<IssueMutationOutboxItem[]>
  readonly recordIssueMutationApplyResult: (
    input: IssueMutationApplyResultInput,
  ) => Effect.Effect<IssueMutationApplyRecordResult>
  readonly readDashboard: (accountID: AccountID) => Effect.Effect<Dashboard | undefined>
  readonly readLatestDashboard: () => Effect.Effect<Dashboard | undefined>
  readonly readIssueArtifacts: (input: ReadIssueArtifactsInput) => Effect.Effect<ArtifactHandle[]>
  readonly consumeArtifact: (input: {
    readonly artifactID: ArtifactID
    readonly consumerRunID: RunID
    readonly consumerWorkerID?: WorkerID
    readonly summary: string
  }) => Effect.Effect<void>
  readonly checkArtifact: (input: {
    readonly artifactID: ArtifactID
    readonly baseDirectory?: string
    readonly now?: number
  }) => Effect.Effect<ArtifactHandle | undefined>
  readonly applyArtifactRetention: (input: {
    readonly artifactID: ArtifactID
    readonly baseDirectory?: string
    readonly now?: number
  }) => Effect.Effect<ArtifactHandle | undefined>
  readonly parentSummary: (runID: RunID) => Effect.Effect<ParentSummary | undefined>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/Lightbulb") {}

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const { db } = yield* Database.Service

    return Service.of({
      createOrAdoptGoal: Effect.fn("Lightbulb.createOrAdoptGoal")(function* (input) {
        return yield* GoalLifecycleService.createOrAdopt(db, input, {
          account: AccountID.create,
          goal: GoalID.create,
          event: EventID.create,
        })
      }),
      readGoal: Effect.fn("Lightbulb.readGoal")(function* (goalID) {
        return yield* GoalLifecycleService.read(db, goalID)
      }),
      updateGoalStatus: Effect.fn("Lightbulb.updateGoalStatus")(function* (input) {
        return yield* GoalLifecycleService.updateStatus(db, input, { event: EventID.create })
      }),
      bootstrapLoopProfiles: Effect.fn("Lightbulb.bootstrapLoopProfiles")(function* (input) {
        return yield* bootstrapLoopProfiles({
          ...input,
          storage: databaseLoopProfileStorage(db, { event: EventID.create }),
        })
      }),
      admitLoopRun: Effect.fn("Lightbulb.admitLoopRun")(function* (input) {
        return yield* admitLoopRunInDb(db, { ...input, now: input.now ?? Date.now() }, { run: RunID.create, event: EventID.create })
      }),
      superviseScheduledLoops: Effect.fn("Lightbulb.superviseScheduledLoops")(function* (input) {
        return yield* superviseScheduledLoopsInDb(
          db,
          { ...input, now: input.now ?? Date.now() },
          { run: RunID.create, event: EventID.create },
        )
      }),
      admitScheduledLoopRuns: Effect.fn("Lightbulb.admitScheduledLoopRuns")(function* (input) {
        return yield* admitScheduledLoopRunsInDb(db, { ...input, now: input.now ?? Date.now() }, { run: RunID.create, event: EventID.create })
      }),
      runAccountLoopTick: Effect.fn("Lightbulb.runAccountLoopTick")(function* (input) {
        return yield* runAccountLoopTickInDb(db, { ...input, now: input.now ?? Date.now() }, {
          run: RunID.create,
          worker: WorkerID.create,
          taskPacket: TaskPacketID.create,
          launchAttempt: WorkerLaunchAttemptID.create,
          event: EventID.create,
        })
      }),
      launchWorker: Effect.fn("Lightbulb.launchWorker")(function* (input) {
        return yield* launchWorkerInDb(
          db,
          { ...input, now: input.now ?? Date.now() },
          { launchAttempt: WorkerLaunchAttemptID.create, event: EventID.create },
        )
      }),
      ingestWorkerReport: Effect.fn("Lightbulb.ingestWorkerReport")(function* (input) {
        return yield* ingestWorkerReportInDb(
          db,
          { ...input, now: input.now ?? Date.now() },
          { event: EventID.create, gate: GateID.create, usage: BudgetUsageID.create },
        )
      }),
      recordBudgetUsage: Effect.fn("Lightbulb.recordBudgetUsage")(function* (input) {
        return yield* recordBudgetUsageInDb(
          db,
          { ...input, now: input.now ?? Date.now() },
          { usage: BudgetUsageID.create },
        )
      }),
      readLoopBudget: Effect.fn("Lightbulb.readLoopBudget")(function* (input) {
        return yield* readLoopBudgetInDb(db, { ...input, now: input.now ?? Date.now() })
      }),
      readGoalRunTree: Effect.fn("Lightbulb.readGoalRunTree")(function* (goalID) {
        const goal = yield* db
          .select()
          .from(LightbulbGoalTable)
          .where(eq(LightbulbGoalTable.id, goalID))
          .get()
          .pipe(Effect.orDie)
        if (!goal) return
        const graph = yield* readAccountGraphFromDb(db, goal.account_id)
        if (!graph) return
        return toGoalRunTree(graph, goal)
      }),
      seedTracerBullet: Effect.fn("Lightbulb.seedTracerBullet")(function* (input) {
        const now = Date.now()
        const ids = {
          accountID: AccountID.create(),
          goalID: GoalID.create(),
          loopID: LoopID.create(),
          runID: RunID.create(),
          workerID: WorkerID.create(),
          taskPacketID: TaskPacketID.create(),
          launchAttemptID: WorkerLaunchAttemptID.create(),
          artifactID: ArtifactID.create(),
          gateID: GateID.create(),
        }
        yield* db
          .transaction((tx) =>
            Effect.gen(function* () {
              yield* tx
                .insert(LightbulbAccountTable)
                .values({
                  id: ids.accountID,
                  name: input?.accountName ?? "Lightbulb Bootstrap",
                  status: "active",
                  metadata: { tracer: true },
                })
                .run()
              yield* tx
                .insert(LightbulbGoalTable)
                .values({
                  id: ids.goalID,
                  account_id: ids.accountID,
                  title: "Bootstrap loop harness",
                  objective: "Create one durable Lightbulb goal graph.",
                  source_ref: "lightbulb:bootstrap-tracer-bullet",
                  status: "active",
                  summary: "Create one durable Lightbulb goal graph.",
                })
                .run()
              yield* tx
                .insert(LightbulbLoopTable)
                .values({
                  id: ids.loopID,
                  account_id: ids.accountID,
                  goal_id: ids.goalID,
                  kind: "implementation",
                  status: "active",
                  summary: "Implementation loop owns the tracer bullet run.",
                })
                .run()
              yield* tx
                .insert(LightbulbRunTable)
                .values({
                  id: ids.runID,
                  account_id: ids.accountID,
                  loop_id: ids.loopID,
                  status: "complete",
                  review_status: "requested",
                  debug_status: "fixed",
                  gate_status: "pending",
                  summary: "Worker produced a durable implementation report artifact.",
                  started_at: now,
                  completed_at: now,
                })
                .run()
              yield* tx
                .insert(LightbulbWorkerTable)
                .values({
                  id: ids.workerID,
                  account_id: ids.accountID,
                  run_id: ids.runID,
                  role: "bounded implementation worker",
                  status: "complete",
                  summary: "Implemented the schema tracer bullet and returned artifact handles.",
                  metadata: input?.rawWorkerLog ? { raw_log_omitted: true } : undefined,
                })
                .run()
              yield* tx
                .insert(LightbulbTaskPacketTable)
                .values({
                  id: ids.taskPacketID,
                  account_id: ids.accountID,
                  worker_id: ids.workerID,
                  title: "Implement stable-v0 operations snapshot feed",
                  status: "complete",
                  instructions: "Use the pickup packet for GitHub issue #33 and return a compact report artifact.",
                })
                .run()
              yield* tx
                .insert(LightbulbWorkerLaunchAttemptTable)
                .values({
                  id: ids.launchAttemptID,
                  account_id: ids.accountID,
                  run_id: ids.runID,
                  worker_id: ids.workerID,
                  task_packet_id: ids.taskPacketID,
                  active_key: null,
                  status: "complete",
                  trigger: "scheduler",
                  summary: "OpenCode-native worker launch completed for the stable-v0 tracer route.",
                  cwd: ".",
                  worktree_id: "lightbulb:bootstrap-tracer-bullet",
                  command: "lightbulb worker run --task-packet " + ids.taskPacketID,
                  profile_id: "opencode-native:bounded-implementation",
                  session_id: "lightbulb:seeded-session",
                  process_id: null,
                  heartbeat_uri: ".lightbulb/runs/schema-tracer-bullet.heartbeat.json",
                  log_uri: ".lightbulb/runs/schema-tracer-bullet.log",
                  report_uri: input?.artifactUri ?? ".lightbulb/runs/schema-tracer-bullet.md",
                  failure_reason: null,
                  metadata: {
                    issue_ref: "#33",
                    work_item_ref: "github:issue:33",
                    runtime: "opencode-native",
                    seed: "tracer_bullet",
                  },
                  time_created: now,
                  time_updated: now,
                })
                .run()
              yield* tx
                .insert(LightbulbArtifactTable)
                .values({
                  id: ids.artifactID,
                  account_id: ids.accountID,
                  producer_run_id: ids.runID,
                  producer_worker_id: ids.workerID,
                  task_packet_id: ids.taskPacketID,
                  producer_kind: "worker",
                  type: "report",
                  uri: input?.artifactUri ?? ".lightbulb/runs/schema-tracer-bullet.md",
                  checksum: null,
                  status: "registered",
                  summary: input?.artifactSummary ?? "Concise worker report for parent orchestration.",
                  metadata: {
                    integrity: {
                      checkedAt: now,
                      uncheckedReason: "tracer artifact content not checked",
                    },
                  },
                  retention_policy: "keep",
                })
                .run()
              yield* tx
                .insert(LightbulbArtifactEdgeTable)
                .values({
                  account_id: ids.accountID,
                  artifact_id: ids.artifactID,
                  consumer_run_id: ids.runID,
                  consumer_worker_id: ids.workerID,
                  relation: "produced_by",
                  summary: "Worker produced this artifact for parent review.",
                })
                .run()
              yield* tx
                .insert(LightbulbGateTable)
                .values({
                  id: ids.gateID,
                  account_id: ids.accountID,
                  run_id: ids.runID,
                  kind: "review",
                  status: "pending",
                  summary: "Parent review is pending against the report artifact.",
                  artifact_id: ids.artifactID,
                })
                .run()
              yield* tx
                .insert(LightbulbEventTable)
                .values({
                  id: EventID.create(),
                  account_id: ids.accountID,
                  aggregate_type: "run",
                  aggregate_id: ids.runID,
                  type: "lightbulb.tracer.seeded",
                  summary: "Seeded one Lightbulb account graph.",
                  data: { artifact_id: ids.artifactID },
                  time_created: now,
                })
                .run()
              yield* tx
                .insert(LightbulbEventTable)
                .values({
                  id: EventID.create(),
                  account_id: ids.accountID,
                  aggregate_type: "worker_launch_attempt",
                  aggregate_id: ids.launchAttemptID,
                  type: "lightbulb.worker_launch.completed",
                  summary: "Worker launch attempt completed for stable-v0 issue #33.",
                  data: {
                    account_id: ids.accountID,
                    goal_id: ids.goalID,
                    loop_id: ids.loopID,
                    run_id: ids.runID,
                    worker_id: ids.workerID,
                    task_packet_id: ids.taskPacketID,
                    issue_ref: "#33",
                    work_item_ref: "github:issue:33",
                    environment_summary: {
                      runtime: "opencode-native",
                      source: "seeded_tracer",
                    },
                    trigger: "scheduler",
                    attempt_id: ids.launchAttemptID,
                    status: "complete",
                    cwd: ".",
                    worktree_id: "lightbulb:bootstrap-tracer-bullet",
                    command: "lightbulb worker run --task-packet " + ids.taskPacketID,
                    profile_id: "opencode-native:bounded-implementation",
                    session_id: "lightbulb:seeded-session",
                    process_id: null,
                    heartbeat_uri: ".lightbulb/runs/schema-tracer-bullet.heartbeat.json",
                    log_uri: ".lightbulb/runs/schema-tracer-bullet.log",
                    report_uri: input?.artifactUri ?? ".lightbulb/runs/schema-tracer-bullet.md",
                    failure_reason: null,
                  },
                  time_created: now,
                })
                .run()
              yield* tx
                .insert(LightbulbEventTable)
                .values({
                  id: EventID.create(),
                  account_id: ids.accountID,
                  aggregate_type: "account",
                  aggregate_id: ids.accountID,
                  type: "lightbulb.scheduler_tick.completed",
                  summary: "Completed Lightbulb scheduler tick: 1 admitted, 0 skipped.",
                  data: {
                    account_id: ids.accountID,
                    trigger: "manual",
                    source: {
                      seed: "tracer_bullet",
                      issue_ref: "#33",
                      route: "stable_loop_v0_dogfood",
                    },
                    admitted_count: 1,
                    skipped_count: 0,
                    outcome_count: 1,
                    outcomes: [
                      {
                        loopID: ids.loopID,
                        profileID: null,
                        kind: "implementation",
                        outcome: "admitted",
                        runID: ids.runID,
                        eventID: null,
                        classification: "due",
                        reason: "seeded_dogfood_smoke",
                      },
                    ],
                  },
                  time_created: now,
                })
                .run()
            }),
          )
          .pipe(Effect.orDie)
        yield* projectDiscoveryInboxInDb(
          db,
          {
            accountID: ids.accountID,
            projectedAt: now,
            source: {
              seed: "tracer_bullet",
              route: "stable_loop_v0_dogfood",
            },
            issues: [
              {
                accountID: ids.accountID,
                number: 33,
                title: "Slice 24: loop operations snapshot feed",
                url: "https://github.com/heyimcarlos/lightbulb/issues/33",
                labels: ["ready-for-agent"],
                updatedAt: now,
                bodyHandle: "github:issue:33:body",
                bodySummary: "Operator surfaces need one compact feed for run, worker, gate, and wake state.",
                pickupPacket: createIssuePickupPacket({
                  issueRef: "#33",
                  issueHandle: "github:issue:33",
                  title: "Slice 24: loop operations snapshot feed",
                  url: "https://github.com/heyimcarlos/lightbulb/issues/33",
                  updatedAt: now,
                  bodyHandle: "github:issue:33:body",
                  bodySummary: "Operator surfaces need one compact feed for run, worker, gate, and wake state.",
                  promptHandle: "github:issue:33:prompt",
                  instructionHandle: "github:issue:33:body",
                }),
              },
            ],
          },
          { candidate: DiscoveryCandidateID.create, event: EventID.create },
        )
        return ids
      }),
      readAccountGraph: Effect.fn("Lightbulb.readAccountGraph")(function* (accountID) {
        return yield* readAccountGraphFromDb(db, accountID)
      }),
      readLoopSchedules: Effect.fn("Lightbulb.readLoopSchedules")(function* (input) {
        return yield* readLoopSchedulesInDb(db, { accountID: input.accountID, now: input.now ?? Date.now() })
      }),
      readLoopProfileSummaries: Effect.fn("Lightbulb.readLoopProfileSummaries")(function* (input) {
        return yield* readLoopProfileSummariesInDb(db, input)
      }),
      publishOperationsSnapshot: Effect.fn("Lightbulb.publishOperationsSnapshot")(function* (input) {
        const graph = yield* readAccountGraphFromDb(db, input.accountID)
        if (!graph) return yield* Effect.die(new Error("Lightbulb account not found: " + input.accountID))
        return yield* publishOperationsSnapshotInDb(
          db,
          input,
          graph,
          yield* readRecentSchedulerTicksFromDb(db, input.accountID),
          { snapshot: OperationsSnapshotID.create, event: EventID.create },
        )
      }),
      readOperatorExport: Effect.fn("Lightbulb.readOperatorExport")(function* (input) {
        const graph = yield* readAccountGraphFromDb(db, input.accountID)
        if (!graph) return
        return buildOperatorExport(graph, yield* readRecentSchedulerTicksFromDb(db, input.accountID), {
          now: input.now ?? Date.now(),
        })
      }),
      readLoopReadiness: Effect.fn("Lightbulb.readLoopReadiness")(function* (input) {
        const graph = yield* readAccountGraphFromDb(db, input.accountID)
        if (!graph) return
        const now = input.now ?? Date.now()
        const operatorExport = buildOperatorExport(graph, yield* readRecentSchedulerTicksFromDb(db, input.accountID), { now })
        return buildLoopReadinessAudit(graph, operatorExport, { now })
      }),
      proposeIssueMutation: Effect.fn("Lightbulb.proposeIssueMutation")(function* (input) {
        return yield* proposeIssueMutationInDb(
          db,
          { ...input, now: input.now ?? Date.now() },
          { mutation: IssueMutationID.create, event: EventID.create },
        )
      }),
      readIssueMutationOutbox: Effect.fn("Lightbulb.readIssueMutationOutbox")(function* (input) {
        return yield* readIssueMutationOutboxInDb(db, input)
      }),
      recordIssueMutationApplyResult: Effect.fn("Lightbulb.recordIssueMutationApplyResult")(function* (input) {
        return yield* recordIssueMutationApplyResultInDb(
          db,
          { ...input, appliedAt: input.appliedAt ?? Date.now() },
          { event: EventID.create },
        )
      }),
      discoverPRReviewCandidates: Effect.fn("Lightbulb.discoverPRReviewCandidates")(function* (input) {
        return yield* discoverPRReviewCandidatesInDb(db, input, {
          candidate: PRReviewCandidateID.create,
          event: EventID.create,
        })
      }),
      admitPRReviewRoute: Effect.fn("Lightbulb.admitPRReviewRoute")(function* (input) {
        return yield* admitPRReviewRouteInDb(db, input, {
          goal: GoalID.create,
          route: RouteID.create,
          stop: RouteStopID.create,
          wake: PRReviewRouteWakeID.create,
          event: EventID.create,
        })
      }),
      recordPRReviewRouteWake: Effect.fn("Lightbulb.recordPRReviewRouteWake")(function* (input) {
        return yield* recordPRReviewRouteWakeInDb(db, input, {
          wake: PRReviewRouteWakeID.create,
          event: EventID.create,
        })
      }),
      readActivePRReviewRoutes: Effect.fn("Lightbulb.readActivePRReviewRoutes")(function* () {
        return yield* readActivePRReviewRoutesInDb(db)
      }),
      readPRReviewRouteDigest: Effect.fn("Lightbulb.readPRReviewRouteDigest")(function* (input) {
        return yield* readPRReviewRouteDigestInDb(db, input)
      }),
      planGoalRoute: Effect.fn("Lightbulb.planGoalRoute")(function* (input) {
        return yield* planGoalRouteInDb(db, input, {
          route: RouteID.create,
          stop: RouteStopID.create,
          steer: RouteSteerID.create,
          event: EventID.create,
        })
      }),
      steerGoalRoute: Effect.fn("Lightbulb.steerGoalRoute")(function* (input) {
        return yield* steerGoalRouteInDb(db, input, {
          route: RouteID.create,
          stop: RouteStopID.create,
          steer: RouteSteerID.create,
          event: EventID.create,
        })
      }),
      readGoalRoute: Effect.fn("Lightbulb.readGoalRoute")(function* (routeID) {
        return yield* readGoalRouteFromDb(db, routeID)
      }),
      readDashboard: Effect.fn("Lightbulb.readDashboard")(function* (accountID) {
        return yield* readDashboardFromDb(db, accountID)
      }),
      readLatestDashboard: Effect.fn("Lightbulb.readLatestDashboard")(function* () {
        return yield* readLatestDashboardFromDb(db)
      }),
      readIssueArtifacts: Effect.fn("Lightbulb.readIssueArtifacts")(function* (input) {
        return yield* readIssueArtifactsInDb(db, input)
      }),
      registerArtifact: Effect.fn("Lightbulb.registerArtifact")(function* (input) {
        return yield* registerArtifactInDb(db, input)
      }),
      registerHarnessArtifact: Effect.fn("Lightbulb.registerHarnessArtifact")(function* (input) {
        return yield* registerHarnessArtifactInDb(db, input)
      }),
      routeAdrDecisionArtifact: Effect.fn("Lightbulb.routeAdrDecisionArtifact")(function* (input) {
        const decision = yield* registerDecisionArtifactInDb(db, {
          artifactID: ArtifactID.create(),
          accountID: input.accountID,
          type: "adr",
          title: input.decisionTitle,
          uri: input.uri,
          summary: input.summary,
          retentionPolicy: input.retentionPolicy ?? { mode: "keep" },
          baseDirectory: input.baseDirectory,
          checksum: input.checksum,
          sizeBytes: input.sizeBytes,
          uncheckedReason: input.uncheckedReason,
          unresolvedDependencyIDs: input.unresolvedDependencyIDs,
          source: {
            ...input.source,
            issueRef: input.issueRef,
          },
          decision: {
            status: input.decisionStatus ?? "accepted",
            owner: input.decisionOwner ?? "harness",
            reviewer:
              input.decisionReviewer ??
              (typeof input.metadata?.reviewer === "string" ? input.metadata.reviewer : "maintainer"),
          },
          metadata: {
            ...input.metadata,
            routing: {
              route: "adr_decision",
              issueRef: input.issueRef.trim(),
            },
          },
        })
        return decision
      }),
      registerDecisionArtifact: Effect.fn("Lightbulb.registerDecisionArtifact")(function* (input) {
        return yield* registerDecisionArtifactInDb(db, {
          ...input,
          artifactID: input.artifactID ?? ArtifactID.create(),
        })
      }),
      transitionDecisionArtifact: Effect.fn("Lightbulb.transitionDecisionArtifact")(function* (input) {
        return yield* transitionDecisionArtifactInDb(db, input)
      }),
      classifyIssueRouting: Effect.fn("Lightbulb.classifyIssueRouting")(function* (input) {
        return yield* classifyIssueRouting(db, input)
      }),
      ingestIssueQueueSnapshots: Effect.fn("Lightbulb.ingestIssueQueueSnapshots")(function* (input) {
        return ingestIssueQueueSnapshots(input)
      }),
      projectDiscoveryInbox: Effect.fn("Lightbulb.projectDiscoveryInbox")(function* (input) {
        return yield* projectDiscoveryInboxInDb(
          db,
          { ...input, projectedAt: input.projectedAt ?? Date.now() },
          { candidate: DiscoveryCandidateID.create, event: EventID.create },
        )
      }),
      reconcileDependencyUnblocks: Effect.fn("Lightbulb.reconcileDependencyUnblocks")(function* (input) {
        return reconcileDependencyUnblocks(input)
      }),
      planWorkerDispatch: Effect.fn("Lightbulb.planWorkerDispatch")(function* (input) {
        return yield* planWorkerDispatch(db, input)
      }),
      assembleContextBundle: Effect.fn("Lightbulb.assembleContextBundle")(function* (input) {
        return yield* assembleContextBundle({
          ...input,
          now: input.now ?? Date.now(),
          storage: databaseContextBundleStorage(db),
        })
      }),
      applyGatePolicy: Effect.fn("Lightbulb.applyGatePolicy")(function* (input) {
        return yield* applyGatePolicyInDb(db, input, GateID.create)
      }),
      openReviewGate: Effect.fn("Lightbulb.openReviewGate")(function* (input) {
        return yield* openReviewGateInDb(db, { ...input, now: input.now ?? Date.now() }, { gate: GateID.create, event: EventID.create })
      }),
      transitionReviewGate: Effect.fn("Lightbulb.transitionReviewGate")(function* (input) {
        return yield* transitionReviewGateInDb(db, { ...input, now: input.now ?? Date.now() }, { event: EventID.create })
      }),
      checkArtifact: Effect.fn("Lightbulb.checkArtifact")(function* (input) {
        return yield* readArtifactHandle(db, {
          artifactID: input.artifactID,
          baseDirectory: input.baseDirectory,
          now: input.now ?? Date.now(),
          liveCheck: true,
        })
      }),
      applyArtifactRetention: Effect.fn("Lightbulb.applyArtifactRetention")(function* (input) {
        const now = input.now ?? Date.now()
        const artifact = yield* readArtifactHandle(db, {
          artifactID: input.artifactID,
          baseDirectory: input.baseDirectory,
          now,
          liveCheck: true,
        })
        if (!artifact) return

        const status = statusForRetentionDecision(artifact.retentionDecision)
        if (status) {
          yield* db
            .update(LightbulbArtifactTable)
            .set({ status })
            .where(eq(LightbulbArtifactTable.id, input.artifactID))
            .run()
            .pipe(Effect.orDie)
        }
        return yield* readArtifactHandle(db, {
          artifactID: input.artifactID,
          baseDirectory: input.baseDirectory,
          now,
          liveCheck: true,
        })
      }),
      consumeArtifact: Effect.fn("Lightbulb.consumeArtifact")(function* (input) {
        yield* db
          .transaction((tx) =>
            Effect.gen(function* () {
              const artifact = yield* tx
                .select({ account_id: LightbulbArtifactTable.account_id })
                .from(LightbulbArtifactTable)
                .where(eq(LightbulbArtifactTable.id, input.artifactID))
                .get()
              if (!artifact) return yield* Effect.die(new Error("Lightbulb artifact not found"))
              yield* tx
                .insert(LightbulbArtifactEdgeTable)
                .values({
                  account_id: artifact.account_id,
                  artifact_id: input.artifactID,
                  consumer_run_id: input.consumerRunID,
                  consumer_worker_id: input.consumerWorkerID,
                  relation: "consumed_by",
                  summary: input.summary,
                })
                .run()
              yield* tx
                .update(LightbulbArtifactTable)
                .set({ status: "consumed" })
                .where(eq(LightbulbArtifactTable.id, input.artifactID))
                .run()
            }),
          )
          .pipe(Effect.orDie)
      }),
      parentSummary: Effect.fn("Lightbulb.parentSummary")(function* (runID) {
        const run = yield* db
          .select()
          .from(LightbulbRunTable)
          .where(eq(LightbulbRunTable.id, runID))
          .get()
          .pipe(Effect.orDie)
        if (!run) return
        const workers = yield* db
          .select()
          .from(LightbulbWorkerTable)
          .where(eq(LightbulbWorkerTable.run_id, runID))
          .orderBy(asc(LightbulbWorkerTable.time_created))
          .all()
          .pipe(Effect.orDie)
        const launchAttempts = yield* db
          .select()
          .from(LightbulbWorkerLaunchAttemptTable)
          .where(eq(LightbulbWorkerLaunchAttemptTable.run_id, runID))
          .orderBy(asc(LightbulbWorkerLaunchAttemptTable.time_created))
          .all()
          .pipe(Effect.orDie)
        const gates = yield* db
          .select()
          .from(LightbulbGateTable)
          .where(eq(LightbulbGateTable.run_id, runID))
          .orderBy(asc(LightbulbGateTable.time_created))
          .all()
          .pipe(Effect.orDie)
        const artifacts = yield* db
          .select()
          .from(LightbulbArtifactTable)
          .where(
            or(
              eq(LightbulbArtifactTable.producer_run_id, runID),
              and(eq(LightbulbArtifactTable.source_run_id, runID), eq(LightbulbArtifactTable.account_id, run.account_id)),
            ),
          )
          .orderBy(asc(LightbulbArtifactTable.time_created))
          .all()
          .pipe(Effect.orDie)
        const now = Date.now()
        const artifactHandles = yield* Effect.all(
          artifacts.map((artifact) =>
            readArtifactHandle(db, {
              artifactID: artifact.id,
              now,
              liveCheck: false,
            }),
          ),
        )

        return {
          runID: run.id,
          status: run.status,
          reviewStatus: run.review_status,
          debugStatus: run.debug_status,
          gateStatus: run.gate_status,
          summary: run.summary,
          workers: workers.map((worker) => ({
            id: worker.id,
            role: worker.role,
            status: worker.status,
            summary: worker.summary,
            launchAttempts: launchAttempts
              .filter((attempt) => attempt.worker_id === worker.id)
              .map(toWorkerLaunchAttemptHandle),
          })),
          gates: gates.map((gate) => {
            const reviewGate = toReviewGateReadModel(gate)
            return {
              id: gate.id,
              kind: gate.kind,
              status: gate.status,
              summary: gate.summary,
              blockedReason: gateBlockedReason(gate),
              artifactID: gate.artifact_id,
              ...(reviewGate ? { reviewGate } : {}),
            }
          }),
          artifacts: artifactHandles.filter((artifact): artifact is ArtifactHandle => artifact !== undefined),
          decisionArtifacts: artifactHandles
            .map((artifact) => (artifact ? toDecisionArtifactHandle(artifact) : undefined))
            .filter((artifact): artifact is DecisionArtifactHandle => artifact !== undefined)
        }
      }),
    })
  }),
)

export const defaultLayer = layer.pipe(Layer.provide(Database.defaultLayer))
export const node = LayerNode.make(layer, [Database.node])

function readLatestDashboardFromDb(db: Database.Interface["db"]) {
  return Effect.gen(function* () {
    const account = yield* db
      .select()
      .from(LightbulbAccountTable)
      .orderBy(
        desc(LightbulbAccountTable.time_updated),
        desc(LightbulbAccountTable.time_created),
        desc(LightbulbAccountTable.id),
      )
      .get()
      .pipe(Effect.orDie)
    if (!account) return
    return yield* readDashboardFromDb(db, account.id)
  })
}

function readDashboardFromDb(db: Database.Interface["db"], accountID: AccountID) {
  return Effect.gen(function* () {
    const graph = yield* readAccountGraphFromDb(db, accountID, { events: "none" })
    if (!graph) return
    const schedulerTicks = yield* readRecentSchedulerTicksFromDb(db, accountID)
    const now = Date.now()
    const operatorExport = buildOperatorExport(graph, schedulerTicks, { now })
    return toDashboard(graph, schedulerTicks, buildLoopReadinessAudit(graph, operatorExport, { now }))
  })
}

function readAccountGraphFromDb(
  db: Database.Interface["db"],
  accountID: AccountID,
  options?: { readonly events?: "all" | "none" },
) {
  return Effect.gen(function* () {
    const account = yield* db
      .select()
      .from(LightbulbAccountTable)
      .where(eq(LightbulbAccountTable.id, accountID))
      .get()
      .pipe(Effect.orDie)
    if (!account) return
    return {
      account,
      goals: yield* db
        .select()
        .from(LightbulbGoalTable)
        .where(eq(LightbulbGoalTable.account_id, accountID))
        .orderBy(asc(LightbulbGoalTable.time_created))
        .all()
        .pipe(Effect.orDie),
      loops: yield* db
        .select()
        .from(LightbulbLoopTable)
        .where(eq(LightbulbLoopTable.account_id, accountID))
        .orderBy(asc(LightbulbLoopTable.time_created))
        .all()
        .pipe(Effect.orDie),
      runs: yield* db
        .select()
        .from(LightbulbRunTable)
        .where(eq(LightbulbRunTable.account_id, accountID))
        .orderBy(asc(LightbulbRunTable.time_created))
        .all()
        .pipe(Effect.orDie),
      workers: yield* db
        .select()
        .from(LightbulbWorkerTable)
        .where(eq(LightbulbWorkerTable.account_id, accountID))
        .orderBy(asc(LightbulbWorkerTable.time_created))
        .all()
        .pipe(Effect.orDie),
      taskPackets: yield* db
        .select()
        .from(LightbulbTaskPacketTable)
        .where(eq(LightbulbTaskPacketTable.account_id, accountID))
        .orderBy(asc(LightbulbTaskPacketTable.time_created))
        .all()
        .pipe(Effect.orDie),
      workerLaunchAttempts: yield* db
        .select()
        .from(LightbulbWorkerLaunchAttemptTable)
        .where(eq(LightbulbWorkerLaunchAttemptTable.account_id, accountID))
        .orderBy(asc(LightbulbWorkerLaunchAttemptTable.time_created))
        .all()
        .pipe(Effect.orDie),
      routes: yield* db
        .select()
        .from(LightbulbRouteTable)
        .where(eq(LightbulbRouteTable.account_id, accountID))
        .orderBy(asc(LightbulbRouteTable.time_created))
        .all()
        .pipe(Effect.orDie),
      routeStops: yield* db
        .select()
        .from(LightbulbRouteStopTable)
        .where(eq(LightbulbRouteStopTable.account_id, accountID))
        .orderBy(asc(LightbulbRouteStopTable.sequence))
        .all()
        .pipe(Effect.orDie),
      routeSteers: yield* db
        .select()
        .from(LightbulbRouteSteerTable)
        .where(eq(LightbulbRouteSteerTable.account_id, accountID))
        .orderBy(asc(LightbulbRouteSteerTable.time_created))
        .all()
        .pipe(Effect.orDie),
      prReviewCandidates: yield* db
        .select()
        .from(LightbulbPRReviewCandidateTable)
        .where(eq(LightbulbPRReviewCandidateTable.account_id, accountID))
        .orderBy(asc(LightbulbPRReviewCandidateTable.repository), asc(LightbulbPRReviewCandidateTable.pr_number))
        .all()
        .pipe(Effect.orDie),
      discoveryCandidates: yield* db
        .select()
        .from(LightbulbDiscoveryCandidateTable)
        .where(eq(LightbulbDiscoveryCandidateTable.account_id, accountID))
        .orderBy(
          asc(LightbulbDiscoveryCandidateTable.section),
          desc(LightbulbDiscoveryCandidateTable.score),
          asc(LightbulbDiscoveryCandidateTable.source_id),
        )
        .all()
        .pipe(Effect.orDie),
      operationsSnapshots: yield* db
        .select()
        .from(LightbulbOperationsSnapshotTable)
        .where(eq(LightbulbOperationsSnapshotTable.account_id, accountID))
        .orderBy(desc(LightbulbOperationsSnapshotTable.time_updated))
        .all()
        .pipe(Effect.orDie),
      issueMutationOutbox: yield* db
        .select()
        .from(LightbulbIssueMutationOutboxTable)
        .where(eq(LightbulbIssueMutationOutboxTable.account_id, accountID))
        .orderBy(asc(LightbulbIssueMutationOutboxTable.time_created))
        .all()
        .pipe(Effect.orDie),
      prReviewRoutes: yield* db
        .select()
        .from(LightbulbPRReviewRouteTable)
        .where(eq(LightbulbPRReviewRouteTable.account_id, accountID))
        .orderBy(asc(LightbulbPRReviewRouteTable.repository), asc(LightbulbPRReviewRouteTable.pr_number))
        .all()
        .pipe(Effect.orDie),
      prReviewRouteWakes: yield* db
        .select()
        .from(LightbulbPRReviewRouteWakeTable)
        .where(eq(LightbulbPRReviewRouteWakeTable.account_id, accountID))
        .orderBy(asc(LightbulbPRReviewRouteWakeTable.time_created))
        .all()
        .pipe(Effect.orDie),
      budgetUsage: yield* db
        .select()
        .from(LightbulbBudgetUsageTable)
        .where(eq(LightbulbBudgetUsageTable.account_id, accountID))
        .orderBy(asc(LightbulbBudgetUsageTable.usage_at))
        .all()
        .pipe(Effect.orDie),
      artifacts: yield* db
        .select()
        .from(LightbulbArtifactTable)
        .where(eq(LightbulbArtifactTable.account_id, accountID))
        .orderBy(asc(LightbulbArtifactTable.time_created))
        .all()
        .pipe(Effect.orDie),
      artifactEdges: yield* db
        .select()
        .from(LightbulbArtifactEdgeTable)
        .innerJoin(LightbulbArtifactTable, eq(LightbulbArtifactEdgeTable.artifact_id, LightbulbArtifactTable.id))
        .where(eq(LightbulbArtifactTable.account_id, accountID))
        .orderBy(asc(LightbulbArtifactEdgeTable.time_created))
        .all()
        .pipe(Effect.orDie)
        .pipe(Effect.map((rows) => rows.map((row) => row.lightbulb_artifact_edge))),
      gates: yield* db
        .select()
        .from(LightbulbGateTable)
        .where(eq(LightbulbGateTable.account_id, accountID))
        .orderBy(asc(LightbulbGateTable.time_created))
        .all()
        .pipe(Effect.orDie),
      events: yield* readAccountEventsFromDb(db, accountID, options?.events ?? "all"),
    }
  })
}

function readAccountEventsFromDb(db: Database.Interface["db"], accountID: AccountID, mode: "all" | "none") {
  if (mode === "none") return Effect.succeed([])
  return db
    .select()
    .from(LightbulbEventTable)
    .where(eq(LightbulbEventTable.account_id, accountID))
    .orderBy(asc(LightbulbEventTable.time_created))
    .all()
    .pipe(Effect.orDie)
}

function readRecentSchedulerTicksFromDb(db: Database.Interface["db"], accountID: AccountID) {
  return db
    .select()
    .from(LightbulbEventTable)
    .where(
      and(eq(LightbulbEventTable.account_id, accountID), eq(LightbulbEventTable.type, "lightbulb.scheduler_tick.completed")),
    )
    .orderBy(desc(LightbulbEventTable.time_created))
    .limit(5)
    .all()
    .pipe(Effect.orDie)
}
