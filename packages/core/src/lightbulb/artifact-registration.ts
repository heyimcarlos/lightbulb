import { eq } from "drizzle-orm"
import { Effect, Schema } from "effect"
import type { Database } from "../database/database"
import type {
  AccountID,
  ArtifactRetentionPolicy,
  ArtifactSourceReferences,
  RegisterArtifactInput,
} from "../lightbulb"
import {
  LightbulbAccountTable,
  LightbulbGateTable,
  LightbulbGoalTable,
  LightbulbLoopTable,
  LightbulbRunTable,
  LightbulbTaskPacketTable,
  LightbulbWorkerTable,
} from "./sql"

export class ArtifactRegistrationRejected extends Schema.TaggedErrorClass<ArtifactRegistrationRejected>()(
  "Lightbulb.ArtifactRegistrationRejected",
  {
    reason: Schema.String,
  },
) {
  override get message() {
    return this.reason
  }
}

export const MAX_INLINE_ARTIFACT_BYTES = 8 * 1024

const ARTIFACT_TYPES = [
  "report",
  "plan",
  "patch",
  "test_result",
  "handoff",
  "log",
  "prd",
  "adr",
  "run_report",
  "scaffold",
  "operator_summary",
] as const
const MAX_ARTIFACT_SUMMARY_LENGTH = 600

export function validateArtifactRegistrationInput(input: {
  readonly type: string
  readonly uri: string
  readonly summary: string
  readonly retentionPolicy: ArtifactRetentionPolicy
  readonly checksum?: string
  readonly uncheckedReason?: string
}) {
  if (!ARTIFACT_TYPES.some((type) => type === input.type)) return `unsupported artifact type: ${input.type}`
  if (input.uri.trim().length === 0) return "artifact handle uri is required"
  if (input.summary.trim().length === 0) return "artifact summary is required"
  if (input.summary.length > MAX_ARTIFACT_SUMMARY_LENGTH)
    return `artifact summary exceeds ${MAX_ARTIFACT_SUMMARY_LENGTH} characters`
  if (input.checksum && input.uncheckedReason) return "artifact integrity must not include both checksum and unchecked reason"
  if (input.checksum && !/^sha256:[a-f0-9]{64}$/.test(input.checksum))
    return "artifact checksum must use sha256:<64 lowercase hex characters>"
  if (input.retentionPolicy.mode === "expire" && !Number.isFinite(input.retentionPolicy.expiresAt))
    return "artifact retention expiresAt must be finite"
  return
}

export function resolveWorkerArtifactProducer(db: Database.Interface["db"], input: RegisterArtifactInput) {
  return Effect.gen(function* () {
    const run = yield* db
      .select({ id: LightbulbRunTable.id, account_id: LightbulbRunTable.account_id })
      .from(LightbulbRunTable)
      .where(eq(LightbulbRunTable.id, input.producerRunID))
      .get()
      .pipe(Effect.orDie)
    if (!run)
      return yield* Effect.fail(new ArtifactRegistrationRejected({ reason: "artifact producer run was not found" }))

    const worker = yield* db
      .select({
        id: LightbulbWorkerTable.id,
        account_id: LightbulbWorkerTable.account_id,
        run_id: LightbulbWorkerTable.run_id,
      })
      .from(LightbulbWorkerTable)
      .where(eq(LightbulbWorkerTable.id, input.producerWorkerID))
      .get()
      .pipe(Effect.orDie)
    if (!worker)
      return yield* Effect.fail(new ArtifactRegistrationRejected({ reason: "artifact producer worker was not found" }))
    if (worker.account_id !== run.account_id || worker.run_id !== run.id)
      return yield* Effect.fail(
        new ArtifactRegistrationRejected({ reason: "artifact producer worker does not belong to producer run" }),
      )

    const taskPacket = yield* db
      .select({
        id: LightbulbTaskPacketTable.id,
        account_id: LightbulbTaskPacketTable.account_id,
        worker_id: LightbulbTaskPacketTable.worker_id,
      })
      .from(LightbulbTaskPacketTable)
      .where(eq(LightbulbTaskPacketTable.id, input.taskPacketID))
      .get()
      .pipe(Effect.orDie)
    if (!taskPacket)
      return yield* Effect.fail(new ArtifactRegistrationRejected({ reason: "artifact task packet was not found" }))
    if (taskPacket.account_id !== run.account_id || taskPacket.worker_id !== worker.id)
      return yield* Effect.fail(
        new ArtifactRegistrationRejected({ reason: "artifact task packet does not belong to producer worker" }),
      )

    return { accountID: run.account_id }
  })
}

export function resolveHarnessArtifactSource(
  db: Database.Interface["db"],
  input: {
    readonly accountID: AccountID
    readonly source?: ArtifactSourceReferences
  },
) {
  return Effect.gen(function* () {
    const account = yield* db
      .select({ id: LightbulbAccountTable.id })
      .from(LightbulbAccountTable)
      .where(eq(LightbulbAccountTable.id, input.accountID))
      .get()
      .pipe(Effect.orDie)
    if (!account) return yield* Effect.fail(new ArtifactRegistrationRejected({ reason: "artifact account was not found" }))

    const issueRef = input.source?.issueRef?.trim()
    if (input.source?.issueRef !== undefined && !issueRef)
      return yield* Effect.fail(new ArtifactRegistrationRejected({ reason: "artifact source issue reference is empty" }))

    const goal = input.source?.goalID
      ? yield* db
          .select({ id: LightbulbGoalTable.id, account_id: LightbulbGoalTable.account_id })
          .from(LightbulbGoalTable)
          .where(eq(LightbulbGoalTable.id, input.source.goalID))
          .get()
          .pipe(Effect.orDie)
      : undefined
    if (input.source?.goalID && !goal)
      return yield* Effect.fail(new ArtifactRegistrationRejected({ reason: "artifact source goal was not found" }))
    if (goal && goal.account_id !== input.accountID)
      return yield* Effect.fail(new ArtifactRegistrationRejected({ reason: "artifact source goal belongs to another account" }))

    const loop = input.source?.loopID
      ? yield* db
          .select({
            id: LightbulbLoopTable.id,
            account_id: LightbulbLoopTable.account_id,
            goal_id: LightbulbLoopTable.goal_id,
          })
          .from(LightbulbLoopTable)
          .where(eq(LightbulbLoopTable.id, input.source.loopID))
          .get()
          .pipe(Effect.orDie)
      : undefined
    if (input.source?.loopID && !loop)
      return yield* Effect.fail(new ArtifactRegistrationRejected({ reason: "artifact source loop was not found" }))
    if (loop && loop.account_id !== input.accountID)
      return yield* Effect.fail(new ArtifactRegistrationRejected({ reason: "artifact source loop belongs to another account" }))
    if (goal && loop && loop.goal_id !== goal.id)
      return yield* Effect.fail(
        new ArtifactRegistrationRejected({ reason: "artifact source loop does not belong to source goal" }),
      )

    const run = input.source?.runID
      ? yield* db
          .select({
            id: LightbulbRunTable.id,
            account_id: LightbulbRunTable.account_id,
            loop_id: LightbulbRunTable.loop_id,
          })
          .from(LightbulbRunTable)
          .where(eq(LightbulbRunTable.id, input.source.runID))
          .get()
          .pipe(Effect.orDie)
      : undefined
    if (input.source?.runID && !run)
      return yield* Effect.fail(new ArtifactRegistrationRejected({ reason: "artifact source run was not found" }))
    if (run && run.account_id !== input.accountID)
      return yield* Effect.fail(new ArtifactRegistrationRejected({ reason: "artifact source run belongs to another account" }))
    if (loop && run && run.loop_id !== loop.id)
      return yield* Effect.fail(
        new ArtifactRegistrationRejected({ reason: "artifact source run does not belong to source loop" }),
      )

    const gate = input.source?.gateID
      ? yield* db
          .select({
            id: LightbulbGateTable.id,
            account_id: LightbulbGateTable.account_id,
            run_id: LightbulbGateTable.run_id,
          })
          .from(LightbulbGateTable)
          .where(eq(LightbulbGateTable.id, input.source.gateID))
          .get()
          .pipe(Effect.orDie)
      : undefined
    if (input.source?.gateID && !gate)
      return yield* Effect.fail(new ArtifactRegistrationRejected({ reason: "artifact source gate was not found" }))
    if (gate && gate.account_id !== input.accountID)
      return yield* Effect.fail(new ArtifactRegistrationRejected({ reason: "artifact source gate belongs to another account" }))
    if (gate && run && gate.run_id !== run.id)
      return yield* Effect.fail(
        new ArtifactRegistrationRejected({ reason: "artifact source gate does not belong to source run" }),
      )

    return {
      issueRef: issueRef || null,
      goalID: input.source?.goalID ?? null,
      loopID: input.source?.loopID ?? null,
      runID: input.source?.runID ?? gate?.run_id ?? null,
      gateID: input.source?.gateID ?? null,
    }
  })
}
