import { eq } from "drizzle-orm"
import { Effect } from "effect"
import type { ArtifactID, GateID, RunID, WorkerID } from "../lightbulb"
import type { Database } from "../database/database"
import { LightbulbGateTable, LightbulbLoopTable, LightbulbRunTable, LightbulbWorkerTable } from "./sql"

export type GatePolicyApproval = "not_required" | "pending" | "approved" | "denied"
export type GatePolicyVerification = "not_required" | "pending" | "passed" | "failed"
export type GatePolicyOutcome = "continue" | "checkpoint" | "blocked" | "stopped"
export type GatePolicyStatus = "passed" | "blocked" | "failed"

export type GatePolicyThresholds = {
  readonly maxContextTokens?: number
  readonly maxCostUsd?: number
  readonly requireApproval?: boolean
  readonly requireVerification?: boolean
  readonly stop?: boolean
}

export type GatePolicyState = {
  readonly contextTokens: number
  readonly costUsd: number
  readonly approval: GatePolicyApproval
  readonly verification: GatePolicyVerification
}

export type GatePolicyInput = {
  readonly thresholds: GatePolicyThresholds
  readonly state: GatePolicyState
}

export type GatePolicyDecision = {
  readonly outcome: GatePolicyOutcome
  readonly gateStatus: GatePolicyStatus
  readonly reason: string
  readonly requiresCheckpoint: boolean
  readonly requiresDelegation: boolean
}

export type GatePolicyTransition = {
  readonly gateID: GateID
  readonly decision: GatePolicyDecision
}

export type ApplyGatePolicyInput = {
  readonly runID: RunID
  readonly workerID?: WorkerID
  readonly artifactID?: ArtifactID
  readonly policy: GatePolicyInput["thresholds"]
  readonly state: GatePolicyInput["state"]
}

export function applyGatePolicyInDb(db: Database.Interface["db"], input: ApplyGatePolicyInput, createGateID: () => GateID) {
  return Effect.gen(function* () {
    const run = yield* db
      .select()
      .from(LightbulbRunTable)
      .where(eq(LightbulbRunTable.id, input.runID))
      .get()
      .pipe(Effect.orDie)
    if (!run) return

    const gateID = createGateID()
    const decision = evaluateGatePolicy({ thresholds: input.policy, state: input.state })
    yield* db
      .transaction((tx) =>
        Effect.gen(function* () {
          yield* tx
            .insert(LightbulbGateTable)
            .values({
              id: gateID,
              account_id: run.account_id,
              run_id: run.id,
              kind: "policy",
              status: decision.gateStatus,
              summary: decision.reason,
              artifact_id: input.artifactID,
              metadata: {
                blocked_reason: decision.gateStatus === "passed" ? null : decision.reason,
                policy_outcome: decision.outcome,
                requires_checkpoint: decision.requiresCheckpoint,
                requires_delegation: decision.requiresDelegation,
                thresholds: input.policy,
                state: input.state,
              },
            })
            .run()

          if (decision.outcome === "continue") return

          yield* tx
            .update(LightbulbRunTable)
            .set(runPolicyUpdate(decision, Date.now()))
            .where(eq(LightbulbRunTable.id, run.id))
            .run()

          yield* tx
            .update(LightbulbLoopTable)
            .set({ status: "blocked" })
            .where(eq(LightbulbLoopTable.id, run.loop_id))
            .run()

          if (!input.workerID) return

          yield* tx
            .update(LightbulbWorkerTable)
            .set({
              status: decision.outcome === "stopped" ? "failed" : "blocked",
              summary: decision.reason,
            })
            .where(eq(LightbulbWorkerTable.id, input.workerID))
            .run()
        }),
      )
      .pipe(Effect.orDie)

    return { gateID, decision }
  })
}

export function evaluateGatePolicy(input: GatePolicyInput): GatePolicyDecision {
  if (input.thresholds.stop) {
    return makeDecision({
      outcome: "stopped",
      gateStatus: "failed",
      reason: "Stop requested by policy.",
    })
  }

  if (input.thresholds.maxCostUsd !== undefined && input.state.costUsd >= input.thresholds.maxCostUsd) {
    return makeDecision({
      outcome: "stopped",
      gateStatus: "failed",
      reason: `Cost $${input.state.costUsd.toFixed(2)} reached configured maximum $${input.thresholds.maxCostUsd.toFixed(2)}.`,
    })
  }

  if (input.thresholds.requireApproval && input.state.approval === "denied") {
    return makeDecision({
      outcome: "stopped",
      gateStatus: "failed",
      reason: "Required approval was denied.",
    })
  }

  if (input.thresholds.requireApproval && input.state.approval !== "approved") {
    return makeDecision({
      outcome: "blocked",
      gateStatus: "blocked",
      reason: `Required approval is ${input.state.approval}.`,
    })
  }

  if (input.thresholds.requireVerification && input.state.verification !== "passed") {
    return makeDecision({
      outcome: "blocked",
      gateStatus: "blocked",
      reason: `Required verification is ${input.state.verification}.`,
    })
  }

  if (
    input.thresholds.maxContextTokens !== undefined &&
    input.state.contextTokens >= input.thresholds.maxContextTokens
  ) {
    return makeDecision({
      outcome: "checkpoint",
      gateStatus: "blocked",
      reason: `Context ${input.state.contextTokens} tokens reached checkpoint threshold ${input.thresholds.maxContextTokens}; checkpoint and delegate before continuing.`,
      requiresCheckpoint: true,
      requiresDelegation: true,
    })
  }

  return makeDecision({
    outcome: "continue",
    gateStatus: "passed",
    reason: "Policy thresholds allow the run to continue.",
  })
}

export function gateBlockedReason(row: typeof LightbulbGateTable.$inferSelect) {
  if (typeof row.metadata?.blocked_reason === "string") return row.metadata.blocked_reason
  if (row.status === "blocked" || row.status === "failed") return row.summary
  return null
}

function makeDecision(input: {
  readonly outcome: GatePolicyOutcome
  readonly gateStatus: GatePolicyStatus
  readonly reason: string
  readonly requiresCheckpoint?: boolean
  readonly requiresDelegation?: boolean
}): GatePolicyDecision {
  return {
    outcome: input.outcome,
    gateStatus: input.gateStatus,
    reason: input.reason,
    requiresCheckpoint: input.requiresCheckpoint ?? false,
    requiresDelegation: input.requiresDelegation ?? false,
  }
}

function runPolicyUpdate(decision: GatePolicyDecision, now: number) {
  if (decision.outcome === "stopped") {
    return {
      status: "failed" as const,
      gate_status: "failed" as const,
      completed_at: now,
    }
  }

  return {
    status: "blocked" as const,
    gate_status: "blocked" as const,
  }
}
