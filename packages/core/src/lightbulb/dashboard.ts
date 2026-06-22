import type {
  AccountGraph,
  Dashboard,
  DashboardGate,
  DashboardLoop,
  DashboardRun,
  DashboardSchedulerTick,
  EventID,
  GoalStatus,
  LoopID,
  LoopKind,
  RunID,
} from "../lightbulb"
import { retentionDecisionFor, storedArtifactIntegrity, toArtifactHandle } from "./artifact"
import type { GoalLifecycle, GoalRunTree, GoalSummary } from "./goal"
import { classifyLoopSchedule } from "./scheduler"
import type {
  LightbulbArtifactTable,
  LightbulbEventTable,
  LightbulbGateTable,
  LightbulbLoopTable,
  LightbulbRunTable,
} from "./sql"
import type { LoopScheduleClassification } from "./scheduler"

export function toGoalRunTree(graph: AccountGraph, goal: GoalLifecycle): GoalRunTree {
  const loops = graph.loops.filter((loop) => loop.goal_id === goal.id)
  const loopIDs = new Set(loops.map((loop) => loop.id))
  const runs = graph.runs.filter((run) => loopIDs.has(run.loop_id))
  const runIDs = new Set(runs.map((run) => run.id))
  const workers = graph.workers.filter((worker) => runIDs.has(worker.run_id))
  const workerIDs = new Set(workers.map((worker) => worker.id))
  const gates = graph.gates.filter((gate) => runIDs.has(gate.run_id))
  const gateIDs = new Set(gates.map((gate) => gate.id))
  const artifacts = graph.artifacts.filter(
    (artifact) =>
      (artifact.producer_run_id !== null && runIDs.has(artifact.producer_run_id)) ||
      artifact.source_goal_id === goal.id ||
      (artifact.source_loop_id !== null && loopIDs.has(artifact.source_loop_id)) ||
      (artifact.source_run_id !== null && runIDs.has(artifact.source_run_id)) ||
      (artifact.source_gate_id !== null && gateIDs.has(artifact.source_gate_id)) ||
      graph.artifactEdges.some((edge) => edge.artifact_id === artifact.id && runIDs.has(edge.consumer_run_id)),
  )
  const goalGraph = {
    ...graph,
    runs,
    gates,
    artifactEdges: graph.artifactEdges.filter((edge) => runIDs.has(edge.consumer_run_id)),
  }

  return {
    goal: toGoalSummary(goal),
    loops: loops.map((loop) => toDashboardLoop(goalGraph, loop, runs, graph)),
    taskPackets: graph.taskPackets
      .filter((packet) => workerIDs.has(packet.worker_id))
      .map((packet) => ({
        id: packet.id,
        workerID: packet.worker_id,
        title: packet.title,
        status: packet.status,
      })),
    gates: goalGraph.gates.map(toDashboardGate),
    artifactHandles: artifacts.map((artifact) => toGraphArtifactHandle(artifact, goalGraph, graph)),
  }
}

export function toDashboard(graph: AccountGraph): Dashboard {
  return {
    account: {
      id: graph.account.id,
      name: graph.account.name,
      status: graph.account.status,
    },
    goals: graph.goals.map((goal) => ({
      id: goal.id,
      title: goal.title,
      status: goal.status,
      summary: goal.summary,
      loops: graph.loops.filter((loop) => loop.goal_id === goal.id).map((loop) => toDashboardLoop(graph, loop)),
    })),
    inbox: {
      taskPackets: graph.taskPackets.map((packet) => ({
        id: packet.id,
        workerID: packet.worker_id,
        title: packet.title,
        status: packet.status,
      })),
      gates: graph.gates
        .filter((gate) => gate.status === "pending" || gate.status === "blocked")
        .map(toDashboardGate),
    },
    operations: {
      schedulerTicks: graph.events
        .filter((event) => event.type === "lightbulb.scheduler_tick.completed")
        .slice(-5)
        .reverse()
        .map(toDashboardSchedulerTick),
    },
    artifactHandles: graph.artifacts.map((artifact) => toGraphArtifactHandle(artifact, graph)),
  }
}

function isTerminalGoalStatus(status: GoalStatus) {
  return status === "completed" || status === "cancelled" || status === "stopped"
}

function toGoalSummary(goal: GoalLifecycle): GoalSummary {
  return {
    id: goal.id,
    title: goal.title,
    objective: goal.objective,
    sourceRef: goal.source_ref,
    ownerID: goal.owner_id,
    status: goal.status,
    summary: goal.summary,
    holdReason: goal.hold_reason,
    completionReason: goal.completion_reason,
    completedAt: goal.completed_at,
    timeCreated: goal.time_created,
    timeUpdated: goal.time_updated,
  }
}

function toDashboardLoop(
  graph: AccountGraph,
  loop: typeof LightbulbLoopTable.$inferSelect,
  runs: readonly (typeof LightbulbRunTable.$inferSelect)[] = graph.runs,
  retentionGraph = graph,
): DashboardLoop {
  const schedule = classifyLoopSchedule({ loop, runs: graph.runs, now: Date.now() })
  return {
    id: loop.id,
    kind: loop.kind,
    status: loop.status,
    summary: loop.summary,
    profileID: schedule.profileID,
    schedule: schedule.schedule,
    budget: schedule.budget,
    scheduleClassification: schedule.classification,
    scheduleReason: schedule.reason,
    runs: runs.filter((run) => run.loop_id === loop.id).map((run) => toDashboardRun(graph, run, retentionGraph)),
  }
}

function toDashboardRun(
  graph: AccountGraph,
  run: typeof LightbulbRunTable.$inferSelect,
  retentionGraph = graph,
): DashboardRun {
  return {
    id: run.id,
    status: run.status,
    reviewStatus: run.review_status,
    debugStatus: run.debug_status,
    gateStatus: run.gate_status,
    summary: run.summary,
    workers: graph.workers
      .filter((worker) => worker.run_id === run.id)
      .map((worker) => ({
        id: worker.id,
        role: worker.role,
        status: worker.status,
        summary: worker.summary,
      })),
    gates: graph.gates.filter((gate) => gate.run_id === run.id).map(toDashboardGate),
    artifacts: graph.artifacts
      .filter((artifact) => artifact.producer_run_id === run.id || artifact.source_run_id === run.id)
      .map((artifact) => toGraphArtifactHandle(artifact, graph, retentionGraph)),
  }
}

function toDashboardGate(row: typeof LightbulbGateTable.$inferSelect): DashboardGate {
  return {
    id: row.id,
    kind: row.kind,
    status: row.status,
    summary: row.summary,
    artifactID: row.artifact_id,
  }
}

function toDashboardSchedulerTick(row: typeof LightbulbEventTable.$inferSelect): DashboardSchedulerTick {
  return {
    id: row.id,
    timeCreated: row.time_created,
    trigger: typeof row.data.trigger === "string" ? row.data.trigger : "schedule",
    admittedCount: numberField(row.data, "admitted_count"),
    skippedCount: numberField(row.data, "skipped_count"),
    outcomeCount: numberField(row.data, "outcome_count"),
    source: isRecord(row.data.source) ? row.data.source : null,
    outcomes: Array.isArray(row.data.outcomes)
      ? row.data.outcomes
          .map(toDashboardSchedulerTickOutcome)
          .filter((outcome): outcome is NonNullable<typeof outcome> => outcome !== undefined)
      : [],
  }
}

function toDashboardSchedulerTickOutcome(value: unknown): DashboardSchedulerTick["outcomes"][number] | undefined {
  if (!isRecord(value)) return
  if (typeof value.loopID !== "string") return
  if (typeof value.kind !== "string") return
  if (value.outcome !== "admitted" && value.outcome !== "skipped") return
  return {
    loopID: value.loopID as LoopID,
    profileID: typeof value.profileID === "string" ? value.profileID : null,
    kind: value.kind as LoopKind,
    outcome: value.outcome,
    runID: typeof value.runID === "string" ? (value.runID as RunID) : null,
    eventID: typeof value.eventID === "string" ? (value.eventID as EventID) : null,
    classification: schedulerTickClassification(value.classification),
    reason: typeof value.reason === "string" ? value.reason : null,
  }
}

function schedulerTickClassification(value: unknown): LoopScheduleClassification | null {
  if (value === "due" || value === "not_due" || value === "disabled" || value === "budget_held") return value
  return null
}

function numberField(data: Record<string, unknown>, key: string) {
  return typeof data[key] === "number" ? data[key] : 0
}

function toGraphArtifactHandle(
  row: typeof LightbulbArtifactTable.$inferSelect,
  graph: AccountGraph,
  retentionGraph = graph,
) {
  const edges = graph.artifactEdges.filter((edge) => edge.artifact_id === row.id)
  const retentionEdges = retentionGraph.artifactEdges.filter((edge) => edge.artifact_id === row.id)
  return toArtifactHandle(row, edges, {
    integrity: storedArtifactIntegrity(row),
    retentionDecision: retentionDecisionFor(row, {
      consumerRuns: retentionGraph.runs.filter(
        (run) => retentionEdges.some((edge) => edge.consumer_run_id === run.id) || run.id === row.source_run_id,
      ),
      gates: retentionGraph.gates.filter(
        (gate) => gate.account_id === row.account_id && (gate.artifact_id === row.id || gate.id === row.source_gate_id),
      ),
      now: Date.now(),
      producerRun: retentionGraph.runs.find((run) => run.id === row.producer_run_id),
    }),
  })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
