import { and, asc, eq, or } from "drizzle-orm"
import { Effect } from "effect"
import type { Database } from "../database/database"
import type { Lightbulb } from "../lightbulb"
import { Identifier } from "../util/identifier"
import { decisionForArtifact, integrityForRegistration, readArtifactHandle, serializeRetentionPolicy } from "./artifact"
import {
  ArtifactRegistrationRejected,
  resolveHarnessArtifactSource,
  validateArtifactRegistrationInput,
} from "./artifact-registration"
import { LightbulbArtifactEdgeTable, LightbulbArtifactTable, LightbulbGateTable } from "./sql"

export type DecisionArtifactType = "prd" | "adr" | "design_discussion" | "html_decision"
export type DecisionArtifactStatus = "draft" | "pending" | "accepted" | "rejected" | "superseded" | "needs-rework"

export type DecisionArtifactSummary = {
  readonly title: string | null
  readonly status: DecisionArtifactStatus
  readonly owner: string | null
  readonly reviewer: string | null
  readonly supersedesArtifactID: Lightbulb.ArtifactID | null
  readonly supersededByArtifactID: Lightbulb.ArtifactID | null
}

export type DecisionArtifactHandle = Lightbulb.ArtifactHandle & {
  readonly type: DecisionArtifactType
  readonly decision: DecisionArtifactSummary
}

export type RegisterDecisionArtifactInput = {
  readonly artifactID?: Lightbulb.ArtifactID
  readonly accountID: Lightbulb.AccountID
  readonly type: DecisionArtifactType
  readonly uri: string
  readonly summary: string
  readonly retentionPolicy: Lightbulb.ArtifactRetentionPolicy
  readonly baseDirectory?: string
  readonly checksum?: string
  readonly sizeBytes?: number
  readonly uncheckedReason?: string
  readonly unresolvedDependencyIDs?: readonly string[]
  readonly source?: Lightbulb.ArtifactSourceReferences
  readonly title?: string
  readonly decision: {
    readonly status: DecisionArtifactStatus
    readonly owner: string
    readonly reviewer?: string
    readonly supersedesArtifactID?: Lightbulb.ArtifactID
    readonly supersededByArtifactID?: Lightbulb.ArtifactID
  }
  readonly metadata?: Record<string, unknown>
}

export type TransitionDecisionArtifactInput = {
  readonly artifactID: Lightbulb.ArtifactID
  readonly decision: {
    readonly status: DecisionArtifactStatus
    readonly owner?: string
    readonly reviewer?: string
    readonly supersedesArtifactID?: Lightbulb.ArtifactID
    readonly supersededByArtifactID?: Lightbulb.ArtifactID
  }
}

export type IssueRoutingInput = {
  readonly accountID: Lightbulb.AccountID
  readonly issueRef: string
  readonly title: string
  readonly labels?: readonly string[]
  readonly gateID?: Lightbulb.GateID
  readonly requiredDecisionArtifactIDs?: readonly Lightbulb.ArtifactID[]
}

export type IssueRoutingDecisionHold = {
  readonly issueRef: string
  readonly gateID: Lightbulb.GateID | null
  readonly artifactID: Lightbulb.ArtifactID
  readonly status: DecisionArtifactStatus
  readonly summary: string
}

export type IssueRoutingClassification = {
  readonly issueRef: string
  readonly title: string
  readonly labels: readonly string[]
  readonly status: "ready_for_afk" | "held_for_decision" | "decision_rejected" | "not_ready"
  readonly decisionArtifacts: DecisionArtifactHandle[]
  readonly decisionHolds: IssueRoutingDecisionHold[]
}

export type WorkerDispatchPlan = {
  readonly spawnRequests: {
    readonly issueRef: string
    readonly title: string
    readonly labels: readonly string[]
    readonly summary: string
  }[]
  readonly skipped: {
    readonly issueRef: string
    readonly title: string
    readonly reason: "decision-held" | "decision-rejected" | "not-ready"
    readonly decisionHolds: IssueRoutingDecisionHold[]
    readonly summary: string
  }[]
}

export function registerDecisionArtifactInDb(db: Database.Interface["db"], input: RegisterDecisionArtifactInput) {
  return Effect.gen(function* () {
    const rejected = validateDecisionArtifactInput(input)
    if (rejected) return yield* Effect.fail(new ArtifactRegistrationRejected({ reason: rejected }))

    const superseded = input.decision.supersedesArtifactID
      ? yield* readDecisionArtifactRow(db, input.accountID, input.decision.supersedesArtifactID)
      : undefined
    if (input.decision.supersedesArtifactID && !superseded)
      return yield* Effect.fail(new ArtifactRegistrationRejected({ reason: "superseded decision artifact was not found" }))

    const supersededDecision = superseded && isDecisionArtifactType(superseded.type) ? decisionForArtifact(superseded) : undefined
    if (superseded && !supersededDecision)
      return yield* Effect.fail(new ArtifactRegistrationRejected({ reason: "superseded artifact is not a decision artifact" }))

    const source = yield* resolveHarnessArtifactSource(db, {
      accountID: input.accountID,
      source: input.source,
    })
    const artifactID = input.artifactID ?? (`lbartifact_${Identifier.ascending()}` as Lightbulb.ArtifactID)
    const now = Date.now()
    const integrity = yield* integrityForRegistration({
      uri: input.uri,
      baseDirectory: input.baseDirectory,
      checksum: input.checksum,
      sizeBytes: input.sizeBytes,
      uncheckedReason: input.uncheckedReason,
      now,
    })

    yield* db
      .transaction((tx) =>
        Effect.gen(function* () {
          yield* tx
            .insert(LightbulbArtifactTable)
            .values({
              id: artifactID,
              account_id: input.accountID,
              producer_run_id: null,
              producer_worker_id: null,
              task_packet_id: null,
              producer_kind: "harness",
              source_issue_ref: source.issueRef,
              source_goal_id: source.goalID,
              source_loop_id: source.loopID,
              source_run_id: source.runID,
              source_gate_id: source.gateID,
              type: input.type,
              uri: input.uri,
              checksum: integrity.checksum,
              status: input.decision.status === "superseded" ? "superseded" : "registered",
              summary: input.summary,
              metadata: {
                ...input.metadata,
                decision: {
                  type: input.type,
                  sourceIssueRef: source.issueRef,
                  sourceGateID: source.gateID,
                  ...decisionMetadata({ ...input.decision, title: input.title }),
                },
                integrity: integrity.metadata,
                ...(input.unresolvedDependencyIDs?.length
                  ? { retention: { unresolvedDependencyIDs: input.unresolvedDependencyIDs } }
                  : {}),
              },
              retention_policy: serializeRetentionPolicy(input.retentionPolicy),
            })
            .run()
          if (source.runID) {
            yield* tx
              .insert(LightbulbArtifactEdgeTable)
              .values({
                account_id: input.accountID,
                artifact_id: artifactID,
                consumer_run_id: source.runID,
                consumer_worker_id: null,
                relation: "produced_by",
                summary: "Harness registered this decision artifact for parent orchestration.",
              })
              .run()
          }
          if (source.gateID) {
            yield* tx
              .update(LightbulbGateTable)
              .set({ artifact_id: artifactID })
              .where(and(eq(LightbulbGateTable.account_id, input.accountID), eq(LightbulbGateTable.id, source.gateID)))
              .run()
          }
          if (superseded && supersededDecision) {
            yield* tx
              .update(LightbulbArtifactTable)
              .set({
                status: "superseded",
                metadata: {
                  ...superseded.metadata,
                  decision: {
                    type: superseded.type,
                    sourceIssueRef: superseded.source_issue_ref,
                    sourceGateID: superseded.source_gate_id,
                    ...decisionMetadata({
                      status: "superseded",
                      title: supersededDecision.title,
                      owner: supersededDecision.owner ?? "unassigned",
                      ...(supersededDecision.reviewer ? { reviewer: supersededDecision.reviewer } : {}),
                      ...(supersededDecision.supersedesArtifactID
                        ? { supersedesArtifactID: supersededDecision.supersedesArtifactID }
                        : {}),
                      supersededByArtifactID: artifactID,
                    }),
                  },
                },
              })
              .where(and(eq(LightbulbArtifactTable.account_id, input.accountID), eq(LightbulbArtifactTable.id, superseded.id)))
              .run()
          }
        }),
      )
      .pipe(Effect.orDie)

    const artifact = yield* readArtifactHandle(db, {
      artifactID,
      baseDirectory: input.baseDirectory,
      now,
      liveCheck: true,
    })
    const decisionArtifact = artifact ? toDecisionArtifactHandle(artifact) : undefined
    if (!decisionArtifact)
      return yield* Effect.fail(
        new ArtifactRegistrationRejected({ reason: "decision artifact registration did not produce a readable handle" }),
      )
    return decisionArtifact
  })
}

export function transitionDecisionArtifactInDb(db: Database.Interface["db"], input: TransitionDecisionArtifactInput) {
  return Effect.gen(function* () {
    const artifact = yield* db
      .select()
      .from(LightbulbArtifactTable)
      .where(eq(LightbulbArtifactTable.id, input.artifactID))
      .get()
      .pipe(Effect.orDie)
    if (!artifact)
      return yield* Effect.fail(new ArtifactRegistrationRejected({ reason: "decision artifact was not found" }))
    if (!isDecisionArtifactType(artifact.type))
      return yield* Effect.fail(new ArtifactRegistrationRejected({ reason: "artifact type is not decision-routable" }))

    const current = decisionForArtifact(artifact)
    if (!current)
      return yield* Effect.fail(new ArtifactRegistrationRejected({ reason: "artifact is missing decision metadata" }))

    const decision = {
      status: input.decision.status,
      title: current.title,
      owner: input.decision.owner ?? current.owner ?? "unassigned",
      ...(input.decision.reviewer !== undefined || current.reviewer
        ? { reviewer: input.decision.reviewer ?? current.reviewer ?? undefined }
        : {}),
      ...(input.decision.supersedesArtifactID ?? current.supersedesArtifactID
        ? { supersedesArtifactID: input.decision.supersedesArtifactID ?? current.supersedesArtifactID ?? undefined }
        : {}),
      ...(input.decision.supersededByArtifactID ?? current.supersededByArtifactID
        ? { supersededByArtifactID: input.decision.supersededByArtifactID ?? current.supersededByArtifactID ?? undefined }
        : {}),
    }
    const rejected = validateDecision(decision)
    if (rejected) return yield* Effect.fail(new ArtifactRegistrationRejected({ reason: rejected }))
    if (decision.supersededByArtifactID) {
      const replacement = yield* readDecisionArtifactRow(db, artifact.account_id, decision.supersededByArtifactID)
      if (!replacement)
        return yield* Effect.fail(new ArtifactRegistrationRejected({ reason: "replacement decision artifact was not found" }))
      if (!isDecisionArtifactType(replacement.type) || !decisionForArtifact(replacement))
        return yield* Effect.fail(new ArtifactRegistrationRejected({ reason: "replacement artifact is not a decision artifact" }))
    }

    yield* db
      .update(LightbulbArtifactTable)
      .set({
        status: decision.status === "superseded" ? "superseded" : artifact.status === "superseded" ? "registered" : artifact.status,
        metadata: {
          ...artifact.metadata,
          decision: {
            type: artifact.type,
            sourceIssueRef: artifact.source_issue_ref,
            sourceGateID: artifact.source_gate_id,
            ...decisionMetadata(decision),
          },
        },
      })
      .where(eq(LightbulbArtifactTable.id, input.artifactID))
      .run()
      .pipe(Effect.orDie)

    const handle = yield* readArtifactHandle(db, {
      artifactID: input.artifactID,
      now: Date.now(),
      liveCheck: false,
    })
    const decisionArtifact = handle ? toDecisionArtifactHandle(handle) : undefined
    if (!decisionArtifact)
      return yield* Effect.fail(
        new ArtifactRegistrationRejected({ reason: "decision artifact transition did not produce a readable handle" }),
      )
    return decisionArtifact
  })
}

export function classifyIssueRouting(db: Database.Interface["db"], input: IssueRoutingInput) {
  return Effect.gen(function* () {
    const rows = yield* readIssueDecisionArtifactRows(db, input)
    const handles = yield* Effect.all(
      rows.map((artifact) =>
        readArtifactHandle(db, {
          artifactID: artifact.id,
          now: Date.now(),
          liveCheck: false,
        }),
      ),
    )
    const decisionArtifacts = handles
      .map((artifact) => (artifact ? toDecisionArtifactHandle(artifact) : undefined))
      .filter((artifact): artifact is DecisionArtifactHandle => artifact !== undefined)
    const decisionHolds = uniqueDecisionHolds(
      decisionArtifacts.flatMap((artifact) => decisionHoldForArtifact(input, artifact, decisionArtifacts)),
    )
    return {
      issueRef: input.issueRef.trim(),
      title: input.title,
      labels: input.labels ?? [],
      status:
        decisionHolds.length === 0 && (input.labels ?? []).some((label) => label === "ready-for-agent")
          ? ("ready_for_afk" as const)
          : decisionHolds.some((hold) => hold.status === "rejected")
            ? ("decision_rejected" as const)
            : decisionHolds.length > 0
              ? ("held_for_decision" as const)
              : ("not_ready" as const),
      decisionArtifacts,
      decisionHolds,
    }
  })
}

export function planWorkerDispatch(db: Database.Interface["db"], input: { readonly issues: readonly IssueRoutingInput[] }) {
  return Effect.gen(function* () {
    const classifications = yield* Effect.all(input.issues.map((issue) => classifyIssueRouting(db, issue)))
    return {
      spawnRequests: classifications
        .filter((classification) => classification.status === "ready_for_afk")
        .map((classification) => ({
          issueRef: classification.issueRef,
          title: classification.title,
          labels: classification.labels,
          summary: "Issue is ready for AFK worker dispatch.",
        })),
      skipped: classifications
        .filter((classification) => classification.status !== "ready_for_afk")
        .map((classification) => ({
          issueRef: classification.issueRef,
          title: classification.title,
          reason:
            classification.status === "decision_rejected"
              ? ("decision-rejected" as const)
              : classification.status === "not_ready"
                ? ("not-ready" as const)
                : ("decision-held" as const),
          decisionHolds: classification.decisionHolds,
          summary:
            classification.status === "decision_rejected"
              ? "Issue has a rejected decision artifact and is not AFK-dispatchable."
              : classification.status === "not_ready"
                ? "Issue is not labelled ready-for-agent."
              : "Issue is held for unresolved decision artifacts.",
        })),
    }
  })
}

export function toDecisionArtifactHandle(artifact: Lightbulb.ArtifactHandle): DecisionArtifactHandle | undefined {
  if (!isDecisionArtifactType(artifact.type) || !artifact.decision) return
  return artifact as DecisionArtifactHandle
}

function readDecisionArtifactRow(
  db: Database.Interface["db"],
  accountID: Lightbulb.AccountID,
  artifactID: Lightbulb.ArtifactID,
) {
  return db
    .select()
    .from(LightbulbArtifactTable)
    .where(and(eq(LightbulbArtifactTable.account_id, accountID), eq(LightbulbArtifactTable.id, artifactID)))
    .get()
    .pipe(Effect.orDie)
}

function readIssueDecisionArtifactRows(db: Database.Interface["db"], input: IssueRoutingInput) {
  return Effect.gen(function* () {
    const issueRef = input.issueRef.trim()
    const issueArtifacts = issueRef
      ? yield* db
          .select()
          .from(LightbulbArtifactTable)
          .where(and(eq(LightbulbArtifactTable.account_id, input.accountID), eq(LightbulbArtifactTable.source_issue_ref, issueRef)))
          .orderBy(asc(LightbulbArtifactTable.time_created))
          .all()
          .pipe(Effect.orDie)
      : []
    const gate = input.gateID
      ? yield* db
          .select()
          .from(LightbulbGateTable)
          .where(and(eq(LightbulbGateTable.account_id, input.accountID), eq(LightbulbGateTable.id, input.gateID)))
          .get()
          .pipe(Effect.orDie)
      : undefined
    const gateArtifacts = input.gateID
      ? yield* db
          .select()
          .from(LightbulbArtifactTable)
          .where(
            gate?.artifact_id
              ? and(
                  eq(LightbulbArtifactTable.account_id, input.accountID),
                  or(
                    eq(LightbulbArtifactTable.source_gate_id, input.gateID),
                    eq(LightbulbArtifactTable.id, gate.artifact_id),
                  ),
                )
              : and(eq(LightbulbArtifactTable.account_id, input.accountID), eq(LightbulbArtifactTable.source_gate_id, input.gateID)),
          )
          .orderBy(asc(LightbulbArtifactTable.time_created))
          .all()
          .pipe(Effect.orDie)
      : []
    const requiredArtifacts = yield* Effect.all(
      (input.requiredDecisionArtifactIDs ?? []).map((artifactID) => readDecisionArtifactRow(db, input.accountID, artifactID)),
    )
    const primary = uniqueArtifacts([...issueArtifacts, ...gateArtifacts, ...requiredArtifacts])
      .filter((artifact) => isDecisionArtifactType(artifact.type))
      .filter((artifact) => decisionForArtifact(artifact))
    return primary
  })
}

function decisionHoldForArtifact(
  input: IssueRoutingInput,
  artifact: DecisionArtifactHandle,
  artifacts: readonly DecisionArtifactHandle[],
) {
  if (artifact.decision.status === "accepted") return []
  if (artifact.decision.status === "superseded" && artifact.decision.supersededByArtifactID) {
    const replacement = artifacts.find((candidate) => candidate.id === artifact.decision.supersededByArtifactID)
    if (replacement?.decision.status === "accepted") return []
    return [decisionHold(input, replacement ?? artifact)]
  }
  return [decisionHold(input, artifact)]
}

function decisionHold(input: IssueRoutingInput, artifact: DecisionArtifactHandle): IssueRoutingDecisionHold {
  return {
    issueRef: input.issueRef.trim(),
    gateID: artifact.source.gateID ?? input.gateID ?? null,
    artifactID: artifact.id,
    status: artifact.decision.status,
    summary: artifact.summary,
  }
}

function uniqueArtifacts(rows: readonly ((typeof LightbulbArtifactTable.$inferSelect) | undefined)[]) {
  return [...new Map(rows.filter((row): row is typeof LightbulbArtifactTable.$inferSelect => !!row).map((row) => [row.id, row])).values()]
}

function uniqueDecisionHolds(holds: readonly IssueRoutingDecisionHold[]) {
  return [
    ...new Map(
      holds.map((hold) => [hold.issueRef + ":" + (hold.gateID ?? "") + ":" + hold.artifactID + ":" + hold.status, hold]),
    ).values(),
  ]
}

function validateDecisionArtifactInput(input: RegisterDecisionArtifactInput) {
  if (!isDecisionArtifactType(input.type)) return "unsupported decision artifact type: " + input.type
  const registration = validateArtifactRegistrationInput(input)
  if (registration) return registration
  return validateDecision(input.decision)
}

function validateDecision(input: RegisterDecisionArtifactInput["decision"]) {
  if (!isDecisionArtifactStatus(input.status)) return "unsupported decision status: " + input.status
  if (!input.owner.trim()) return "decision owner is required"
  if (input.reviewer !== undefined && !input.reviewer.trim()) return "decision reviewer is empty"
  return
}

function decisionMetadata(input: RegisterDecisionArtifactInput["decision"] & { readonly title?: string | null }) {
  return {
    ...(input.title?.trim() ? { title: input.title.trim() } : {}),
    status: input.status,
    owner: input.owner.trim(),
    ...(input.reviewer?.trim() ? { reviewer: input.reviewer.trim() } : {}),
    ...(input.supersedesArtifactID ? { supersedesArtifactID: input.supersedesArtifactID } : {}),
    ...(input.supersededByArtifactID ? { supersededByArtifactID: input.supersededByArtifactID } : {}),
  }
}

function isDecisionArtifactType(value: string): value is DecisionArtifactType {
  return value === "prd" || value === "adr" || value === "design_discussion" || value === "html_decision"
}

function isDecisionArtifactStatus(value: unknown): value is DecisionArtifactStatus {
  return (
    value === "draft" ||
    value === "pending" ||
    value === "accepted" ||
    value === "rejected" ||
    value === "superseded" ||
    value === "needs-rework"
  )
}
