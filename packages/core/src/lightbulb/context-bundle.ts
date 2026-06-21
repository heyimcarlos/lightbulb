import { Buffer } from "buffer"
import { eq } from "drizzle-orm"
import { Effect } from "effect"
import type { Database } from "../database/database"
import type { Lightbulb } from "../lightbulb"
import { Hash } from "../util/hash"
import { LightbulbArtifactEdgeTable, LightbulbArtifactTable } from "./sql"

export type ContextBundlePolicyOutcome = "checkpoint" | "delegate" | "blocked" | "stopped"

export type ContextBundlePolicy = {
  readonly maxContextUnits: number
  readonly maxIssueInstructionChars: number
  readonly maxSummaryChars: number
  readonly maxExcerptChars: number
  readonly maxArtifactReferences: number
  readonly maxDecisionReferences: number
  readonly maxVerificationExpectations: number
  readonly rawTranscriptMaxBytes: number
  readonly allowRawTranscriptContent: boolean
  readonly estimatedCostUsd?: number
  readonly remainingCostBudgetUsd?: number
  readonly approvalRequired?: boolean
  readonly approvalGranted?: boolean
  readonly stopRequested?: boolean
  readonly onContextBudgetExceeded?: "checkpoint" | "delegate"
}

export type ContextBundleTaskPacketRequest = {
  readonly accountID: Lightbulb.AccountID
  readonly taskPacketID?: Lightbulb.TaskPacketID
  readonly title: string
  readonly objective: string
  readonly workerRole: string
}

export type ContextBundleWorkItemSummary = {
  readonly issueRef: string
  readonly title: string
  readonly labels: readonly string[]
  readonly ready: boolean
  readonly summary: string
  readonly instructions: string
}

export type ContextBundleParentReferences = {
  readonly goalID: Lightbulb.GoalID
  readonly loopID: Lightbulb.LoopID
  readonly runID?: Lightbulb.RunID
  readonly gateID?: Lightbulb.GateID
}

export type ContextBundleVerificationExpectation = {
  readonly summary: string
  readonly gateID?: Lightbulb.GateID
  readonly artifactID?: Lightbulb.ArtifactID
}

export type ContextBundleSourceExcerpt = {
  readonly handle: string
  readonly label: string
  readonly kind: "summary" | "excerpt" | "raw_transcript" | "raw_log"
  readonly text: string
}

export type ContextBundleStorage = {
  readonly readManifest: (fingerprint: string) => Effect.Effect<ContextBundleManifest | undefined>
  readonly writeManifest: (manifest: ContextBundleManifest) => Effect.Effect<ContextBundleManifest>
}

export type ContextBundleAssemblyInput = {
  readonly taskPacket: ContextBundleTaskPacketRequest
  readonly workItem: ContextBundleWorkItemSummary
  readonly parent: ContextBundleParentReferences
  readonly artifactHandles: readonly Lightbulb.ArtifactHandle[]
  readonly decisionArtifacts: readonly Lightbulb.DecisionArtifactHandle[]
  readonly verification: readonly ContextBundleVerificationExpectation[]
  readonly sourceExcerpts?: readonly ContextBundleSourceExcerpt[]
  readonly policy: ContextBundlePolicy
  readonly now: number
  readonly storage: ContextBundleStorage
}

export type ContextBundleAssemblyServiceInput = Omit<ContextBundleAssemblyInput, "now" | "storage"> & {
  readonly now?: number
}

export type ContextBundleManifestHandle = {
  readonly id: Lightbulb.ArtifactID
  readonly uri: string
  readonly summary: string
  readonly checksum: string
  readonly sourceFingerprint: string
  readonly policyFingerprint: string
  readonly estimatedContextUnits: number
}

export type ContextBundleIssueManifest = {
  readonly issueRef: string
  readonly title: string
  readonly labels: readonly string[]
  readonly ready: boolean
  readonly summary: string
  readonly summaryChecksum: string
  readonly instructions: string
  readonly instructionsChecksum: string
}

export type ContextBundleArtifactReference = {
  readonly artifactID: Lightbulb.ArtifactID
  readonly type: Lightbulb.ArtifactType
  readonly uri: string
  readonly summary: string
  readonly status: Lightbulb.ArtifactStatus
  readonly checksum: string | null
}

export type ContextBundleDecisionReference = ContextBundleArtifactReference & {
  readonly type: Lightbulb.DecisionArtifactType
  readonly decision: Lightbulb.DecisionArtifactSummary
}

export type ContextBundleExcerpt = {
  readonly handle: string
  readonly label: string
  readonly kind: "summary" | "excerpt"
  readonly excerpt: string
  readonly checksum: string
}

export type ContextBundleManifest = {
  readonly handle: ContextBundleManifestHandle
  readonly accountID: Lightbulb.AccountID
  readonly task: ContextBundleTaskPacketRequest
  readonly issue: ContextBundleIssueManifest
  readonly parent: ContextBundleParentReferences
  readonly artifactReferences: readonly ContextBundleArtifactReference[]
  readonly decisionReferences: readonly ContextBundleDecisionReference[]
  readonly verificationExpectations: readonly ContextBundleVerificationExpectation[]
  readonly excerpts: readonly ContextBundleExcerpt[]
  readonly estimatedContextUnits: number
  readonly sourceFingerprint: string
  readonly policyFingerprint: string
  readonly assembledAt: number
}

export type ContextBundleSpawnReadyPacket = {
  readonly taskPacketID: Lightbulb.TaskPacketID | null
  readonly title: string
  readonly workerRole: string
  readonly manifest: ContextBundleManifestHandle
  readonly instructions: string
}

export type ContextBundleDecisionHold = {
  readonly issueRef: string
  readonly gateID: Lightbulb.GateID | null
  readonly artifactID: Lightbulb.ArtifactID
  readonly status: Lightbulb.DecisionArtifactStatus
  readonly summary: string
}

export type ContextBundlePolicyHold = {
  readonly issueRef: string
  readonly gateID: Lightbulb.GateID | null
  readonly reason:
    | "work_item_not_ready"
    | "decision_artifact_unresolved"
    | "context_budget_exceeded"
    | "cost_budget_exceeded"
    | "approval_required"
    | "raw_transcript_rejected"
    | "stop_requested"
  readonly summary: string
  readonly artifactID?: Lightbulb.ArtifactID
  readonly estimatedContextUnits?: number
}

export type ContextBundleAssemblyResult =
  | {
      readonly outcome: "ready"
      readonly reused: boolean
      readonly manifest: ContextBundleManifest
      readonly spawnReadyPacket: ContextBundleSpawnReadyPacket
    }
  | {
      readonly outcome: ContextBundlePolicyOutcome
      readonly reason: ContextBundlePolicyHold["reason"]
      readonly summary: string
      readonly decisionHolds: readonly ContextBundleDecisionHold[]
      readonly policyHolds: readonly ContextBundlePolicyHold[]
      readonly estimatedContextUnits?: number
    }

export const defaultContextBundlePolicy: ContextBundlePolicy = {
  maxContextUnits: 6_000,
  maxIssueInstructionChars: 2_000,
  maxSummaryChars: 600,
  maxExcerptChars: 800,
  maxArtifactReferences: 12,
  maxDecisionReferences: 8,
  maxVerificationExpectations: 8,
  rawTranscriptMaxBytes: 2_048,
  allowRawTranscriptContent: false,
  onContextBudgetExceeded: "delegate",
}

export function assembleContextBundle(input: ContextBundleAssemblyInput): Effect.Effect<ContextBundleAssemblyResult> {
  return Effect.gen(function* () {
    if (!input.workItem.ready) {
      return held("blocked", "work_item_not_ready", input, "Work item is not ready for agent dispatch.")
    }

    const decisionHolds = decisionArtifactHolds(input)
    if (decisionHolds.length > 0) {
      return {
        outcome: "blocked" as const,
        reason: "decision_artifact_unresolved" as const,
        summary: "Context bundle assembly is held for unresolved decision artifacts.",
        decisionHolds,
        policyHolds: decisionHolds.map((hold) => ({
          issueRef: hold.issueRef,
          gateID: hold.gateID,
          reason: "decision_artifact_unresolved" as const,
          artifactID: hold.artifactID,
          summary: hold.summary,
        })),
      }
    }

    if (input.policy.stopRequested) {
      return held("stopped", "stop_requested", input, "Context bundle assembly was stopped by policy.")
    }

    const rawTranscriptHold = rawTranscriptPolicyHold(input)
    if (rawTranscriptHold) {
      return {
        outcome: "stopped" as const,
        reason: "raw_transcript_rejected" as const,
        summary: rawTranscriptHold.summary,
        decisionHolds: [],
        policyHolds: [rawTranscriptHold],
      }
    }

    if (input.policy.approvalRequired && !input.policy.approvalGranted) {
      return held("blocked", "approval_required", input, "Approval is required before worker context can be assembled.")
    }

    if (
      input.policy.estimatedCostUsd !== undefined &&
      input.policy.remainingCostBudgetUsd !== undefined &&
      input.policy.estimatedCostUsd > input.policy.remainingCostBudgetUsd
    ) {
      return held(
        "blocked",
        "cost_budget_exceeded",
        input,
        "Estimated cost " + input.policy.estimatedCostUsd + " exceeds remaining budget " + input.policy.remainingCostBudgetUsd + ".",
      )
    }

    const material = contextBundleMaterial(input)
    if (material.estimatedContextUnits > input.policy.maxContextUnits) {
      const summary =
        "Estimated context units " +
        material.estimatedContextUnits +
        " exceed policy limit " +
        input.policy.maxContextUnits +
        "."
      return {
        outcome: input.policy.onContextBudgetExceeded ?? "delegate",
        reason: "context_budget_exceeded" as const,
        summary,
        decisionHolds: [],
        policyHolds: [
          {
            issueRef: material.issue.issueRef,
            gateID: input.parent.gateID ?? null,
            reason: "context_budget_exceeded",
            summary,
            estimatedContextUnits: material.estimatedContextUnits,
          },
        ],
        estimatedContextUnits: material.estimatedContextUnits,
      }
    }

    const existing = yield* input.storage.readManifest(material.sourceFingerprint)
    if (existing) {
      return {
        outcome: "ready" as const,
        reused: true,
        manifest: existing,
        spawnReadyPacket: spawnReadyPacket(existing),
      }
    }

    const manifestID = artifactIDForContextBundle(material.sourceFingerprint)
    const manifest = yield* input.storage.writeManifest({
      ...material,
      assembledAt: input.now,
      handle: {
        id: manifestID,
        uri: "artifact://context-bundles/" + manifestID,
        summary: compactText(
          "Context bundle manifest for " + material.issue.issueRef + ": " + input.taskPacket.title,
          input.policy.maxSummaryChars,
        ),
        checksum: material.sourceFingerprint,
        sourceFingerprint: material.sourceFingerprint,
        policyFingerprint: material.policyFingerprint,
        estimatedContextUnits: material.estimatedContextUnits,
      },
    })

    return {
      outcome: "ready" as const,
      reused: false,
      manifest,
      spawnReadyPacket: spawnReadyPacket(manifest),
    }
  })
}

export function databaseContextBundleStorage(db: Database.Interface["db"]): ContextBundleStorage {
  return {
    readManifest: (fingerprint) =>
      db
        .select()
        .from(LightbulbArtifactTable)
        .where(eq(LightbulbArtifactTable.id, artifactIDForContextBundle(fingerprint)))
        .get()
        .pipe(
          Effect.orDie,
          Effect.map((row) => contextBundleManifestFromMetadata(row?.metadata)),
        ),
    writeManifest: (manifest) =>
      Effect.gen(function* () {
        yield* db
          .insert(LightbulbArtifactTable)
          .values({
            id: manifest.handle.id,
            account_id: manifest.accountID,
            producer_run_id: null,
            producer_worker_id: null,
            task_packet_id: null,
            producer_kind: "harness",
            source_issue_ref: manifest.issue.issueRef,
            source_goal_id: manifest.parent.goalID,
            source_loop_id: manifest.parent.loopID,
            source_run_id: manifest.parent.runID,
            source_gate_id: manifest.parent.gateID,
            type: "context_manifest",
            uri: manifest.handle.uri,
            checksum: manifest.handle.checksum,
            status: "registered",
            summary: manifest.handle.summary,
            metadata: {
              contextBundle: manifest,
              integrity: {
                algorithm: "sha256",
                checkedAt: manifest.assembledAt,
                sizeBytes: Buffer.byteLength(stableJson(manifest)),
              },
            },
            retention_policy: "keep",
          })
          .onConflictDoNothing()
          .run()
          .pipe(Effect.orDie)

        if (manifest.parent.runID) {
          yield* db
            .insert(LightbulbArtifactEdgeTable)
            .values({
              account_id: manifest.accountID,
              artifact_id: manifest.handle.id,
              consumer_run_id: manifest.parent.runID,
              consumer_worker_id: null,
              relation: "produced_by",
              summary: "Harness assembled this bounded context manifest before worker dispatch.",
            })
            .onConflictDoNothing()
            .run()
            .pipe(Effect.orDie)
        }

        return (yield* databaseContextBundleStorage(db).readManifest(manifest.sourceFingerprint)) ?? manifest
      }),
  }
}

function contextBundleMaterial(input: ContextBundleAssemblyInput): Omit<ContextBundleManifest, "assembledAt" | "handle"> {
  const issue = {
    issueRef: input.workItem.issueRef.trim(),
    title: compactText(input.workItem.title, input.policy.maxSummaryChars),
    labels: [...input.workItem.labels].sort(),
    ready: input.workItem.ready,
    summary: compactText(input.workItem.summary, input.policy.maxSummaryChars),
    summaryChecksum: checksum(input.workItem.summary),
    instructions: compactText(input.workItem.instructions, input.policy.maxIssueInstructionChars),
    instructionsChecksum: checksum(input.workItem.instructions),
  }
  const decisionArtifactIDs = new Set(input.decisionArtifacts.map((artifact) => artifact.id))
  const artifactReferences = input.artifactHandles
    .filter((artifact) => !decisionArtifactIDs.has(artifact.id))
    .map((artifact) => artifactReference(artifact, input.policy.maxSummaryChars))
    .sort((left, right) => left.artifactID.localeCompare(right.artifactID))
    .slice(0, input.policy.maxArtifactReferences)
  const decisionReferences = acceptedDecisionReferences(input)
    .map((artifact) => decisionReference(artifact, input.policy.maxSummaryChars))
    .sort((left, right) => left.artifactID.localeCompare(right.artifactID))
    .slice(0, input.policy.maxDecisionReferences)
  const verificationExpectations = input.verification
    .map((expectation) => ({
      ...expectation,
      summary: compactText(expectation.summary, input.policy.maxSummaryChars),
    }))
    .slice(0, input.policy.maxVerificationExpectations)
  const excerpts = (input.sourceExcerpts ?? [])
    .filter((source): source is ContextBundleSourceExcerpt & { readonly kind: ContextBundleExcerpt["kind"] } =>
      source.kind === "summary" || source.kind === "excerpt",
    )
    .map((source) => ({
      handle: source.handle,
      label: compactText(source.label, input.policy.maxSummaryChars),
      kind: source.kind,
      excerpt: compactText(source.text, input.policy.maxExcerptChars),
      checksum: checksum(source.text),
    }))
    .sort((left, right) => (left.handle + left.label).localeCompare(right.handle + right.label))
  const policyFingerprint = checksum(input.policy)
  const sourceFingerprint = checksum({
    taskPacket: input.taskPacket,
    issue: {
      issueRef: issue.issueRef,
      title: input.workItem.title,
      labels: issue.labels,
      ready: input.workItem.ready,
      summaryChecksum: issue.summaryChecksum,
      instructionsChecksum: issue.instructionsChecksum,
    },
    parent: input.parent,
    artifacts: artifactReferences,
    decisions: input.decisionArtifacts
      .map((artifact) => ({
        artifactID: artifact.id,
        type: artifact.type,
        uri: artifact.uri,
        summary: artifact.summary,
        status: artifact.status,
        checksum: artifact.integrity.checksum,
        decision: artifact.decision,
      }))
      .sort((left, right) => left.artifactID.localeCompare(right.artifactID)),
    verification: verificationExpectations,
    excerpts: (input.sourceExcerpts ?? [])
      .map((source) => ({
        handle: source.handle,
        label: source.label,
        kind: source.kind,
        checksum: checksum(source.text),
        sizeBytes: Buffer.byteLength(source.text),
      }))
      .sort((left, right) => (left.handle + left.label).localeCompare(right.handle + right.label)),
    policyFingerprint,
  })
  const estimatedContextUnits = estimateContextUnits({
    task: input.taskPacket,
    issue,
    artifactReferences,
    decisionReferences,
    verificationExpectations,
    excerpts,
  })

  return {
    accountID: input.taskPacket.accountID,
    task: {
      ...input.taskPacket,
      title: compactText(input.taskPacket.title, input.policy.maxSummaryChars),
      objective: compactText(input.taskPacket.objective, input.policy.maxSummaryChars),
      workerRole: compactText(input.taskPacket.workerRole, input.policy.maxSummaryChars),
    },
    issue,
    parent: input.parent,
    artifactReferences,
    decisionReferences,
    verificationExpectations,
    excerpts,
    estimatedContextUnits,
    sourceFingerprint,
    policyFingerprint,
  }
}

function acceptedDecisionReferences(input: ContextBundleAssemblyInput) {
  return input.decisionArtifacts
    .filter((artifact) => artifact.decision.status === "accepted")
    .filter(
      (artifact) =>
        !input.decisionArtifacts.some(
          (candidate) => candidate.decision.status === "accepted" && candidate.decision.supersedesArtifactID === artifact.id,
        ),
    )
}

function decisionArtifactHolds(input: ContextBundleAssemblyInput): readonly ContextBundleDecisionHold[] {
  return uniqueDecisionHolds(
    input.decisionArtifacts.flatMap((artifact) => {
      if (artifact.decision.status === "accepted") return []
      if (artifact.decision.status === "superseded" && artifact.decision.supersededByArtifactID) {
        const replacement = input.decisionArtifacts.find((candidate) => candidate.id === artifact.decision.supersededByArtifactID)
        if (replacement?.decision.status === "accepted") return []
        return [decisionHold(input, replacement ?? artifact)]
      }
      return [decisionHold(input, artifact)]
    }),
  )
}

function rawTranscriptPolicyHold(input: ContextBundleAssemblyInput): ContextBundlePolicyHold | undefined {
  const source = (input.sourceExcerpts ?? []).find((excerpt) => excerpt.kind === "raw_transcript" || excerpt.kind === "raw_log")
  if (!source) return
  const sizeBytes = Buffer.byteLength(source.text)
  if (!input.policy.allowRawTranscriptContent) {
    return {
      issueRef: input.workItem.issueRef.trim(),
      gateID: input.parent.gateID ?? null,
      reason: "raw_transcript_rejected",
      summary: "Raw transcript/log source " + source.handle + " is not allowed in worker context bundles.",
    }
  }
  if (sizeBytes <= input.policy.rawTranscriptMaxBytes) return
  return {
    issueRef: input.workItem.issueRef.trim(),
    gateID: input.parent.gateID ?? null,
    reason: "raw_transcript_rejected",
    summary:
      "Raw transcript/log source " +
      source.handle +
      " is " +
      sizeBytes +
      " bytes; limit is " +
      input.policy.rawTranscriptMaxBytes +
      ".",
  }
}

function held(
  outcome: ContextBundlePolicyOutcome,
  reason: ContextBundlePolicyHold["reason"],
  input: ContextBundleAssemblyInput,
  summary: string,
): ContextBundleAssemblyResult {
  return {
    outcome,
    reason,
    summary,
    decisionHolds: [],
    policyHolds: [
      {
        issueRef: input.workItem.issueRef.trim(),
        gateID: input.parent.gateID ?? null,
        reason,
        summary,
      },
    ],
  }
}

function decisionHold(
  input: ContextBundleAssemblyInput,
  artifact: Lightbulb.DecisionArtifactHandle,
): ContextBundleDecisionHold {
  return {
    issueRef: input.workItem.issueRef.trim(),
    gateID: artifact.source.gateID ?? input.parent.gateID ?? null,
    artifactID: artifact.id,
    status: artifact.decision.status,
    summary: artifact.summary,
  }
}

function uniqueDecisionHolds(holds: readonly ContextBundleDecisionHold[]) {
  return [
    ...new Map(
      holds.map((hold) => [hold.issueRef + ":" + (hold.gateID ?? "") + ":" + hold.artifactID + ":" + hold.status, hold]),
    ).values(),
  ]
}

function spawnReadyPacket(manifest: ContextBundleManifest): ContextBundleSpawnReadyPacket {
  return {
    taskPacketID: manifest.task.taskPacketID ?? null,
    title: manifest.task.title,
    workerRole: manifest.task.workerRole,
    manifest: manifest.handle,
    instructions: [
      "Task: " + manifest.task.title,
      "Objective: " + manifest.task.objective,
      "Context manifest: " + manifest.handle.uri,
      "Manifest checksum: " + manifest.handle.checksum,
      "Issue: " + manifest.issue.issueRef + " " + manifest.issue.title,
      manifest.issue.instructions,
      "Verification: " + manifest.verificationExpectations.map((expectation) => expectation.summary).join("; "),
      "Use the manifest handles and compact excerpts; raw transcripts and full logs are not part of this task packet.",
    ]
      .filter((line) => line.trim().length > 0)
      .join("\n\n"),
  }
}

function artifactReference(
  artifact: Lightbulb.ArtifactHandle,
  maxSummaryChars: number,
): ContextBundleArtifactReference {
  return {
    artifactID: artifact.id,
    type: artifact.type,
    uri: artifact.uri,
    summary: compactText(artifact.summary, maxSummaryChars),
    status: artifact.status,
    checksum: artifact.integrity.checksum,
  }
}

function decisionReference(
  artifact: Lightbulb.DecisionArtifactHandle,
  maxSummaryChars: number,
): ContextBundleDecisionReference {
  return {
    ...artifactReference(artifact, maxSummaryChars),
    type: artifact.type,
    decision: artifact.decision,
  }
}

function estimateContextUnits(input: {
  readonly task: ContextBundleTaskPacketRequest
  readonly issue: ContextBundleIssueManifest
  readonly artifactReferences: readonly ContextBundleArtifactReference[]
  readonly decisionReferences: readonly ContextBundleDecisionReference[]
  readonly verificationExpectations: readonly ContextBundleVerificationExpectation[]
  readonly excerpts: readonly ContextBundleExcerpt[]
}) {
  const textUnits = Math.ceil(
    [
      input.task.title,
      input.task.objective,
      input.task.workerRole,
      input.issue.title,
      input.issue.summary,
      input.issue.instructions,
      ...input.artifactReferences.map((artifact) => artifact.summary + artifact.uri),
      ...input.decisionReferences.map((artifact) => artifact.summary + artifact.uri + artifact.decision.status),
      ...input.verificationExpectations.map((expectation) => expectation.summary),
      ...input.excerpts.map((excerpt) => excerpt.label + excerpt.excerpt),
    ].join("\n").length / 4,
  )
  return textUnits + input.artifactReferences.length * 16 + input.decisionReferences.length * 20
}

function compactText(value: string, maxChars: number) {
  const compacted = value.trim().replace(/\s+/g, " ")
  if (compacted.length <= maxChars) return compacted
  if (maxChars <= 14) return compacted.slice(0, maxChars)
  return compacted.slice(0, maxChars - 14).trimEnd() + " [truncated]"
}

function checksum(value: unknown) {
  return "sha256:" + Hash.sha256(stableJson(value))
}

function artifactIDForContextBundle(fingerprint: string): Lightbulb.ArtifactID {
  return ("lbartifact_ctx_" + fingerprint.replace(/^sha256:/, "").slice(0, 32)) as Lightbulb.ArtifactID
}

function contextBundleManifestFromMetadata(metadata: Record<string, unknown> | null | undefined) {
  if (!isRecord(metadata)) return
  if (!isContextBundleManifest(metadata.contextBundle)) return
  return metadata.contextBundle
}

function isContextBundleManifest(value: unknown): value is ContextBundleManifest {
  if (!isRecord(value)) return false
  if (!isRecord(value.handle)) return false
  return (
    typeof value.sourceFingerprint === "string" &&
    typeof value.policyFingerprint === "string" &&
    typeof value.estimatedContextUnits === "number" &&
    typeof value.assembledAt === "number" &&
    typeof value.handle.id === "string" &&
    typeof value.handle.checksum === "string"
  )
}

function stableJson(value: unknown): string {
  if (value === undefined) return "null"
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null"
  if (Array.isArray(value)) return "[" + value.map((item) => stableJson(item)).join(",") + "]"
  if (!isRecord(value)) return JSON.stringify(value) ?? "null"
  return "{" + Object.keys(value)
    .sort()
    .map((key) => JSON.stringify(key) + ":" + stableJson(value[key]))
    .join(",") + "}"
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
