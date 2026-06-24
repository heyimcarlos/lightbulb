import type { Lightbulb } from "../lightbulb"
import { readLoopProfileMetadata } from "./loop-profile"
import type { OperatorExport, OperatorRunLogEntry } from "./operator-export"

export type LoopReadinessLevel = "draft" | "report-only" | "assisted" | "unattended-ready"

export type LoopReadinessMissingReason =
  | "missing_profile_metadata"
  | "missing_state_read_model"
  | "missing_pickup_packet"
  | "missing_verifier_lane"
  | "missing_human_gate"
  | "missing_budget_policy"
  | "missing_run_log_evidence"
  | "missing_connector_capability"
  | "missing_worktree_policy"
  | "missing_recent_activity"
  | "missing_safe_write_policy"

export type LoopReadinessCheckKey =
  | "profile_metadata"
  | "state_read_model"
  | "pickup_packet"
  | "verifier_lane"
  | "human_gate"
  | "budget_policy"
  | "run_log_evidence"
  | "connector_capability"
  | "worktree_policy"
  | "recent_activity"
  | "safe_write_policy"

export type LoopReadinessCheck = {
  readonly key: LoopReadinessCheckKey
  readonly status: "pass" | "missing"
  readonly reason: LoopReadinessMissingReason | null
  readonly summary: string
}

export type LoopReadinessProfileAudit = {
  readonly loopID: Lightbulb.LoopID
  readonly goalID: Lightbulb.GoalID
  readonly kind: Lightbulb.LoopKind
  readonly status: Lightbulb.LoopStatus
  readonly profileID: string | null
  readonly profileName: string
  readonly level: LoopReadinessLevel
  readonly score: number
  readonly missingReasons: readonly LoopReadinessMissingReason[]
  readonly canRunUnattended: boolean
  readonly checks: readonly LoopReadinessCheck[]
}

export type LoopReadinessAudit = {
  readonly account: {
    readonly id: Lightbulb.AccountID
    readonly name: string
    readonly status: Lightbulb.AccountStatus
  }
  readonly generatedAt: number
  readonly level: LoopReadinessLevel
  readonly score: number
  readonly summary: string
  readonly access: {
    readonly all: string
  }
  readonly totals: {
    readonly profiles: number
    readonly draft: number
    readonly reportOnly: number
    readonly assisted: number
    readonly unattendedReady: number
  }
  readonly profiles: readonly LoopReadinessProfileAudit[]
}

type LoopReadinessEvidence = {
  readonly profile: ReturnType<typeof readLoopProfileMetadata>
  readonly runs: Lightbulb.AccountGraph["runs"]
  readonly workers: Lightbulb.AccountGraph["workers"]
  readonly taskPackets: Lightbulb.AccountGraph["taskPackets"]
  readonly gates: Lightbulb.AccountGraph["gates"]
  readonly launchAttempts: Lightbulb.AccountGraph["workerLaunchAttempts"]
  readonly runLogEntries: readonly OperatorRunLogEntry[]
  readonly events: Lightbulb.AccountGraph["events"]
}

export function buildLoopReadinessAudit(
  graph: Lightbulb.AccountGraph,
  operatorExport: OperatorExport,
  input: {
    readonly now: number
  },
): LoopReadinessAudit {
  const profiles = graph.loops.map((loop) => auditLoop(graph, operatorExport, loop))
  const totals = {
    profiles: profiles.length,
    draft: profiles.filter((profile) => profile.level === "draft").length,
    reportOnly: profiles.filter((profile) => profile.level === "report-only").length,
    assisted: profiles.filter((profile) => profile.level === "assisted").length,
    unattendedReady: profiles.filter((profile) => profile.level === "unattended-ready").length,
  }
  const level = accountLevel(profiles)
  const score = profiles.length === 0 ? 0 : Math.round(profiles.map((profile) => profile.score).reduce((total, value) => total + value, 0) / profiles.length)

  return {
    account: {
      id: graph.account.id,
      name: graph.account.name,
      status: graph.account.status,
    },
    generatedAt: input.now,
    level,
    score,
    summary: readinessSummary(level, totals),
    access: {
      all: "lightbulb readiness-audit --account " + graph.account.id,
    },
    totals,
    profiles,
  }
}

function auditLoop(
  graph: Lightbulb.AccountGraph,
  operatorExport: OperatorExport,
  loop: Lightbulb.AccountGraph["loops"][number],
): LoopReadinessProfileAudit {
  const runs = graph.runs.filter((run) => run.loop_id === loop.id)
  const runIDs = new Set(runs.map((run) => run.id))
  const workers = graph.workers.filter((worker) => runIDs.has(worker.run_id))
  const workerIDs = new Set(workers.map((worker) => worker.id))
  const evidence = {
    profile: readLoopProfileMetadata(loop.metadata ?? null),
    runs,
    workers,
    taskPackets: graph.taskPackets.filter((packet) => workerIDs.has(packet.worker_id)),
    gates: graph.gates.filter((gate) => runIDs.has(gate.run_id)),
    launchAttempts: graph.workerLaunchAttempts.filter((attempt) => runIDs.has(attempt.run_id)),
    runLogEntries: operatorExport.runLog.entries.filter((entry) => entry.loopID === loop.id),
    events: graph.events.filter((event) => event.aggregate_id === loop.id || runIDs.has(event.aggregate_id as Lightbulb.RunID)),
  } satisfies LoopReadinessEvidence
  const checks = loopChecks(loop, evidence)
  const missingReasons = checks.flatMap((check) => (check.reason ? [check.reason] : []))
  const level = profileLevel(missingReasons)

  return {
    loopID: loop.id,
    goalID: loop.goal_id,
    kind: loop.kind,
    status: loop.status,
    profileID: evidence.profile?.profileID ?? null,
    profileName: evidence.profile?.registry?.name ?? evidence.profile?.profileID ?? loop.kind,
    level,
    score: Math.round((checks.filter((check) => check.status === "pass").length / checks.length) * 100),
    missingReasons,
    canRunUnattended: level === "unattended-ready",
    checks,
  }
}

function loopChecks(
  loop: Lightbulb.AccountGraph["loops"][number],
  evidence: LoopReadinessEvidence,
): readonly LoopReadinessCheck[] {
  return [
    check(
      "profile_metadata",
      profileMetadataReady(evidence),
      "missing_profile_metadata",
      evidence.profile ? "Loop has valid profile metadata." : "Loop has no valid loop_profile metadata.",
    ),
    check(
      "state_read_model",
      stateReadModelReady(evidence),
      "missing_state_read_model",
      "Profile declares state and read-model ownership.",
    ),
    check(
      "pickup_packet",
      evidence.taskPackets.some((packet) => packet.status === "ready" || packet.status === "claimed" || packet.status === "complete"),
      "missing_pickup_packet",
      "Loop has a bounded task packet linked to a worker.",
    ),
    check(
      "verifier_lane",
      evidence.gates.some((gate) => gate.kind === "review" || gate.kind === "verification" || gate.kind === "policy"),
      "missing_verifier_lane",
      "Loop has a review, verification, or policy gate.",
    ),
    check(
      "human_gate",
      (evidence.profile?.registry?.humanGates.length ?? 0) > 0 || evidence.gates.some((gate) => gate.status === "pending" || gate.status === "blocked"),
      "missing_human_gate",
      "Loop has an explicit human gate or pending review gate.",
    ),
    check("budget_policy", budgetPolicyReady(evidence), "missing_budget_policy", "Loop has a bounded budget policy."),
    check(
      "run_log_evidence",
      evidence.runLogEntries.some((entry) => entry.actions.length > 0 || entry.handles.artifactIDs.length > 0 || entry.handles.reportURIs.length > 0),
      "missing_run_log_evidence",
      "Operator run log has compact actions or artifact handles.",
    ),
    check(
      "connector_capability",
      evidence.launchAttempts.length > 0 || metadataRecord(loop.metadata, "connector_capability") || metadataRecord(loop.metadata, "connectorCapability"),
      "missing_connector_capability",
      "Loop has connector/runtime launch capability evidence.",
    ),
    check(
      "worktree_policy",
      evidence.launchAttempts.some((attempt) => attempt.cwd.length > 0 && attempt.worktree_id !== null) ||
        metadataRecord(loop.metadata, "worktree_policy") ||
        metadataRecord(loop.metadata, "worktreePolicy"),
      "missing_worktree_policy",
      "Loop has worktree or ownership policy evidence.",
    ),
    check(
      "recent_activity",
      evidence.runs.length > 0 || evidence.events.length > 0,
      "missing_recent_activity",
      "Loop has recent run or event evidence.",
    ),
    check(
      "safe_write_policy",
      metadataRecord(loop.metadata, "safe_write_policy") || metadataRecord(loop.metadata, "safeWritePolicy"),
      "missing_safe_write_policy",
      "Loop declares safe-write policy before unattended promotion.",
    ),
  ]
}

function check(
  key: LoopReadinessCheckKey,
  passed: boolean,
  reason: LoopReadinessMissingReason,
  summary: string,
): LoopReadinessCheck {
  return {
    key,
    status: passed ? "pass" : "missing",
    reason: passed ? null : reason,
    summary,
  }
}

function profileMetadataReady(evidence: LoopReadinessEvidence) {
  return evidence.profile !== undefined && evidence.profile.registry !== null && evidence.profile.invalidProfileReasons.length === 0
}

function stateReadModelReady(evidence: LoopReadinessEvidence) {
  const registry = evidence.profile?.registry
  if (!registry) return false
  return registry.state.trim().length > 0 && registry.readModel.trim().length > 0
}

function budgetPolicyReady(evidence: LoopReadinessEvidence) {
  const budget = evidence.profile?.budget
  if (!budget) return false
  return (
    (budget.status === "open" || budget.status === "held") &&
    budget.maxRunsPerDay > 0 &&
    budget.maxTokens > 0 &&
    budget.maxCostUsd > 0 &&
    budget.maxContextTokens > 0
  )
}

function metadataRecord(metadata: Record<string, unknown> | null | undefined, key: string) {
  const value = metadata?.[key]
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function profileLevel(missingReasons: readonly LoopReadinessMissingReason[]): LoopReadinessLevel {
  if (missingReasons.includes("missing_profile_metadata") || missingReasons.includes("missing_state_read_model")) return "draft"
  if (
    missingReasons.includes("missing_pickup_packet") ||
    missingReasons.includes("missing_verifier_lane") ||
    missingReasons.includes("missing_human_gate") ||
    missingReasons.includes("missing_budget_policy")
  ) {
    return "report-only"
  }
  if (missingReasons.length > 0) return "assisted"
  return "unattended-ready"
}

function accountLevel(profiles: readonly LoopReadinessProfileAudit[]): LoopReadinessLevel {
  if (profiles.length === 0) return "draft"
  if (profiles.every((profile) => profile.level === "unattended-ready")) return "unattended-ready"
  if (profiles.some((profile) => profile.level === "draft")) return "draft"
  if (profiles.some((profile) => profile.level === "report-only")) return "report-only"
  return "assisted"
}

function readinessSummary(level: LoopReadinessLevel, totals: LoopReadinessAudit["totals"]) {
  if (totals.profiles === 0) return "No Lightbulb loop profiles are registered."
  return (
    `Account readiness is ${level}: ${totals.unattendedReady} unattended-ready, ` +
    `${totals.assisted} assisted, ${totals.reportOnly} report-only, ${totals.draft} draft.`
  )
}
