import { eq } from "drizzle-orm"
import { Effect, Schema } from "effect"
import type { Database } from "../database/database"
import type { Lightbulb } from "../lightbulb"
import {
  LightbulbArtifactTable,
  LightbulbEventTable,
  LightbulbGateTable,
  LightbulbRunTable,
  LightbulbWorkerTable,
} from "./sql"

export class ReviewGateRejected extends Schema.TaggedErrorClass<ReviewGateRejected>()(
  "Lightbulb.ReviewGateRejected",
  {
    reason: Schema.String,
  },
) {
  override get message() {
    return this.reason
  }
}

export type ReviewGateStatus = "opened" | "approved" | "rejected" | "needs-rework"
export type ReviewGateTargetKind = "run" | "worker" | "artifact"

export type ReviewGateTarget =
  | { readonly kind: "run"; readonly runID: Lightbulb.RunID }
  | { readonly kind: "worker"; readonly workerID: Lightbulb.WorkerID }
  | { readonly kind: "artifact"; readonly artifactID: Lightbulb.ArtifactID }

export type OpenReviewGateInput = {
  readonly accountID?: Lightbulb.AccountID
  readonly target: ReviewGateTarget
  readonly owner?: string
  readonly reviewer?: string
  readonly reason: string
  readonly summary?: string
  readonly now?: number
  readonly metadata?: Record<string, unknown>
}
export type OpenReviewGateServiceInput = OpenReviewGateInput

export type TransitionReviewGateInput = {
  readonly gateID: Lightbulb.GateID
  readonly status: Exclude<ReviewGateStatus, "opened">
  readonly reviewer?: string
  readonly reason: string
  readonly now?: number
  readonly metadata?: Record<string, unknown>
}
export type TransitionReviewGateServiceInput = TransitionReviewGateInput

export type ReviewGateHandle = {
  readonly id: Lightbulb.GateID
  readonly accountID: Lightbulb.AccountID
  readonly runID: Lightbulb.RunID
  readonly artifactID: Lightbulb.ArtifactID | null
  readonly gateStatus: Lightbulb.GateStatus
  readonly reviewStatus: ReviewGateStatus
  readonly targetKind: ReviewGateTargetKind
  readonly targetRunID: Lightbulb.RunID | null
  readonly targetWorkerID: Lightbulb.WorkerID | null
  readonly targetArtifactID: Lightbulb.ArtifactID | null
  readonly owner: string | null
  readonly reviewer: string | null
  readonly reason: string | null
  readonly decisionTimestamp: number | null
  readonly summary: string
  readonly timeCreated: number
  readonly timeUpdated: number
}

export type ReviewGateReadModel = {
  readonly status: ReviewGateStatus
  readonly targetKind: ReviewGateTargetKind
  readonly targetRunID: Lightbulb.RunID | null
  readonly targetWorkerID: Lightbulb.WorkerID | null
  readonly targetArtifactID: Lightbulb.ArtifactID | null
  readonly owner: string | null
  readonly reviewer: string | null
  readonly reason: string | null
  readonly decisionTimestamp: number | null
}

type ResolvedReviewGateTarget = {
  readonly accountID: Lightbulb.AccountID
  readonly runID: Lightbulb.RunID
  readonly artifactID: Lightbulb.ArtifactID | null
  readonly targetKind: ReviewGateTargetKind
  readonly targetRunID: Lightbulb.RunID | null
  readonly targetWorkerID: Lightbulb.WorkerID | null
  readonly targetArtifactID: Lightbulb.ArtifactID | null
}

export function openReviewGateInDb(
  db: Database.Interface["db"],
  input: OpenReviewGateInput,
  ids: { readonly gate: () => Lightbulb.GateID; readonly event: () => Lightbulb.EventID },
) {
  return Effect.gen(function* () {
    const target = yield* resolveReviewGateTarget(db, input.target)
    const rejected = validateOpenReviewGateInput(input, target)
    if (rejected) return yield* Effect.fail(new ReviewGateRejected({ reason: rejected }))

    const now = input.now ?? Date.now()
    const gateID = ids.gate()
    const metadata = {
      ...input.metadata,
      review_gate: {
        status: "opened" satisfies ReviewGateStatus,
        target_kind: target.targetKind,
        target_run_id: target.targetRunID,
        target_worker_id: target.targetWorkerID,
        target_artifact_id: target.targetArtifactID,
        owner: input.owner ?? null,
        reviewer: input.reviewer ?? null,
        reason: input.reason.trim(),
        opened_at: now,
        decision_timestamp: null,
      },
    }

    yield* db
      .transaction((tx) =>
        Effect.gen(function* () {
          yield* tx
            .insert(LightbulbGateTable)
            .values({
              id: gateID,
              account_id: target.accountID,
              run_id: target.runID,
              kind: "review",
              status: "pending",
              summary: input.summary?.trim() || "Review gate opened: " + input.reason.trim(),
              artifact_id: target.artifactID,
              metadata,
              time_created: now,
              time_updated: now,
            })
            .run()
          yield* tx
            .update(LightbulbRunTable)
            .set({
              review_status: "requested",
              gate_status: "pending",
              time_updated: now,
            })
            .where(eq(LightbulbRunTable.id, target.runID))
            .run()
          yield* tx
            .insert(LightbulbEventTable)
            .values({
              id: ids.event(),
              account_id: target.accountID,
              aggregate_type: "gate",
              aggregate_id: gateID,
              type: "lightbulb.review_gate.opened",
              summary: input.reason.trim(),
              data: metadata,
              time_created: now,
            })
            .run()
        }),
      )
      .pipe(Effect.orDie)

    const gate = yield* db.select().from(LightbulbGateTable).where(eq(LightbulbGateTable.id, gateID)).get().pipe(Effect.orDie)
    if (!gate) return yield* Effect.fail(new ReviewGateRejected({ reason: "review gate was not found after opening" }))
    return toReviewGateHandle(gate)
  })
}

export function transitionReviewGateInDb(
  db: Database.Interface["db"],
  input: TransitionReviewGateInput,
  ids: { readonly event: () => Lightbulb.EventID },
) {
  return Effect.gen(function* () {
    const gate = yield* db.select().from(LightbulbGateTable).where(eq(LightbulbGateTable.id, input.gateID)).get().pipe(Effect.orDie)
    if (!gate) return yield* Effect.fail(new ReviewGateRejected({ reason: "review gate was not found" }))
    if (gate.kind !== "review") return yield* Effect.fail(new ReviewGateRejected({ reason: "gate is not a review gate" }))

    const reason = input.reason.trim()
    if (!reason) return yield* Effect.fail(new ReviewGateRejected({ reason: "review gate decision reason is required" }))

    const now = input.now ?? Date.now()
    const current = reviewGateMetadata(gate)
    const metadata = {
      ...gate.metadata,
      ...input.metadata,
      review_gate: {
        status: input.status,
        target_kind: current.targetKind,
        target_run_id: current.targetRunID,
        target_worker_id: current.targetWorkerID,
        target_artifact_id: current.targetArtifactID,
        owner: current.owner,
        reviewer: input.reviewer ?? current.reviewer,
        reason,
        opened_at: openedAt(gate),
        decision_timestamp: now,
      },
    }
    const gateStatus = statusForReviewDecision(input.status)

    yield* db
      .transaction((tx) =>
        Effect.gen(function* () {
          yield* tx
            .update(LightbulbGateTable)
            .set({
              status: gateStatus,
              summary: reason,
              metadata,
              time_updated: now,
            })
            .where(eq(LightbulbGateTable.id, input.gateID))
            .run()
          yield* tx
            .update(LightbulbRunTable)
            .set({
              review_status: reviewStatusForDecision(input.status),
              gate_status: gateStatus,
              time_updated: now,
            })
            .where(eq(LightbulbRunTable.id, gate.run_id))
            .run()
          yield* tx
            .insert(LightbulbEventTable)
            .values({
              id: ids.event(),
              account_id: gate.account_id,
              aggregate_type: "gate",
              aggregate_id: input.gateID,
              type: "lightbulb.review_gate." + input.status,
              summary: reason,
              data: metadata,
              time_created: now,
            })
            .run()
        }),
      )
      .pipe(Effect.orDie)

    const updated = yield* db.select().from(LightbulbGateTable).where(eq(LightbulbGateTable.id, input.gateID)).get().pipe(Effect.orDie)
    if (!updated) return yield* Effect.fail(new ReviewGateRejected({ reason: "review gate was not found after transition" }))
    return toReviewGateHandle(updated)
  })
}

export function toReviewGateHandle(row: typeof LightbulbGateTable.$inferSelect): ReviewGateHandle {
  const metadata = reviewGateMetadata(row)
  return {
    id: row.id,
    accountID: row.account_id,
    runID: row.run_id,
    artifactID: row.artifact_id,
    gateStatus: row.status,
    reviewStatus: metadata.status,
    targetKind: metadata.targetKind,
    targetRunID: metadata.targetRunID,
    targetWorkerID: metadata.targetWorkerID,
    targetArtifactID: metadata.targetArtifactID,
    owner: metadata.owner,
    reviewer: metadata.reviewer,
    reason: metadata.reason,
    decisionTimestamp: metadata.decisionTimestamp,
    summary: row.summary,
    timeCreated: row.time_created,
    timeUpdated: row.time_updated,
  }
}

export function toReviewGateReadModel(row: typeof LightbulbGateTable.$inferSelect): ReviewGateReadModel | undefined {
  if (row.kind !== "review") return
  if (!isRecord(row.metadata?.review_gate)) return
  const metadata = reviewGateMetadata(row)
  return {
    status: metadata.status,
    targetKind: metadata.targetKind,
    targetRunID: metadata.targetRunID,
    targetWorkerID: metadata.targetWorkerID,
    targetArtifactID: metadata.targetArtifactID,
    owner: metadata.owner,
    reviewer: metadata.reviewer,
    reason: metadata.reason,
    decisionTimestamp: metadata.decisionTimestamp,
  }
}

export function reviewGateMetadata(row: typeof LightbulbGateTable.$inferSelect) {
  const metadata = isRecord(row.metadata?.review_gate) ? row.metadata.review_gate : {}
  return {
    status: reviewStatusFromMetadata(metadata.status, row.status),
    targetKind: reviewTargetKindFromMetadata(metadata.target_kind, row.artifact_id),
    targetRunID: typeof metadata.target_run_id === "string" ? (metadata.target_run_id as Lightbulb.RunID) : row.run_id,
    targetWorkerID: typeof metadata.target_worker_id === "string" ? (metadata.target_worker_id as Lightbulb.WorkerID) : null,
    targetArtifactID:
      typeof metadata.target_artifact_id === "string"
        ? (metadata.target_artifact_id as Lightbulb.ArtifactID)
        : row.artifact_id,
    owner: typeof metadata.owner === "string" ? metadata.owner : null,
    reviewer: typeof metadata.reviewer === "string" ? metadata.reviewer : null,
    reason: typeof metadata.reason === "string" ? metadata.reason : row.summary,
    decisionTimestamp: typeof metadata.decision_timestamp === "number" ? metadata.decision_timestamp : null,
  }
}

function resolveReviewGateTarget(db: Database.Interface["db"], target: ReviewGateTarget) {
  return Effect.gen(function* () {
    if (target.kind === "run") {
      const run = yield* db.select().from(LightbulbRunTable).where(eq(LightbulbRunTable.id, target.runID)).get().pipe(Effect.orDie)
      if (!run) return yield* Effect.fail(new ReviewGateRejected({ reason: "review gate target run was not found" }))
      return {
        accountID: run.account_id,
        runID: run.id,
        artifactID: null,
        targetKind: target.kind,
        targetRunID: run.id,
        targetWorkerID: null,
        targetArtifactID: null,
      } satisfies ResolvedReviewGateTarget
    }

    if (target.kind === "worker") {
      const worker = yield* db
        .select()
        .from(LightbulbWorkerTable)
        .where(eq(LightbulbWorkerTable.id, target.workerID))
        .get()
        .pipe(Effect.orDie)
      if (!worker) return yield* Effect.fail(new ReviewGateRejected({ reason: "review gate target worker was not found" }))
      return {
        accountID: worker.account_id,
        runID: worker.run_id,
        artifactID: null,
        targetKind: target.kind,
        targetRunID: worker.run_id,
        targetWorkerID: worker.id,
        targetArtifactID: null,
      } satisfies ResolvedReviewGateTarget
    }

    const artifact = yield* db
      .select()
      .from(LightbulbArtifactTable)
      .where(eq(LightbulbArtifactTable.id, target.artifactID))
      .get()
      .pipe(Effect.orDie)
    if (!artifact) return yield* Effect.fail(new ReviewGateRejected({ reason: "review gate target artifact was not found" }))
    const runID = artifact.producer_run_id ?? artifact.source_run_id
    if (!runID)
      return yield* Effect.fail(new ReviewGateRejected({ reason: "review gate target artifact is not linked to a run" }))
    return {
      accountID: artifact.account_id,
      runID,
      artifactID: artifact.id,
      targetKind: target.kind,
      targetRunID: runID,
      targetWorkerID: artifact.producer_worker_id,
      targetArtifactID: artifact.id,
    } satisfies ResolvedReviewGateTarget
  })
}

function validateOpenReviewGateInput(input: OpenReviewGateInput, target: ResolvedReviewGateTarget) {
  if (input.accountID && input.accountID !== target.accountID) return "review gate target belongs to another account"
  if (!input.reason.trim()) return "review gate reason is required"
  return
}

function statusForReviewDecision(status: Exclude<ReviewGateStatus, "opened">): Lightbulb.GateStatus {
  if (status === "approved") return "passed"
  if (status === "rejected") return "failed"
  return "blocked"
}

function reviewStatusForDecision(status: Exclude<ReviewGateStatus, "opened">): Lightbulb.ReviewStatus {
  if (status === "approved") return "approved"
  return "changes_requested"
}

function reviewStatusFromMetadata(value: unknown, status: Lightbulb.GateStatus): ReviewGateStatus {
  if (value === "approved" || value === "rejected" || value === "needs-rework" || value === "opened") return value
  if (status === "passed") return "approved"
  if (status === "failed") return "rejected"
  if (status === "blocked") return "needs-rework"
  return "opened"
}

function reviewTargetKindFromMetadata(value: unknown, artifactID: Lightbulb.ArtifactID | null): ReviewGateTargetKind {
  if (value === "run" || value === "worker" || value === "artifact") return value
  return artifactID ? "artifact" : "run"
}

function openedAt(row: typeof LightbulbGateTable.$inferSelect) {
  const metadata = isRecord(row.metadata?.review_gate) ? row.metadata.review_gate : {}
  return typeof metadata.opened_at === "number" ? metadata.opened_at : row.time_created
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
