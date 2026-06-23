import { and, eq } from "drizzle-orm"
import { Effect, Schema } from "effect"
import type { Database } from "../database/database"
import type { Lightbulb } from "../lightbulb"
import { registerArtifactInDb } from "./artifact-registration"
import { openReviewGateInDb, type ReviewGateHandle } from "./review-gate"
import {
  LightbulbEventTable,
  LightbulbRunTable,
  LightbulbTaskPacketTable,
  LightbulbWorkerLaunchAttemptTable,
  LightbulbWorkerTable,
} from "./sql"

export class WorkerReportRejected extends Schema.TaggedErrorClass<WorkerReportRejected>()(
  "Lightbulb.WorkerReportRejected",
  {
    reason: Schema.String,
  },
) {
  override get message() {
    return this.reason
  }
}

export type WorkerReportStatus = "complete" | "failed" | "blocked" | "needs-review"

export type WorkerReportUsage = {
  readonly inputTokens?: number
  readonly outputTokens?: number
  readonly totalTokens?: number
  readonly costUsd?: number
  readonly contextTokens?: number
}

export type WorkerReportVerification = {
  readonly commands: readonly string[]
  readonly summary: string
}

export type WorkerReportArtifactInput = {
  readonly artifactID?: Lightbulb.ArtifactID
  readonly type?: Lightbulb.ArtifactType
  readonly uri: string
  readonly summary: string
  readonly retentionPolicy?: Lightbulb.ArtifactRetentionPolicy
  readonly baseDirectory?: string
  readonly checksum?: string
  readonly sizeBytes?: number
  readonly uncheckedReason?: string
  readonly unresolvedDependencyIDs?: readonly string[]
  readonly metadata?: Record<string, unknown>
}

export type IngestWorkerReportServiceInput = {
  readonly accountID: Lightbulb.AccountID
  readonly runID: Lightbulb.RunID
  readonly workerID: Lightbulb.WorkerID
  readonly taskPacketID: Lightbulb.TaskPacketID
  readonly status: WorkerReportStatus
  readonly summary: string
  readonly reason?: string
  readonly artifacts: readonly WorkerReportArtifactInput[]
  readonly verification: WorkerReportVerification
  readonly usage?: WorkerReportUsage
  readonly reviewer?: string
  readonly reviewReason?: string
  readonly rawTranscript?: string
  readonly now?: number
  readonly metadata?: Record<string, unknown>
}

export type IngestWorkerReportInput = Omit<IngestWorkerReportServiceInput, "now"> & {
  readonly now: number
}

export type WorkerReportIngestionResult = {
  readonly status: WorkerReportStatus
  readonly runID: Lightbulb.RunID
  readonly workerID: Lightbulb.WorkerID
  readonly taskPacketID: Lightbulb.TaskPacketID
  readonly artifactHandles: Lightbulb.ArtifactHandle[]
  readonly reviewGate: ReviewGateHandle | null
  readonly eventID: Lightbulb.EventID
}

export function ingestWorkerReportInDb(
  db: Database.Interface["db"],
  input: IngestWorkerReportInput,
  ids: { readonly event: () => Lightbulb.EventID; readonly gate: () => Lightbulb.GateID },
): Effect.Effect<WorkerReportIngestionResult, WorkerReportRejected> {
  return Effect.gen(function* () {
    const rejected = validateWorkerReportInput(input)
    if (rejected) return yield* Effect.fail(new WorkerReportRejected({ reason: rejected }))

    const target = yield* resolveReportTarget(db, input)
    const artifactHandles = yield* Effect.all(
      input.artifacts.map((artifact) =>
        registerArtifactInDb(db, {
          artifactID: artifact.artifactID,
          producerRunID: input.runID,
          producerWorkerID: input.workerID,
          taskPacketID: input.taskPacketID,
          type: artifact.type ?? "report",
          uri: artifact.uri,
          summary: artifact.summary,
          retentionPolicy: artifact.retentionPolicy ?? { mode: "keep" },
          baseDirectory: artifact.baseDirectory,
          checksum: artifact.checksum,
          sizeBytes: artifact.sizeBytes,
          uncheckedReason: artifact.uncheckedReason ?? "worker report artifact content not checked",
          unresolvedDependencyIDs: artifact.unresolvedDependencyIDs,
          metadata: {
            ...artifact.metadata,
            worker_report: reportMetadata(input),
          },
        }).pipe(Effect.mapError((error) => new WorkerReportRejected({ reason: error.reason }))),
      ),
      { concurrency: 1 },
    )
    const reportArtifact = artifactHandles.find((artifact) => artifact.type === "report" || artifact.type === "run_report")
    if (!reportArtifact) return yield* Effect.fail(new WorkerReportRejected({ reason: "worker report artifact is required" }))

    yield* db
      .transaction((tx) =>
        Effect.gen(function* () {
          yield* tx
            .update(LightbulbRunTable)
            .set({
              status: runStatus(input.status),
              review_status: input.status === "needs-review" ? "requested" : reviewStatus(input.status),
              gate_status: input.status === "needs-review" ? "pending" : gateStatus(input.status),
              summary: input.summary.trim(),
              completed_at: input.now,
              metadata: mergeReportMetadata(target.run.metadata, input),
              time_updated: input.now,
            })
            .where(and(eq(LightbulbRunTable.account_id, input.accountID), eq(LightbulbRunTable.id, input.runID)))
            .run()
          yield* tx
            .update(LightbulbWorkerTable)
            .set({
              status: workerStatus(input.status),
              summary: input.summary.trim(),
              metadata: mergeReportMetadata(target.worker.metadata, input),
              time_updated: input.now,
            })
            .where(and(eq(LightbulbWorkerTable.account_id, input.accountID), eq(LightbulbWorkerTable.id, input.workerID)))
            .run()
          yield* tx
            .update(LightbulbTaskPacketTable)
            .set({
              status: taskPacketStatus(input.status),
              metadata: mergeReportMetadata(target.taskPacket.metadata, input),
              time_updated: input.now,
            })
            .where(and(eq(LightbulbTaskPacketTable.account_id, input.accountID), eq(LightbulbTaskPacketTable.id, input.taskPacketID)))
            .run()
          if (target.launchAttempt) {
            yield* tx
              .update(LightbulbWorkerLaunchAttemptTable)
              .set({
                active_key: null,
                status: launchStatus(input.status),
                report_uri: reportArtifact.uri,
                failure_reason: input.status === "failed" || input.status === "blocked" ? input.reason?.trim() : null,
                metadata: mergeReportMetadata(target.launchAttempt.metadata, input),
                time_updated: input.now,
              })
              .where(
                and(
                  eq(LightbulbWorkerLaunchAttemptTable.account_id, input.accountID),
                  eq(LightbulbWorkerLaunchAttemptTable.id, target.launchAttempt.id),
                ),
              )
              .run()
          }
        }),
      )
      .pipe(Effect.orDie)

    const reviewGate =
      input.status === "needs-review"
        ? yield* openReviewGateInDb(
            db,
            {
              accountID: input.accountID,
              target: { kind: "artifact", artifactID: reportArtifact.id },
              owner: "worker-report-ingestion",
              reviewer: input.reviewer,
              reason: input.reviewReason?.trim() || "Worker final report requires parent review.",
              summary: "Review worker final report: " + input.summary.trim(),
              now: input.now,
              metadata: { worker_report: reportMetadata(input) },
            },
            { gate: ids.gate, event: ids.event },
          ).pipe(Effect.mapError((error) => new WorkerReportRejected({ reason: error.reason })))
        : null

    const eventID = ids.event()
    yield* db
      .insert(LightbulbEventTable)
      .values({
        id: eventID,
        account_id: input.accountID,
        aggregate_type: "worker",
        aggregate_id: input.workerID,
        type: "lightbulb.worker_report.ingested",
        summary: input.summary.trim(),
        data: {
          account_id: input.accountID,
          run_id: input.runID,
          worker_id: input.workerID,
          task_packet_id: input.taskPacketID,
          status: input.status,
          reason: input.reason?.trim() ?? null,
          artifact_ids: artifactHandles.map((artifact) => artifact.id),
          review_gate_id: reviewGate?.id ?? null,
          verification: input.verification,
          usage: normalizeUsage(input.usage),
        },
        time_created: input.now,
      })
      .run()
      .pipe(Effect.orDie)

    return {
      status: input.status,
      runID: input.runID,
      workerID: input.workerID,
      taskPacketID: input.taskPacketID,
      artifactHandles,
      reviewGate,
      eventID,
    }
  })
}

function validateWorkerReportInput(input: IngestWorkerReportInput) {
  if (!input.summary.trim()) return "worker report summary is required"
  if (input.reason !== undefined && !input.reason.trim()) return "worker report reason must not be empty"
  if (input.status === "failed" && !input.reason?.trim()) return "failed worker report reason is required"
  if (input.status === "blocked" && !input.reason?.trim()) return "blocked worker report reason is required"
  if (input.rawTranscript?.trim()) return "worker report ingestion does not accept raw transcript content"
  if (containsRawTranscript(input.metadata)) return "worker report metadata must not include raw transcript content"
  if (input.artifacts.length === 0) return "worker report artifact is required"
  if (!input.artifacts.some((artifact) => artifact.type === undefined || artifact.type === "report" || artifact.type === "run_report"))
    return "worker report artifact is required"
  if (input.artifacts.some((artifact) => containsRawTranscript(artifact.metadata)))
    return "worker report artifact metadata must not include raw transcript content"
  if (!input.verification.summary.trim()) return "worker report verification summary is required"
  if (input.verification.commands.length === 0) return "worker report verification commands are required"
  if (input.verification.commands.some((command) => !command.trim())) return "worker report verification commands must not be empty"
  const invalidUsage = validateUsage(input.usage)
  if (invalidUsage) return invalidUsage
  return
}

function resolveReportTarget(db: Database.Interface["db"], input: IngestWorkerReportInput) {
  return Effect.gen(function* () {
    const run = yield* db
      .select()
      .from(LightbulbRunTable)
      .where(and(eq(LightbulbRunTable.account_id, input.accountID), eq(LightbulbRunTable.id, input.runID)))
      .get()
      .pipe(Effect.orDie)
    if (!run) return yield* Effect.fail(new WorkerReportRejected({ reason: "worker report run was not found" }))

    const worker = yield* db
      .select()
      .from(LightbulbWorkerTable)
      .where(and(eq(LightbulbWorkerTable.account_id, input.accountID), eq(LightbulbWorkerTable.id, input.workerID)))
      .get()
      .pipe(Effect.orDie)
    if (!worker) return yield* Effect.fail(new WorkerReportRejected({ reason: "worker report worker was not found" }))
    if (worker.run_id !== run.id)
      return yield* Effect.fail(new WorkerReportRejected({ reason: "worker report worker does not belong to run" }))

    const taskPacket = yield* db
      .select()
      .from(LightbulbTaskPacketTable)
      .where(and(eq(LightbulbTaskPacketTable.account_id, input.accountID), eq(LightbulbTaskPacketTable.id, input.taskPacketID)))
      .get()
      .pipe(Effect.orDie)
    if (!taskPacket) return yield* Effect.fail(new WorkerReportRejected({ reason: "worker report task packet was not found" }))
    if (taskPacket.worker_id !== worker.id)
      return yield* Effect.fail(new WorkerReportRejected({ reason: "worker report task packet does not belong to worker" }))

    const launchAttempt = yield* db
      .select()
      .from(LightbulbWorkerLaunchAttemptTable)
      .where(
        and(
          eq(LightbulbWorkerLaunchAttemptTable.account_id, input.accountID),
          eq(LightbulbWorkerLaunchAttemptTable.worker_id, input.workerID),
          eq(LightbulbWorkerLaunchAttemptTable.task_packet_id, input.taskPacketID),
        ),
      )
      .get()
      .pipe(Effect.orDie)

    return { run, worker, taskPacket, launchAttempt }
  })
}

function runStatus(status: WorkerReportStatus): Lightbulb.RunStatus {
  if (status === "failed") return "failed"
  if (status === "blocked") return "blocked"
  return "complete"
}

function workerStatus(status: WorkerReportStatus): Lightbulb.WorkerStatus {
  if (status === "failed") return "failed"
  if (status === "blocked") return "blocked"
  return "complete"
}

function taskPacketStatus(status: WorkerReportStatus): Lightbulb.TaskPacketStatus {
  if (status === "failed" || status === "blocked") return "blocked"
  return "complete"
}

function reviewStatus(status: WorkerReportStatus): Lightbulb.ReviewStatus {
  if (status === "complete") return "approved"
  return "not_requested"
}

function gateStatus(status: WorkerReportStatus): Lightbulb.GateStatus {
  if (status === "complete") return "passed"
  if (status === "failed") return "failed"
  return "blocked"
}

function launchStatus(status: WorkerReportStatus): Lightbulb.WorkerLaunchStatus {
  if (status === "blocked") return "blocked"
  return "complete"
}

function mergeReportMetadata(metadata: Record<string, unknown> | null | undefined, input: IngestWorkerReportInput) {
  return {
    ...(metadata ?? {}),
    worker_report: reportMetadata(input),
  }
}

function reportMetadata(input: IngestWorkerReportInput) {
  return {
    status: input.status,
    reason: input.reason?.trim() ?? null,
    verification: input.verification,
    usage: normalizeUsage(input.usage),
    ingested_at: input.now,
    metadata: input.metadata ?? null,
  }
}

function normalizeUsage(usage: WorkerReportUsage | undefined) {
  if (!usage) return null
  return {
    input_tokens: usage.inputTokens ?? null,
    output_tokens: usage.outputTokens ?? null,
    total_tokens: usage.totalTokens ?? null,
    cost_usd: usage.costUsd ?? null,
    context_tokens: usage.contextTokens ?? null,
  }
}

function validateUsage(usage: WorkerReportUsage | undefined) {
  if (!usage) return
  const values = [
    ["inputTokens", usage.inputTokens],
    ["outputTokens", usage.outputTokens],
    ["totalTokens", usage.totalTokens],
    ["costUsd", usage.costUsd],
    ["contextTokens", usage.contextTokens],
  ] as const
  const invalid = values.find((entry) => entry[1] !== undefined && (!Number.isFinite(entry[1]) || entry[1] < 0))
  if (invalid) return "worker report usage " + invalid[0] + " must be a non-negative finite number"
  return
}

function containsRawTranscript(value: unknown): boolean {
  if (!isRecord(value)) return false
  return Object.entries(value).some(([key, entry]) => {
    if (key.toLowerCase().includes("transcript")) return true
    if (isRecord(entry)) return containsRawTranscript(entry)
    if (Array.isArray(entry)) return entry.some(containsRawTranscript)
    return false
  })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
