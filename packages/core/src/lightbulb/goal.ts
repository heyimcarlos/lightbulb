import { and, eq } from "drizzle-orm"
import { Effect } from "effect"
import type { Database } from "../database/database"
import type { Lightbulb } from "../lightbulb"
import { LightbulbAccountTable, LightbulbEventTable, LightbulbGoalTable } from "./sql"

export type GoalLifecycle = typeof LightbulbGoalTable.$inferSelect

export type CreateGoalInput = {
  readonly accountID?: Lightbulb.AccountID
  readonly accountName?: string
  readonly goalID?: Lightbulb.GoalID
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
  readonly goalID: Lightbulb.GoalID
  readonly status: Lightbulb.GoalStatus
  readonly reason?: string
}

export type GoalSummary = {
  readonly id: Lightbulb.GoalID
  readonly title: string
  readonly objective: string
  readonly sourceRef: string | null
  readonly ownerID: string | null
  readonly status: Lightbulb.GoalStatus
  readonly summary: string
  readonly holdReason: string | null
  readonly completionReason: string | null
  readonly completedAt: number | null
  readonly timeCreated: number
  readonly timeUpdated: number
}

export type GoalRunTree = {
  readonly goal: GoalSummary
  readonly loops: Lightbulb.DashboardLoop[]
  readonly taskPackets: {
    readonly id: Lightbulb.TaskPacketID
    readonly workerID: Lightbulb.WorkerID
    readonly title: string
    readonly status: Lightbulb.TaskPacketStatus
  }[]
  readonly gates: Lightbulb.DashboardGate[]
  readonly artifactHandles: Lightbulb.ArtifactHandle[]
}

export const GoalLifecycleService = {
  createOrAdopt,
  read,
  updateStatus,
}

export type GoalIDFactories = {
  readonly account: () => Lightbulb.AccountID
  readonly goal: () => Lightbulb.GoalID
  readonly event: () => Lightbulb.EventID
}

function createOrAdopt(
  db: Database.Interface["db"],
  input: CreateGoalInput,
  ids: GoalIDFactories,
) {
  const goalID = input.goalID ?? ids.goal()
  return db
    .transaction((tx) =>
      Effect.gen(function* () {
        if (input.goalID) {
          const existing = yield* tx.select().from(LightbulbGoalTable).where(eq(LightbulbGoalTable.id, input.goalID)).get()
          if (existing) return { goal: existing, adopted: true }
        }
        if (input.sourceRef) {
          const existing = yield* tx
            .select()
            .from(LightbulbGoalTable)
            .where(
              input.accountID
                ? and(eq(LightbulbGoalTable.account_id, input.accountID), eq(LightbulbGoalTable.source_ref, input.sourceRef))
                : eq(LightbulbGoalTable.source_ref, input.sourceRef),
            )
            .get()
          if (existing) return { goal: existing, adopted: true }
        }
        const accountID = input.accountID ?? ids.account()
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
            id: ids.event(),
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
}

function read(db: Database.Interface["db"], goalID: Lightbulb.GoalID) {
  return db.select().from(LightbulbGoalTable).where(eq(LightbulbGoalTable.id, goalID)).get().pipe(Effect.orDie)
}

function updateStatus(db: Database.Interface["db"], input: UpdateGoalStatusInput, ids: Pick<GoalIDFactories, "event">) {
  const now = Date.now()
  const terminal = isTerminalGoalStatus(input.status)
  return db
    .transaction((tx) =>
      Effect.gen(function* () {
        const current = yield* tx.select().from(LightbulbGoalTable).where(eq(LightbulbGoalTable.id, input.goalID)).get()
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
            id: ids.event(),
            account_id: current.account_id,
            aggregate_type: "goal",
            aggregate_id: input.goalID,
            type: "lightbulb.goal.status_changed",
            summary: `Goal moved from ${current.status} to ${input.status}.`,
            data: { from: current.status, to: input.status, reason: input.reason ?? null },
            time_created: now,
          })
          .run()
        const goal = yield* tx.select().from(LightbulbGoalTable).where(eq(LightbulbGoalTable.id, input.goalID)).get()
        if (!goal) return yield* Effect.die(new Error("Lightbulb goal not found"))
        return goal
      }),
    )
    .pipe(Effect.orDie)
}

function isTerminalGoalStatus(status: Lightbulb.GoalStatus) {
  return status === "completed" || status === "cancelled" || status === "stopped"
}
