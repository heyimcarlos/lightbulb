export * as Lightbulb from "./lightbulb"
export { ArtifactRegistrationRejected } from "./lightbulb/artifact-registration"
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
export * from "./lightbulb/loop-profile"

import { and, asc, eq, or } from "drizzle-orm"
import { Context, Effect, Layer, Schema } from "effect"
import { Database } from "./database/database"
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
import { toDashboard, toGoalRunTree } from "./lightbulb/dashboard"
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
  LightbulbAccountTable,
  LightbulbArtifactEdgeTable,
  LightbulbArtifactTable,
  LightbulbEventTable,
  LightbulbGateTable,
  LightbulbGoalTable,
  LightbulbLoopTable,
  LightbulbRouteSteerTable,
  LightbulbRouteStopTable,
  LightbulbRouteTable,
  LightbulbRunTable,
  LightbulbTaskPacketTable,
  LightbulbWorkerTable,
} from "./lightbulb/sql"
import { bootstrapLoopProfiles, databaseLoopProfileStorage, type LoopProfileBootstrapServiceInput, type LoopProfileBootstrapSummary } from "./lightbulb/loop-profile"

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
export const ArtifactID = prefixedID("lbartifact", "Lightbulb.ArtifactID")
export type ArtifactID = typeof ArtifactID.Type
export const GateID = prefixedID("lbgate", "Lightbulb.GateID")
export type GateID = typeof GateID.Type
export const EventID = prefixedID("lbevent", "Lightbulb.EventID")
export type EventID = typeof EventID.Type
export const RouteID = prefixedID("lbroute", "Lightbulb.RouteID"); export type RouteID = typeof RouteID.Type
export const RouteStopID = prefixedID("lbstop", "Lightbulb.RouteStopID"); export type RouteStopID = typeof RouteStopID.Type
export const RouteSteerID = prefixedID("lbsteer", "Lightbulb.RouteSteerID"); export type RouteSteerID = typeof RouteSteerID.Type

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
export type ArtifactStatus = "registered" | "consumed" | "superseded" | "expired"
export type ArtifactEdgeRelation = "produced_by" | "consumed_by" | "supersedes" | "verifies"
export type ArtifactProducerKind = "worker" | "harness"
export type GateKind = "review" | "debug" | "verification"
export type ArtifactIntegrityStatus = "verified" | "changed" | "missing" | "unchecked"
export type RouteStatus = "active" | "rerouting" | "arrived" | "blocked" | "cancelled"
export type RouteStopKind = "discovery" | "implementation" | "debug" | "review" | "integration" | "verification" | "decision" | "cleanup"
export type RouteStopStatus = "pending" | "active" | "complete" | "blocked" | "skipped"
export type RouteSteerReason = "user" | "blocker" | "failed_gate" | "new_evidence" | "schedule" | "system"

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
  readonly routes: (typeof LightbulbRouteTable.$inferSelect)[]
  readonly routeStops: (typeof LightbulbRouteStopTable.$inferSelect)[]
  readonly routeSteers: (typeof LightbulbRouteSteerTable.$inferSelect)[]
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
  }[]
  readonly gates: {
    readonly id: GateID
    readonly kind: GateKind
    readonly status: GateStatus
    readonly summary: string
    readonly artifactID: ArtifactID | null
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
  readonly inbox: {
    readonly taskPackets: {
      readonly id: TaskPacketID
      readonly workerID: WorkerID
      readonly title: string
      readonly status: TaskPacketStatus
    }[]
    readonly gates: DashboardGate[]
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
}

export interface Interface {
  readonly createOrAdoptGoal: (input: CreateGoalInput) => Effect.Effect<CreateGoalResult>
  readonly readGoal: (goalID: GoalID) => Effect.Effect<GoalLifecycle | undefined>
  readonly updateGoalStatus: (input: UpdateGoalStatusInput) => Effect.Effect<GoalLifecycle>
  readonly bootstrapLoopProfiles: (
    input: LoopProfileBootstrapServiceInput,
  ) => Effect.Effect<LoopProfileBootstrapSummary>
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
  readonly registerHarnessArtifact: (
    input: RegisterHarnessArtifactInput,
  ) => Effect.Effect<ArtifactHandle, ArtifactRegistrationRejected>
  readonly routeAdrDecisionArtifact: (
    input: RouteAdrDecisionArtifactInput,
  ) => Effect.Effect<ArtifactHandle, ArtifactRegistrationRejected>
  readonly registerDecisionArtifact: (
    input: RegisterDecisionArtifactInput,
  ) => Effect.Effect<DecisionArtifactHandle, ArtifactRegistrationRejected>
  readonly transitionDecisionArtifact: (
    input: TransitionDecisionArtifactInput,
  ) => Effect.Effect<DecisionArtifactHandle, ArtifactRegistrationRejected>
  readonly classifyIssueRouting: (input: IssueRoutingInput) => Effect.Effect<IssueRoutingClassification>
  readonly planWorkerDispatch: (input: { readonly issues: readonly IssueRoutingInput[] }) => Effect.Effect<WorkerDispatchPlan>
  readonly readAccountGraph: (accountID: AccountID) => Effect.Effect<AccountGraph | undefined>
  readonly readDashboard: (accountID: AccountID) => Effect.Effect<Dashboard | undefined>
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
                  title: "Implement schema tracer bullet",
                  status: "complete",
                  instructions: "Create and verify one account goal to artifact graph.",
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
            }),
          )
          .pipe(Effect.orDie)
        return ids
      }),
      readAccountGraph: Effect.fn("Lightbulb.readAccountGraph")(function* (accountID) {
        return yield* readAccountGraphFromDb(db, accountID)
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
        const graph = yield* readAccountGraphFromDb(db, accountID)
        if (!graph) return
        return toDashboard(graph)
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
      planWorkerDispatch: Effect.fn("Lightbulb.planWorkerDispatch")(function* (input) {
        return yield* planWorkerDispatch(db, input)
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
          })),
          gates: gates.map((gate) => ({
            id: gate.id,
            kind: gate.kind,
            status: gate.status,
            summary: gate.summary,
            artifactID: gate.artifact_id,
          })),
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

function readAccountGraphFromDb(db: Database.Interface["db"], accountID: AccountID) {
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
      events: yield* db
        .select()
        .from(LightbulbEventTable)
        .where(eq(LightbulbEventTable.account_id, accountID))
        .orderBy(asc(LightbulbEventTable.time_created))
        .all()
        .pipe(Effect.orDie),
    }
  })
}
