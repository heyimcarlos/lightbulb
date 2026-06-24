import type { Lightbulb } from "../lightbulb"
import { readLoopProfileMetadata } from "./loop-profile"
import { rollupLoopBudget } from "./budget-ledger"

export type OperatorExportSection = "all" | "state" | "budget" | "run-log"

export type OperatorExportAccess = {
  readonly all: string
  readonly state: string
  readonly budget: string
  readonly runLog: string
}

export type OperatorStateItem = {
  readonly id: string
  readonly kind: string
  readonly status: string
  readonly title: string
  readonly summary: string
  readonly url?: string
  readonly issueRef?: string
  readonly action?: string
  readonly handles: readonly string[]
}

export type OperatorStateExport = {
  readonly highPriorityActive: readonly OperatorStateItem[]
  readonly watch: readonly OperatorStateItem[]
  readonly humanInbox: readonly OperatorStateItem[]
  readonly recentNoiseIgnored: readonly OperatorStateItem[]
  readonly resolvedRecent: readonly OperatorStateItem[]
}

export type OperatorBudgetLoopExport = {
  readonly loopID: Lightbulb.LoopID
  readonly goalID: Lightbulb.GoalID
  readonly profileID: string | null
  readonly kind: Lightbulb.LoopKind
  readonly status: Lightbulb.LoopStatus
  readonly state: "open" | "held" | "exhausted" | "unknown"
  readonly reason: string | null
  readonly exhausted: boolean
  readonly exhaustedReasons: readonly string[]
  readonly unknownReasons: readonly string[]
  readonly used: Lightbulb.LoopBudgetUsageUnits
  readonly remaining: Lightbulb.LoopBudgetRemainingUnits & {
    readonly workerSpawnsForActiveRun: number | null
  }
  readonly limits: (Lightbulb.LoopBudgetLimits & {
    readonly maxWorkerSpawnsPerRun: number | null
  }) | null
  readonly workerSpawnPolicy: {
    readonly status: "configured" | "not_configured"
    readonly reason: string | null
  }
  readonly resetsAt: number
}

export type OperatorBudgetExport = {
  readonly killSwitch: {
    readonly active: boolean
    readonly status: Lightbulb.AccountStatus
    readonly reason: string | null
  }
  readonly totals: {
    readonly loops: number
    readonly open: number
    readonly held: number
    readonly exhausted: number
    readonly unknown: number
    readonly maxRunsPerDay: number | null
    readonly maxTokenUnits: number | null
    readonly maxCostUnits: number | null
    readonly maxContextUnits: number | null
    readonly maxApprovals: number | null
    readonly maxWorkerSpawnsPerRun: number | null
    readonly remainingRunsToday: number | null
    readonly remainingTokenUnits: number | null
    readonly remainingCostUnits: number | null
    readonly remainingContextUnits: number | null
    readonly remainingApprovals: number | null
    readonly remainingWorkerSpawnsForActiveRun: number | null
  }
  readonly loops: readonly OperatorBudgetLoopExport[]
}

export type OperatorRunLogEntry = {
  readonly runID: Lightbulb.RunID
  readonly loopID: Lightbulb.LoopID
  readonly goalID: Lightbulb.GoalID | null
  readonly profileID: string | null
  readonly profile: string | null
  readonly status: Lightbulb.RunStatus
  readonly outcome: "queued" | "running" | "blocked" | "complete" | "failed"
  readonly startedAt: number
  readonly completedAt: number | null
  readonly durationMs: number | null
  readonly itemsFound: readonly OperatorStateItem[]
  readonly actions: readonly string[]
  readonly escalations: readonly string[]
  readonly usageEstimate: {
    readonly costUnits: number
    readonly tokenUnits: number
    readonly contextUnits: number
    readonly approvalCount: number
  }
  readonly handles: {
    readonly workerIDs: readonly Lightbulb.WorkerID[]
    readonly taskPacketIDs: readonly Lightbulb.TaskPacketID[]
    readonly launchAttemptIDs: readonly Lightbulb.WorkerLaunchAttemptID[]
    readonly gateIDs: readonly Lightbulb.GateID[]
    readonly artifactIDs: readonly Lightbulb.ArtifactID[]
    readonly reportURIs: readonly string[]
  }
}

export type OperatorRunLogExport = {
  readonly format: "jsonl-style"
  readonly entries: readonly OperatorRunLogEntry[]
}

export type OperatorExport = {
  readonly account: {
    readonly id: Lightbulb.AccountID
    readonly name: string
    readonly status: Lightbulb.AccountStatus
  }
  readonly generatedAt: number
  readonly access: OperatorExportAccess
  readonly state: OperatorStateExport
  readonly budget: OperatorBudgetExport
  readonly runLog: OperatorRunLogExport
}

export function buildOperatorExport(
  graph: Lightbulb.AccountGraph,
  schedulerTickEvents: Lightbulb.AccountGraph["events"],
  input: {
    readonly now: number
  },
): OperatorExport {
  return {
    account: {
      id: graph.account.id,
      name: graph.account.name,
      status: graph.account.status,
    },
    generatedAt: input.now,
    access: operatorExportAccess(graph.account.id),
    state: buildStateExport(graph, schedulerTickEvents),
    budget: buildBudgetExport(graph, input.now),
    runLog: {
      format: "jsonl-style",
      entries: graph.runs
        .slice()
        .sort((a, b) => b.started_at - a.started_at || a.id.localeCompare(b.id))
        .map((run) => runLogEntry(graph, run)),
    },
  }
}

function operatorExportAccess(accountID: Lightbulb.AccountID): OperatorExportAccess {
  const base = "lightbulb operator-export --account " + accountID
  return {
    all: base,
    state: base + " --section state",
    budget: base + " --section budget",
    runLog: base + " --section run-log",
  }
}

function buildStateExport(
  graph: Lightbulb.AccountGraph,
  schedulerTickEvents: Lightbulb.AccountGraph["events"],
): OperatorStateExport {
  return {
    highPriorityActive: [
      ...graph.discoveryCandidates.filter((candidate) => candidate.section === "top_actionable").map(candidateItem),
      ...graph.runs
        .filter((run) => run.status === "queued" || run.status === "running")
        .map((run) => runItem(graph, run, "active run")),
      ...graph.workerLaunchAttempts
        .filter((attempt) => attempt.status === "requested" || attempt.status === "launching" || attempt.status === "running")
        .map(launchAttemptItem),
      ...schedulerTickEvents.slice(0, 3).map(schedulerTickItem),
    ].slice(0, 12),
    watch: graph.discoveryCandidates.filter((candidate) => candidate.section === "watch").map(candidateItem),
    humanInbox: [
      ...graph.discoveryCandidates.filter((candidate) => candidate.section === "needs_human").map(candidateItem),
      ...graph.gates
        .filter((gate) => gate.status === "pending" || gate.status === "blocked")
        .map((gate) => gateItem(gate, "human gate")),
      ...graph.taskPackets
        .filter((packet) => packet.status === "ready" || packet.status === "claimed")
        .map(taskPacketItem),
      ...graph.issueMutationOutbox
        .filter((item) => item.status === "ready" || item.status === "held")
        .map(issueMutationItem),
    ].slice(0, 12),
    recentNoiseIgnored: [
      ...graph.discoveryCandidates.filter((candidate) => candidate.section === "noise").map(candidateItem),
      ...graph.discoveryCandidates.filter((candidate) => candidate.section === "possible_duplicates").map(candidateItem),
    ].slice(0, 12),
    resolvedRecent: [
      ...graph.discoveryCandidates.filter((candidate) => candidate.section === "recent_resolved").map(candidateItem),
      ...graph.runs
        .filter((run) => run.status === "complete" || run.status === "failed")
        .slice(-5)
        .reverse()
        .map((run) => runItem(graph, run, "recent run")),
    ].slice(0, 12),
  }
}

function buildBudgetExport(graph: Lightbulb.AccountGraph, now: number): OperatorBudgetExport {
  const loops = graph.loops.map((loop) => budgetLoopExport(graph, loop, now))
  const configured = loops.filter((loop) => loop.limits !== null)
  return {
    killSwitch: {
      active: graph.account.status !== "active",
      status: graph.account.status,
      reason: graph.account.status === "active" ? null : "account_" + graph.account.status,
    },
    totals: {
      loops: loops.length,
      open: loops.filter((loop) => loop.state === "open").length,
      held: loops.filter((loop) => loop.state === "held").length,
      exhausted: loops.filter((loop) => loop.state === "exhausted").length,
      unknown: loops.filter((loop) => loop.state === "unknown").length,
      maxRunsPerDay: sumOptional(configured.map((loop) => loop.limits?.maxRunsPerDay)),
      maxTokenUnits: sumOptional(configured.map((loop) => loop.limits?.maxTokenUnits)),
      maxCostUnits: sumOptional(configured.map((loop) => loop.limits?.maxCostUnits)),
      maxContextUnits: sumOptional(configured.map((loop) => loop.limits?.maxContextUnits)),
      maxApprovals: sumNullable(configured.map((loop) => loop.limits?.maxApprovals ?? null)),
      maxWorkerSpawnsPerRun: null,
      remainingRunsToday: sumOptional(configured.map((loop) => loop.remaining.runsToday)),
      remainingTokenUnits: sumOptional(configured.map((loop) => loop.remaining.tokenUnits)),
      remainingCostUnits: sumOptional(configured.map((loop) => loop.remaining.costUnits)),
      remainingContextUnits: sumOptional(configured.map((loop) => loop.remaining.contextUnits)),
      remainingApprovals: sumNullable(configured.map((loop) => loop.remaining.approvalCount)),
      remainingWorkerSpawnsForActiveRun: null,
    },
    loops,
  }
}

function budgetLoopExport(
  graph: Lightbulb.AccountGraph,
  loop: Lightbulb.AccountGraph["loops"][number],
  now: number,
): OperatorBudgetLoopExport {
  const budget = rollupLoopBudget({ loop, runs: graph.runs, usage: graph.budgetUsage, now })
  const profile = readLoopProfileMetadata(loop.metadata ?? null)
  return {
    loopID: budget.loopID,
    goalID: budget.goalID,
    profileID: profile?.profileID ?? null,
    kind: loop.kind,
    status: loop.status,
    state: budget.state,
    reason: budget.reason,
    exhausted: budget.exhausted,
    exhaustedReasons: budget.exhaustedReasons,
    unknownReasons: budget.unknownReasons,
    used: budget.used,
    remaining: {
      ...budget.remaining,
      workerSpawnsForActiveRun: null,
    },
    limits: budget.limits
      ? {
          ...budget.limits,
          maxWorkerSpawnsPerRun: null,
        }
      : null,
    workerSpawnPolicy: {
      status: "not_configured",
      reason: "worker_spawn_budget_not_configured",
    },
    resetsAt: budget.resetsAt,
  }
}

function runLogEntry(
  graph: Lightbulb.AccountGraph,
  run: Lightbulb.AccountGraph["runs"][number],
): OperatorRunLogEntry {
  const loop = graph.loops.find((item) => item.id === run.loop_id)
  const profile = loop ? readLoopProfileMetadata(loop.metadata ?? null) : undefined
  const workers = graph.workers.filter((worker) => worker.run_id === run.id)
  const workerIDs = new Set(workers.map((worker) => worker.id))
  const taskPackets = graph.taskPackets.filter((packet) => workerIDs.has(packet.worker_id))
  const launchAttempts = graph.workerLaunchAttempts.filter((attempt) => attempt.run_id === run.id)
  const gates = graph.gates.filter((gate) => gate.run_id === run.id)
  const artifacts = graph.artifacts.filter((artifact) => artifact.producer_run_id === run.id || artifact.source_run_id === run.id)
  const usage = graph.budgetUsage.filter((entry) => entry.run_id === run.id)
  return {
    runID: run.id,
    loopID: run.loop_id,
    goalID: loop?.goal_id ?? null,
    profileID: profile?.profileID ?? null,
    profile: profile?.registry?.name ?? profile?.profileID ?? null,
    status: run.status,
    outcome: run.status,
    startedAt: run.started_at,
    completedAt: run.completed_at,
    durationMs: run.completed_at === null ? null : Math.max(0, run.completed_at - run.started_at),
    itemsFound: launchAttempts.flatMap(launchIssueItem),
    actions: [
      ...taskPackets.map((packet) => "task packet " + packet.status + ": " + packet.title),
      ...launchAttempts.map((attempt) => "worker launch " + attempt.status + ": " + attempt.summary),
      ...artifacts.map((artifact) => "artifact " + artifact.status + ": " + artifact.uri),
    ].slice(0, 12),
    escalations: [
      ...gates
        .filter((gate) => gate.status === "pending" || gate.status === "blocked" || gate.status === "failed")
        .map((gate) => "gate " + gate.status + ": " + gate.summary),
      ...workers
        .filter((worker) => worker.status === "blocked" || worker.status === "failed")
        .map((worker) => "worker " + worker.status + ": " + worker.summary),
      ...launchAttempts
        .filter((attempt) => attempt.status === "blocked" || attempt.status === "launch_failed")
        .map((attempt) => "launch " + attempt.status + ": " + attempt.summary),
    ].slice(0, 12),
    usageEstimate: {
      costUnits: sumUsage(usage, "cost_units"),
      tokenUnits: sumUsage(usage, "token_units"),
      contextUnits: sumUsage(usage, "context_units"),
      approvalCount: sumUsage(usage, "approval_count"),
    },
    handles: {
      workerIDs: workers.map((worker) => worker.id),
      taskPacketIDs: taskPackets.map((packet) => packet.id),
      launchAttemptIDs: launchAttempts.map((attempt) => attempt.id),
      gateIDs: gates.map((gate) => gate.id),
      artifactIDs: artifacts.map((artifact) => artifact.id),
      reportURIs: artifacts.filter((artifact) => artifact.type === "report").map((artifact) => artifact.uri),
    },
  }
}

function candidateItem(candidate: Lightbulb.AccountGraph["discoveryCandidates"][number]): OperatorStateItem {
  return {
    id: candidate.source_id,
    kind: candidate.source_kind,
    status: candidate.status,
    title: candidate.title,
    summary: candidate.reason,
    url: candidate.url,
    issueRef: candidate.source_handles.issueRef,
    action: candidate.suggested_action,
    handles: [
      candidate.source_handles.sourceRef,
      candidate.source_handles.issueHandle,
      candidate.source_handles.promptHandle,
      candidate.source_handles.instructionHandle,
    ].filter((handle): handle is string => typeof handle === "string" && handle.length > 0),
  }
}

function runItem(graph: Lightbulb.AccountGraph, run: Lightbulb.AccountGraph["runs"][number], title: string): OperatorStateItem {
  const loop = graph.loops.find((item) => item.id === run.loop_id)
  return {
    id: run.id,
    kind: "run",
    status: run.status,
    title,
    summary: run.summary,
    handles: compactHandles([run.loop_id, loop?.goal_id]),
  }
}

function launchAttemptItem(attempt: Lightbulb.AccountGraph["workerLaunchAttempts"][number]): OperatorStateItem {
  return {
    id: attempt.id,
    kind: "worker_launch",
    status: attempt.status,
    title: "worker launch",
    summary: attempt.summary,
    issueRef: stringMetadata(attempt.metadata, "issue_ref"),
    action: attempt.trigger,
    handles: compactHandles([
      attempt.run_id,
      attempt.worker_id,
      attempt.task_packet_id,
      attempt.report_uri,
      attempt.log_uri,
    ]),
  }
}

function gateItem(gate: Lightbulb.AccountGraph["gates"][number], title: string): OperatorStateItem {
  return {
    id: gate.id,
    kind: gate.kind,
    status: gate.status,
    title,
    summary: gate.summary,
    handles: compactHandles([gate.run_id, gate.artifact_id]),
  }
}

function taskPacketItem(packet: Lightbulb.AccountGraph["taskPackets"][number]): OperatorStateItem {
  return {
    id: packet.id,
    kind: "task_packet",
    status: packet.status,
    title: packet.title,
    summary: "Worker task packet is " + packet.status + ".",
    handles: [packet.worker_id],
  }
}

function issueMutationItem(item: Lightbulb.AccountGraph["issueMutationOutbox"][number]): OperatorStateItem {
  return {
    id: item.id,
    kind: "issue_mutation",
    status: item.status,
    title: item.action,
    summary: item.apply_summary,
    url: item.target_issue_url ?? undefined,
    issueRef: item.target_issue_ref ?? undefined,
    action: item.action,
    handles: compactHandles([item.source_run_id, item.source_loop_id, item.source_goal_id]),
  }
}

function schedulerTickItem(event: Lightbulb.AccountGraph["events"][number]): OperatorStateItem {
  return {
    id: event.id,
    kind: "scheduler_tick",
    status: "recorded",
    title: "scheduler tick",
    summary: event.summary,
    handles: [event.aggregate_id],
  }
}

function launchIssueItem(attempt: Lightbulb.AccountGraph["workerLaunchAttempts"][number]): OperatorStateItem[] {
  const issueRef = stringMetadata(attempt.metadata, "issue_ref")
  const workItemRef = stringMetadata(attempt.metadata, "work_item_ref")
  if (!issueRef && !workItemRef) return []
  return [
    {
      id: workItemRef ?? issueRef ?? attempt.id,
      kind: "issue",
      status: attempt.status,
      title: issueRef ?? "worker issue",
      summary: attempt.summary,
      issueRef,
      action: attempt.trigger,
      handles: [attempt.id, attempt.report_uri].filter((handle): handle is string => typeof handle === "string"),
    },
  ]
}

function sumUsage(
  usage: readonly Lightbulb.AccountGraph["budgetUsage"][number][],
  key: "cost_units" | "token_units" | "context_units" | "approval_count",
) {
  return usage.map((entry) => entry[key]).reduce((total, value) => total + value, 0)
}

function sumOptional(values: readonly (number | null | undefined)[]) {
  const present = values.filter((value): value is number => typeof value === "number")
  if (present.length === 0) return null
  return present.reduce((total, value) => total + value, 0)
}

function sumNullable(values: readonly (number | null)[]) {
  const present = values.filter((value): value is number => typeof value === "number")
  if (present.length === 0) return null
  return present.reduce((total, value) => total + value, 0)
}

function stringMetadata(data: Record<string, unknown> | null | undefined, key: string) {
  const value = data?.[key]
  return typeof value === "string" ? value : undefined
}

function compactHandles(values: readonly (string | null | undefined)[]) {
  return values.flatMap((value) => (typeof value === "string" && value.length > 0 ? [value] : []))
}
