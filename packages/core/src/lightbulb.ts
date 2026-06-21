export * as Lightbulb from "./lightbulb"

import { and, asc, eq } from "drizzle-orm"
import { Context, Effect, Layer, Schema } from "effect"
import { Database } from "./database/database"
import { withStatics } from "./schema"
import { Identifier } from "./util/identifier"
import {
  LightbulbAccountTable,
  LightbulbArtifactEdgeTable,
  LightbulbArtifactTable,
  LightbulbEventTable,
  LightbulbGateTable,
  LightbulbGoalTable,
  LightbulbLoopTable,
  LightbulbRunTable,
  LightbulbTaskPacketTable,
  LightbulbWorkerTable,
} from "./lightbulb/sql"

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

export type AccountStatus = "active" | "paused" | "archived"
export type GoalStatus = "active" | "held" | "completed" | "cancelled" | "stopped"
export type LoopKind = "discovery" | "implementation" | "debug" | "review" | "integration"
export type LoopStatus = "active" | "idle" | "blocked" | "complete"
export type RunStatus = "queued" | "running" | "blocked" | "complete" | "failed"
export type ReviewStatus = "not_requested" | "requested" | "changes_requested" | "approved"
export type DebugStatus = "not_started" | "reproducing" | "isolating" | "fixed" | "blocked"
export type GateStatus = "pending" | "running" | "passed" | "failed" | "blocked"
export type WorkerStatus = "queued" | "running" | "blocked" | "complete" | "failed"
export type TaskPacketStatus = "ready" | "claimed" | "complete" | "blocked"
export type ArtifactType = "report" | "plan" | "patch" | "test_result" | "handoff" | "log"
export type ArtifactStatus = "registered" | "consumed" | "superseded" | "expired"
export type ArtifactEdgeRelation = "produced_by" | "consumed_by" | "supersedes" | "verifies"
export type GateKind = "review" | "debug" | "verification"

export type GoalLifecycle = typeof LightbulbGoalTable.$inferSelect

export type CreateGoalInput = {
  readonly accountID?: AccountID
  readonly accountName?: string
  readonly goalID?: GoalID
  readonly title: string
  readonly objective: string
  readonly sourceRef?: string
  readonly ownerID?: string
  readonly summary?: string
  readonly metadata?: Record<string, unknown>
}

export type CreateGoalResult = {
  readonly goal: GoalLifecycle
  readonly adopted: boolean
}

export type UpdateGoalStatusInput = {
  readonly goalID: GoalID
  readonly status: GoalStatus
  readonly reason?: string
}

export type GoalSummary = {
  readonly id: GoalID
  readonly title: string
  readonly objective: string
  readonly sourceRef: string | null
  readonly ownerID: string | null
  readonly status: GoalStatus
  readonly summary: string
  readonly holdReason: string | null
  readonly completionReason: string | null
  readonly completedAt: number | null
  readonly timeCreated: number
  readonly timeUpdated: number
}

export type GoalRunTree = {
  readonly goal: GoalSummary
  readonly loops: DashboardLoop[]
  readonly taskPackets: {
    readonly id: TaskPacketID
    readonly workerID: WorkerID
    readonly title: string
    readonly status: TaskPacketStatus
  }[]
  readonly gates: DashboardGate[]
  readonly artifactHandles: ArtifactHandle[]
}

export type ArtifactLineageEdge = {
  readonly relation: ArtifactEdgeRelation
  readonly runID: RunID
  readonly workerID: WorkerID | null
  readonly summary: string
}

export type ArtifactHandle = {
  readonly id: ArtifactID
  readonly type: ArtifactType
  readonly uri: string
  readonly summary: string
  readonly status: ArtifactStatus
  readonly producerRunID: RunID
  readonly producerWorkerID: WorkerID
  readonly lineage: ArtifactLineageEdge[]
}

export type AccountGraph = {
  readonly account: typeof LightbulbAccountTable.$inferSelect
  readonly goals: (typeof LightbulbGoalTable.$inferSelect)[]
  readonly loops: (typeof LightbulbLoopTable.$inferSelect)[]
  readonly runs: (typeof LightbulbRunTable.$inferSelect)[]
  readonly workers: (typeof LightbulbWorkerTable.$inferSelect)[]
  readonly taskPackets: (typeof LightbulbTaskPacketTable.$inferSelect)[]
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
}

export type RegisterArtifactInput = {
  readonly producerRunID: RunID
  readonly producerWorkerID: WorkerID
  readonly taskPacketID: TaskPacketID
  readonly type: ArtifactType
  readonly uri: string
  readonly checksum?: string | null
  readonly summary: string
  readonly metadata?: Record<string, unknown>
  readonly retentionPolicy?: string
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
  readonly readGoalRunTree: (goalID: GoalID) => Effect.Effect<GoalRunTree | undefined>
  readonly seedTracerBullet: (input?: {
    readonly accountName?: string
    readonly artifactUri?: string
    readonly artifactSummary?: string
    readonly rawWorkerLog?: string
  }) => Effect.Effect<SeededGraph>
  readonly registerArtifact: (input: RegisterArtifactInput) => Effect.Effect<ArtifactHandle>
  readonly readAccountGraph: (accountID: AccountID) => Effect.Effect<AccountGraph | undefined>
  readonly readDashboard: (accountID: AccountID) => Effect.Effect<Dashboard | undefined>
  readonly consumeArtifact: (input: {
    readonly artifactID: ArtifactID
    readonly consumerRunID: RunID
    readonly consumerWorkerID?: WorkerID
    readonly summary: string
  }) => Effect.Effect<void>
  readonly parentSummary: (runID: RunID) => Effect.Effect<ParentSummary | undefined>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/Lightbulb") {}

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const { db } = yield* Database.Service

    return Service.of({
      createOrAdoptGoal: Effect.fn("Lightbulb.createOrAdoptGoal")(function* (input) {
        const goalID = input.goalID ?? GoalID.create()
        return yield* db
          .transaction((tx) =>
            Effect.gen(function* () {
              if (input.goalID) {
                const existing = yield* tx
                  .select()
                  .from(LightbulbGoalTable)
                  .where(eq(LightbulbGoalTable.id, input.goalID))
                  .get()
                if (existing) return { goal: existing, adopted: true }
              }
              if (input.sourceRef) {
                const existing = yield* tx
                  .select()
                  .from(LightbulbGoalTable)
                  .where(
                    input.accountID
                      ? and(
                          eq(LightbulbGoalTable.account_id, input.accountID),
                          eq(LightbulbGoalTable.source_ref, input.sourceRef),
                        )
                      : eq(LightbulbGoalTable.source_ref, input.sourceRef),
                  )
                  .get()
                if (existing) return { goal: existing, adopted: true }
              }
              const accountID = input.accountID ?? AccountID.create()
              yield* tx
                .insert(LightbulbAccountTable)
                .values({
                  id: accountID,
                  name: input.accountName ?? "Lightbulb Account",
                  status: "active",
                  metadata: input.ownerID ? { owner_id: input.ownerID } : undefined,
                })
                .onConflictDoNothing()
                .run()
              yield* tx
                .insert(LightbulbGoalTable)
                .values({
                  id: goalID,
                  account_id: accountID,
                  title: input.title,
                  objective: input.objective,
                  source_ref: input.sourceRef ?? null,
                  owner_id: input.ownerID ?? null,
                  status: "active",
                  summary: input.summary ?? input.objective,
                  metadata: input.metadata,
                })
                .run()
              yield* tx
                .insert(LightbulbEventTable)
                .values({
                  id: EventID.create(),
                  account_id: accountID,
                  aggregate_type: "goal",
                  aggregate_id: goalID,
                  type: "lightbulb.goal.created",
                  summary: "Created durable Lightbulb goal.",
                  data: { source_ref: input.sourceRef ?? null, owner_id: input.ownerID ?? null },
                  time_created: Date.now(),
                })
                .run()
              const goal = yield* tx.select().from(LightbulbGoalTable).where(eq(LightbulbGoalTable.id, goalID)).get()
              if (!goal) return yield* Effect.die(new Error("Lightbulb goal was not created"))
              return { goal, adopted: false }
            }),
          )
          .pipe(Effect.orDie)
      }),
      readGoal: Effect.fn("Lightbulb.readGoal")(function* (goalID) {
        return yield* db
          .select()
          .from(LightbulbGoalTable)
          .where(eq(LightbulbGoalTable.id, goalID))
          .get()
          .pipe(Effect.orDie)
      }),
      updateGoalStatus: Effect.fn("Lightbulb.updateGoalStatus")(function* (input) {
        const now = Date.now()
        const terminal = isTerminalGoalStatus(input.status)
        return yield* db
          .transaction((tx) =>
            Effect.gen(function* () {
              const current = yield* tx
                .select()
                .from(LightbulbGoalTable)
                .where(eq(LightbulbGoalTable.id, input.goalID))
                .get()
              if (!current) return yield* Effect.die(new Error("Lightbulb goal not found"))
              yield* tx
                .update(LightbulbGoalTable)
                .set({
                  status: input.status,
                  hold_reason: input.status === "held" ? input.reason ?? null : null,
                  completion_reason: terminal ? input.reason ?? null : null,
                  completed_at: terminal ? now : null,
                  time_updated: now,
                })
                .where(eq(LightbulbGoalTable.id, input.goalID))
                .run()
              yield* tx
                .insert(LightbulbEventTable)
                .values({
                  id: EventID.create(),
                  account_id: current.account_id,
                  aggregate_type: "goal",
                  aggregate_id: input.goalID,
                  type: "lightbulb.goal.status_changed",
                  summary: `Goal moved from ${current.status} to ${input.status}.`,
                  data: { from: current.status, to: input.status, reason: input.reason ?? null },
                  time_created: now,
                })
                .run()
              const goal = yield* tx
                .select()
                .from(LightbulbGoalTable)
                .where(eq(LightbulbGoalTable.id, input.goalID))
                .get()
              if (!goal) return yield* Effect.die(new Error("Lightbulb goal not found"))
              return goal
            }),
          )
          .pipe(Effect.orDie)
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
                  type: "report",
                  uri: input?.artifactUri ?? ".lightbulb/runs/schema-tracer-bullet.md",
                  checksum: null,
                  status: "registered",
                  summary: input?.artifactSummary ?? "Concise worker report for parent orchestration.",
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
      registerArtifact: Effect.fn("Lightbulb.registerArtifact")(function* (input) {
        const artifactID = ArtifactID.create()
        const edgeSummary = "Worker produced this artifact for parent review."
        return yield* db
          .transaction((tx) =>
            Effect.gen(function* () {
              const run = yield* tx
                .select({ account_id: LightbulbRunTable.account_id })
                .from(LightbulbRunTable)
                .where(eq(LightbulbRunTable.id, input.producerRunID))
                .get()
              if (!run) return yield* Effect.die(new Error("Lightbulb producer run not found"))
              yield* tx
                .insert(LightbulbArtifactTable)
                .values({
                  id: artifactID,
                  account_id: run.account_id,
                  producer_run_id: input.producerRunID,
                  producer_worker_id: input.producerWorkerID,
                  task_packet_id: input.taskPacketID,
                  type: input.type,
                  uri: input.uri,
                  checksum: input.checksum ?? null,
                  status: "registered",
                  summary: input.summary,
                  metadata: input.metadata,
                  retention_policy: input.retentionPolicy ?? "keep",
                })
                .run()
              yield* tx
                .insert(LightbulbArtifactEdgeTable)
                .values({
                  account_id: run.account_id,
                  artifact_id: artifactID,
                  consumer_run_id: input.producerRunID,
                  consumer_worker_id: input.producerWorkerID,
                  relation: "produced_by",
                  summary: edgeSummary,
                })
                .run()
              return {
                id: artifactID,
                type: input.type,
                uri: input.uri,
                summary: input.summary,
                status: "registered" as const,
                producerRunID: input.producerRunID,
                producerWorkerID: input.producerWorkerID,
                lineage: [
                  {
                    relation: "produced_by" as const,
                    runID: input.producerRunID,
                    workerID: input.producerWorkerID,
                    summary: edgeSummary,
                  },
                ],
              }
            }),
          )
          .pipe(Effect.orDie)
      }),
      readAccountGraph: Effect.fn("Lightbulb.readAccountGraph")(function* (accountID) {
        return yield* readAccountGraphFromDb(db, accountID)
      }),
      readDashboard: Effect.fn("Lightbulb.readDashboard")(function* (accountID) {
        const graph = yield* readAccountGraphFromDb(db, accountID)
        if (!graph) return
        return toDashboard(graph)
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
          .where(eq(LightbulbArtifactTable.producer_run_id, runID))
          .orderBy(asc(LightbulbArtifactTable.time_created))
          .all()
          .pipe(Effect.orDie)
        const artifactEdges = yield* db
          .select()
          .from(LightbulbArtifactEdgeTable)
          .innerJoin(
            LightbulbArtifactTable,
            eq(LightbulbArtifactEdgeTable.artifact_id, LightbulbArtifactTable.id),
          )
          .where(eq(LightbulbArtifactTable.producer_run_id, runID))
          .orderBy(asc(LightbulbArtifactEdgeTable.time_created))
          .all()
          .pipe(Effect.orDie)
          .pipe(Effect.map((rows) => rows.map((row) => row.lightbulb_artifact_edge)))

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
          artifacts: artifacts.map((artifact) =>
            toArtifactHandle(
              artifact,
              artifactEdges.filter((edge) => edge.artifact_id === artifact.id),
            ),
          ),
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

function isTerminalGoalStatus(status: GoalStatus) {
  return status === "completed" || status === "cancelled" || status === "stopped"
}

function toGoalRunTree(graph: AccountGraph, goal: GoalLifecycle): GoalRunTree {
  const loops = graph.loops.filter((loop) => loop.goal_id === goal.id)
  const loopIDs = new Set(loops.map((loop) => loop.id))
  const runs = graph.runs.filter((run) => loopIDs.has(run.loop_id))
  const runIDs = new Set(runs.map((run) => run.id))
  const workers = graph.workers.filter((worker) => runIDs.has(worker.run_id))
  const workerIDs = new Set(workers.map((worker) => worker.id))
  const artifacts = graph.artifacts.filter((artifact) => runIDs.has(artifact.producer_run_id))

  return {
    goal: toGoalSummary(goal),
    loops: loops.map((loop) => toDashboardLoop(graph, loop, runs)),
    taskPackets: graph.taskPackets
      .filter((packet) => workerIDs.has(packet.worker_id))
      .map((packet) => ({
        id: packet.id,
        workerID: packet.worker_id,
        title: packet.title,
        status: packet.status,
      })),
    gates: graph.gates.filter((gate) => runIDs.has(gate.run_id)).map(toDashboardGate),
    artifactHandles: artifacts.map((artifact) => toArtifactHandleFromGraph(graph, artifact)),
  }
}

function toGoalSummary(goal: GoalLifecycle): GoalSummary {
  return {
    id: goal.id,
    title: goal.title,
    objective: goal.objective,
    sourceRef: goal.source_ref,
    ownerID: goal.owner_id,
    status: goal.status,
    summary: goal.summary,
    holdReason: goal.hold_reason,
    completionReason: goal.completion_reason,
    completedAt: goal.completed_at,
    timeCreated: goal.time_created,
    timeUpdated: goal.time_updated,
  }
}

function toDashboard(graph: AccountGraph): Dashboard {
  return {
    account: {
      id: graph.account.id,
      name: graph.account.name,
      status: graph.account.status,
    },
    goals: graph.goals.map((goal) => ({
      id: goal.id,
      title: goal.title,
      status: goal.status,
      summary: goal.summary,
      loops: graph.loops
        .filter((loop) => loop.goal_id === goal.id)
        .map((loop) => toDashboardLoop(graph, loop)),
    })),
    inbox: {
      taskPackets: graph.taskPackets.map((packet) => ({
        id: packet.id,
        workerID: packet.worker_id,
        title: packet.title,
        status: packet.status,
      })),
      gates: graph.gates
        .filter((gate) => gate.status === "pending" || gate.status === "blocked")
        .map(toDashboardGate),
    },
    artifactHandles: graph.artifacts.map((artifact) => toArtifactHandleFromGraph(graph, artifact)),
  }
}

function toDashboardLoop(
  graph: AccountGraph,
  loop: typeof LightbulbLoopTable.$inferSelect,
  runs: readonly (typeof LightbulbRunTable.$inferSelect)[] = graph.runs,
): DashboardLoop {
  return {
    id: loop.id,
    kind: loop.kind,
    status: loop.status,
    summary: loop.summary,
    runs: runs.filter((run) => run.loop_id === loop.id).map((run) => toDashboardRun(graph, run)),
  }
}

function toDashboardRun(graph: AccountGraph, run: typeof LightbulbRunTable.$inferSelect): DashboardRun {
  return {
    id: run.id,
    status: run.status,
    reviewStatus: run.review_status,
    debugStatus: run.debug_status,
    gateStatus: run.gate_status,
    summary: run.summary,
    workers: graph.workers
      .filter((worker) => worker.run_id === run.id)
      .map((worker) => ({
        id: worker.id,
        role: worker.role,
        status: worker.status,
        summary: worker.summary,
      })),
    gates: graph.gates.filter((gate) => gate.run_id === run.id).map(toDashboardGate),
    artifacts: graph.artifacts
      .filter((artifact) => artifact.producer_run_id === run.id)
      .map((artifact) => toArtifactHandleFromGraph(graph, artifact)),
  }
}

function toDashboardGate(row: typeof LightbulbGateTable.$inferSelect): DashboardGate {
  return {
    id: row.id,
    kind: row.kind,
    status: row.status,
    summary: row.summary,
    artifactID: row.artifact_id,
  }
}

function toArtifactHandleFromGraph(
  graph: AccountGraph,
  artifact: typeof LightbulbArtifactTable.$inferSelect,
): ArtifactHandle {
  return toArtifactHandle(
    artifact,
    graph.artifactEdges.filter((edge) => edge.artifact_id === artifact.id),
  )
}

function toArtifactHandle(
  row: typeof LightbulbArtifactTable.$inferSelect,
  edges: readonly (typeof LightbulbArtifactEdgeTable.$inferSelect)[] = [],
): ArtifactHandle {
  return {
    id: row.id,
    type: row.type,
    uri: row.uri,
    summary: row.summary,
    status: row.status,
    producerRunID: row.producer_run_id,
    producerWorkerID: row.producer_worker_id,
    lineage: edges.map((edge) => ({
      relation: edge.relation,
      runID: edge.consumer_run_id,
      workerID: edge.consumer_worker_id ?? null,
      summary: edge.summary,
    })),
  }
}
