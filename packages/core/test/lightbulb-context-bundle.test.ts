import { describe, expect } from "bun:test"
import { Effect } from "effect"
import { Lightbulb } from "@opencode-ai/core/lightbulb"
import {
  assembleContextBundle,
  defaultContextBundlePolicy,
  type ContextBundleAssemblyInput,
  type ContextBundleAssemblyResult,
  type ContextBundleManifest,
  type ContextBundleStorage,
} from "@opencode-ai/core/lightbulb/context-bundle"
import { it } from "./lib/effect"

const accountID = "lbacc_context_bundle" as Lightbulb.AccountID
const goalID = "lbgoal_context_bundle" as Lightbulb.GoalID
const loopID = "lbloop_context_bundle" as Lightbulb.LoopID
const runID = "lbrun_context_bundle" as Lightbulb.RunID
const gateID = "lbgate_context_bundle" as Lightbulb.GateID
const taskPacketID = "lbpacket_context_bundle" as Lightbulb.TaskPacketID

describe("Lightbulb context bundle assembly", () => {
  it.effect("assembles a ready issue into a bounded context manifest handle", () =>
    Effect.gen(function* () {
      const memory = memoryStorage()
      const result = requireReady(yield* assembleContextBundle(readyInput(memory.storage)))

      expect(result.reused).toBe(false)
      expect(result.manifest.handle.id).toMatch(/^lbartifact_ctx_/)
      expect(result.manifest.handle.uri).toBe("artifact://context-bundles/" + result.manifest.handle.id)
      expect(result.manifest.parent).toEqual({ goalID, loopID, runID, gateID })
      expect(result.manifest.issue).toMatchObject({
        issueRef: "#32",
        title: "Slice 23 context bundle assembly",
        labels: ["context-rot", "loop-harness", "ready-for-agent"],
        ready: true,
      })
      expect(result.manifest.issue.instructions.length).toBeLessThanOrEqual(defaultContextBundlePolicy.maxIssueInstructionChars)
      expect(result.manifest.artifactReferences.map((artifact) => [artifact.artifactID, artifact.type, artifact.checksum])).toEqual([
        ["lbartifact_plan" as Lightbulb.ArtifactID, "plan", "sha256:" + "2".repeat(64)],
        ["lbartifact_prd" as Lightbulb.ArtifactID, "prd", "sha256:" + "1".repeat(64)],
      ])
      expect(result.manifest.decisionReferences.map((artifact) => [artifact.artifactID, artifact.type, artifact.decision.status])).toEqual([
        ["lbartifact_adr" as Lightbulb.ArtifactID, "adr", "accepted"],
      ])
      expect(result.manifest.verificationExpectations.map((expectation) => expectation.summary)).toEqual([
        "Run focused context bundle tests from packages/core.",
        "Run bun typecheck from packages/core.",
      ])
      expect(result.manifest.estimatedContextUnits).toBeGreaterThan(0)
      expect(result.manifest.excerpts[0]?.excerpt.length).toBeLessThanOrEqual(defaultContextBundlePolicy.maxExcerptChars)
      expect(result.manifest.excerpts[0]?.checksum).toMatch(/^sha256:/)
      expect(result.spawnReadyPacket.manifest).toEqual(result.manifest.handle)
    }),
  )

  it.effect("holds bundle assembly for an unresolved ADR decision", () =>
    Effect.gen(function* () {
      const decision = decisionHandle({
        id: "lbartifact_pending_adr" as Lightbulb.ArtifactID,
        status: "pending",
        summary: "ADR must be accepted before dispatch.",
      })
      const result = yield* assembleContextBundle(readyInput(memoryStorage().storage, { decisionArtifacts: [decision] }))

      expect(result.outcome).toBe("blocked")
      expect("spawnReadyPacket" in result).toBe(false)
      if (result.outcome === "ready") throw new Error("expected decision hold")
      expect(result.reason).toBe("decision_artifact_unresolved")
      expect(result.decisionHolds).toEqual([
        {
          issueRef: "#32",
          gateID,
          artifactID: decision.id,
          status: "pending",
          summary: "ADR must be accepted before dispatch.",
        },
      ])
    }),
  )

  it.effect("holds rejected, needs-rework, and unresolved superseded decisions before spawn", () =>
    Effect.gen(function* () {
      const result = yield* assembleContextBundle(
        readyInput(memoryStorage().storage, {
          decisionArtifacts: [
            decisionHandle({
              id: "lbartifact_rejected_decision" as Lightbulb.ArtifactID,
              status: "rejected",
              summary: "Rejected decision blocks worker dispatch.",
            }),
            decisionHandle({
              id: "lbartifact_superseded_without_replacement" as Lightbulb.ArtifactID,
              status: "superseded",
              summary: "Superseded decision has no accepted replacement in this bundle.",
              supersededByArtifactID: "lbartifact_missing_replacement" as Lightbulb.ArtifactID,
            }),
            decisionHandle({
              id: "lbartifact_needs_rework" as Lightbulb.ArtifactID,
              status: "needs-rework",
              summary: "Decision needs rework before dispatch.",
            }),
          ],
        }),
      )

      expect(result.outcome).toBe("blocked")
      if (result.outcome === "ready") throw new Error("expected decision hold")
      expect(result.decisionHolds.map((hold) => [hold.artifactID, hold.status])).toEqual([
        ["lbartifact_rejected_decision" as Lightbulb.ArtifactID, "rejected"],
        ["lbartifact_superseded_without_replacement" as Lightbulb.ArtifactID, "superseded"],
        ["lbartifact_needs_rework" as Lightbulb.ArtifactID, "needs-rework"],
      ])
    }),
  )

  it.effect("uses an accepted replacement for a superseded decision", () =>
    Effect.gen(function* () {
      const oldDecisionID = "lbartifact_old_decision" as Lightbulb.ArtifactID
      const replacementID = "lbartifact_replacement_decision" as Lightbulb.ArtifactID
      const result = requireReady(
        yield* assembleContextBundle(
          readyInput(memoryStorage().storage, {
            decisionArtifacts: [
              decisionHandle({
                id: oldDecisionID,
                status: "superseded",
                summary: "Old ADR replaced by the accepted ADR.",
                supersededByArtifactID: replacementID,
              }),
              decisionHandle({
                id: replacementID,
                status: "accepted",
                summary: "Accepted replacement ADR.",
                supersedesArtifactID: oldDecisionID,
              }),
            ],
          }),
        ),
      )

      expect(result.manifest.decisionReferences.map((artifact) => artifact.artifactID)).toEqual([replacementID])
      expect(result.manifest.decisionReferences[0]?.decision.supersedesArtifactID).toBe(oldDecisionID)
    }),
  )

  it.effect("returns a checkpoint outcome when the context budget is exceeded", () =>
    Effect.gen(function* () {
      const result = yield* assembleContextBundle(
        readyInput(memoryStorage().storage, {
          policy: {
            ...defaultContextBundlePolicy,
            maxContextUnits: 1,
            onContextBudgetExceeded: "checkpoint",
          },
        }),
      )

      expect(result.outcome).toBe("checkpoint")
      if (result.outcome === "ready") throw new Error("expected context budget hold")
      expect(result.reason).toBe("context_budget_exceeded")
      expect(result.policyHolds[0]).toMatchObject({
        issueRef: "#32",
        gateID,
        reason: "context_budget_exceeded",
      })
      expect(result.estimatedContextUnits).toBeGreaterThan(1)
    }),
  )

  it.effect("rejects oversized raw transcript or log content with a deterministic stopped outcome", () =>
    Effect.gen(function* () {
      const result = yield* assembleContextBundle(
        readyInput(memoryStorage().storage, {
          policy: {
            ...defaultContextBundlePolicy,
            allowRawTranscriptContent: true,
            rawTranscriptMaxBytes: 16,
          },
          sourceExcerpts: [
            {
              handle: "artifact://raw-worker-log",
              label: "raw worker log",
              kind: "raw_log",
              text: "RAW MODEL STREAM ".repeat(20),
            },
          ],
        }),
      )

      expect(result.outcome).toBe("stopped")
      if (result.outcome === "ready") throw new Error("expected raw transcript rejection")
      expect(result.reason).toBe("raw_transcript_rejected")
      expect(result.policyHolds[0]?.summary).toBe("Raw transcript/log source artifact://raw-worker-log is 340 bytes; limit is 16.")
      expect(JSON.stringify(result)).not.toContain("RAW MODEL STREAM RAW MODEL STREAM")
    }),
  )

  it.effect("refreshes the manifest handle when source artifact evidence changes", () =>
    Effect.gen(function* () {
      const memory = memoryStorage()
      const first = requireReady(
        yield* assembleContextBundle(
          readyInput(memory.storage, {
            artifactHandles: [artifactHandle({ id: "lbartifact_plan" as Lightbulb.ArtifactID, checksum: "sha256:" + "2".repeat(64) })],
          }),
        ),
      )
      const refreshed = requireReady(
        yield* assembleContextBundle(
          readyInput(memory.storage, {
            artifactHandles: [artifactHandle({ id: "lbartifact_plan" as Lightbulb.ArtifactID, checksum: "sha256:" + "3".repeat(64) })],
          }),
        ),
      )

      expect(refreshed.reused).toBe(false)
      expect(refreshed.manifest.handle.id).not.toBe(first.manifest.handle.id)
      expect(memory.manifests.size).toBe(2)
    }),
  )

  it.effect("reuses the existing manifest when the same source handles are retried", () =>
    Effect.gen(function* () {
      const memory = memoryStorage()
      const first = requireReady(yield* assembleContextBundle(readyInput(memory.storage, { now: 1 })))
      const retry = requireReady(yield* assembleContextBundle(readyInput(memory.storage, { now: 999 })))

      expect(retry.reused).toBe(true)
      expect(retry.manifest.handle.id).toBe(first.manifest.handle.id)
      expect(retry.manifest.assembledAt).toBe(1)
      expect(memory.manifests.size).toBe(1)
    }),
  )

  it.effect("maps approval and cost policy violations to blocked outcomes", () =>
    Effect.gen(function* () {
      const approval = yield* assembleContextBundle(
        readyInput(memoryStorage().storage, {
          policy: {
            ...defaultContextBundlePolicy,
            approvalRequired: true,
            approvalGranted: false,
          },
        }),
      )
      const cost = yield* assembleContextBundle(
        readyInput(memoryStorage().storage, {
          policy: {
            ...defaultContextBundlePolicy,
            estimatedCostUsd: 2,
            remainingCostBudgetUsd: 1,
          },
        }),
      )

      expect(approval.outcome).toBe("blocked")
      if (approval.outcome === "ready") throw new Error("expected approval block")
      expect(approval.reason).toBe("approval_required")
      expect(cost.outcome).toBe("blocked")
      if (cost.outcome === "ready") throw new Error("expected cost block")
      expect(cost.reason).toBe("cost_budget_exceeded")
    }),
  )
})

function memoryStorage() {
  const manifests = new Map<string, ContextBundleManifest>()
  const storage: ContextBundleStorage = {
    readManifest: (fingerprint) => Effect.succeed(manifests.get(fingerprint)),
    writeManifest: (manifest) =>
      Effect.sync(() => {
        const existing = manifests.get(manifest.sourceFingerprint)
        if (existing) return existing
        manifests.set(manifest.sourceFingerprint, manifest)
        return manifest
      }),
  }
  return { manifests, storage }
}

function readyInput(
  storage: ContextBundleStorage,
  input?: {
    readonly artifactHandles?: readonly Lightbulb.ArtifactHandle[]
    readonly decisionArtifacts?: readonly Lightbulb.DecisionArtifactHandle[]
    readonly policy?: ContextBundleAssemblyInput["policy"]
    readonly sourceExcerpts?: ContextBundleAssemblyInput["sourceExcerpts"]
    readonly now?: number
  },
): ContextBundleAssemblyInput {
  return {
    taskPacket: {
      accountID,
      taskPacketID,
      title: "Assemble bounded context bundle",
      objective: "Create a compact worker context manifest without raw transcripts.",
      workerRole: "implementation worker",
    },
    workItem: {
      issueRef: "#32",
      title: "Slice 23 context bundle assembly",
      labels: ["ready-for-agent", "loop-harness", "context-rot"],
      ready: true,
      summary: "Build the first bounded worker context bundle seam.",
      instructions: "Use the issue summary, PRD, ADR, artifact handles, and verification gates. " + "Detailed instruction. ".repeat(180),
    },
    parent: { goalID, loopID, runID, gateID },
    artifactHandles:
      input?.artifactHandles ?? [
        artifactHandle({
          id: "lbartifact_prd" as Lightbulb.ArtifactID,
          type: "prd",
          uri: "docs/lightbulb/prd/account-orchestration-harness.md",
          summary: "Parent PRD handle.",
          checksum: "sha256:" + "1".repeat(64),
        }),
        artifactHandle({ id: "lbartifact_plan" as Lightbulb.ArtifactID, checksum: "sha256:" + "2".repeat(64) }),
      ],
    decisionArtifacts:
      input?.decisionArtifacts ?? [
        decisionHandle({
          id: "lbartifact_adr" as Lightbulb.ArtifactID,
          status: "accepted",
          summary: "Accepted ADR for context-rot delegation.",
        }),
      ],
    verification: [
      {
        summary: "Run focused context bundle tests from packages/core.",
        gateID,
      },
      {
        summary: "Run bun typecheck from packages/core.",
        artifactID: "lbartifact_plan" as Lightbulb.ArtifactID,
      },
    ],
    sourceExcerpts:
      input?.sourceExcerpts ?? [
        {
          handle: "artifact://issue-32/prd-excerpt",
          label: "PRD excerpt",
          kind: "excerpt",
          text: "Full PRD body that should not be embedded. " + "bounded context bundles ".repeat(80),
        },
      ],
    policy: input?.policy ?? defaultContextBundlePolicy,
    now: input?.now ?? 123,
    storage,
  }
}

function artifactHandle(input: {
  readonly id: Lightbulb.ArtifactID
  readonly type?: Lightbulb.ArtifactType
  readonly uri?: string
  readonly summary?: string
  readonly checksum?: string
  readonly source?: Lightbulb.ArtifactSourceReferences
}): Lightbulb.ArtifactHandle {
  return {
    id: input.id,
    type: input.type ?? "plan",
    uri: input.uri ?? "artifact://issue-32/" + input.id,
    summary: input.summary ?? "Relevant plan artifact handle.",
    status: "registered",
    integrity: {
      status: "verified",
      checksum: input.checksum ?? "sha256:" + "0".repeat(64),
      checkedAt: 1,
      uncheckedReason: null,
      expectedSizeBytes: 12,
      actualChecksum: null,
      actualSizeBytes: null,
    },
    retentionPolicy: { mode: "keep" },
    retentionDecision: "keep",
    producerKind: "harness",
    producerRunID: null,
    producerWorkerID: null,
    source: input.source ?? { issueRef: "#32", goalID, runID },
    lineage: [],
  }
}

function decisionHandle(input: {
  readonly id: Lightbulb.ArtifactID
  readonly status: Lightbulb.DecisionArtifactStatus
  readonly summary: string
  readonly type?: Lightbulb.DecisionArtifactType
  readonly supersedesArtifactID?: Lightbulb.ArtifactID
  readonly supersededByArtifactID?: Lightbulb.ArtifactID
}): Lightbulb.DecisionArtifactHandle {
  const type = input.type ?? "adr"
  return {
    ...artifactHandle({
      id: input.id,
      type,
      uri: "docs/lightbulb/adr/0004-context-rot-delegation-policy.md",
      summary: input.summary,
      checksum: "sha256:" + "a".repeat(64),
      source: { issueRef: "#32", goalID, gateID },
    }),
    type,
    decision: {
      title: "Context rot delegation policy",
      status: input.status,
      owner: "architecture",
      reviewer: "maintainer",
      supersedesArtifactID: input.supersedesArtifactID ?? null,
      supersededByArtifactID: input.supersededByArtifactID ?? null,
    },
  }
}

function requireReady(result: ContextBundleAssemblyResult) {
  if (result.outcome !== "ready") throw new Error("expected ready context bundle, got " + result.outcome)
  return result
}
