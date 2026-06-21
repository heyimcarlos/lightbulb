import type { AccountGraph, Dashboard, DashboardGate, DashboardLoop, DashboardRun, GoalStatus } from "../lightbulb"
import { retentionDecisionFor, storedArtifactIntegrity, toArtifactHandle } from "./artifact"
import type { GoalLifecycle, GoalRunTree, GoalSummary } from "./goal"
import type { LightbulbArtifactTable, LightbulbGateTable, LightbulbLoopTable, LightbulbRunTable } from "./sql"

export function toGoalRunTree(graph: AccountGraph, goal: GoalLifecycle): GoalRunTree {
  const loops = graph.loops.filter((loop) => loop.goal_id === goal.id)
  const loopIDs = new Set(loops.map((loop) => loop.id))
  const runs = graph.runs.filter((run) => loopIDs.has(run.loop_id))
  const runIDs = new Set(runs.map((run) => run.id))
  const workers = graph.workers.filter((worker) => runIDs.has(worker.run_id))
  const workerIDs = new Set(workers.map((worker) => worker.id))
  const artifacts = graph.artifacts.filter(
    (artifact) => artifact.producer_run_id !== null && runIDs.has(artifact.producer_run_id),
  )
  const goalGraph = {
    ...graph,
    runs,
    gates: graph.gates.filter((gate) => runIDs.has(gate.run_id)),
    artifactEdges: graph.artifactEdges.filter((edge) => runIDs.has(edge.consumer_run_id)),
  }

  return {
    goal: toGoalSummary(goal),
    loops: loops.map((loop) => toDashboardLoop(goalGraph, loop, runs)),
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
): DashboardLoop {
  return {
    id: loop.id,
    kind: loop.kind,
    status: loop.status,
    summary: loop.summary,
    runs: runs.filter((run) => run.loop_id === loop.id).map((run) => toDashboardRun(graph, run)),
  }
}

function toDashboardRun(graph: AccountGraph, run: typeof LightbulbRunTable.$inferSelect): DashboardRun {
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
      .map((artifact) => toGraphArtifactHandle(artifact, graph)),
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
