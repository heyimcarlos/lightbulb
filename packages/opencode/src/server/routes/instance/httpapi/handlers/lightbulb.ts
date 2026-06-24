import { Lightbulb } from "@opencode-ai/core/lightbulb"
import { Effect } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { InstanceHttpApi } from "../api"

export const lightbulbHandlers = HttpApiBuilder.group(InstanceHttpApi, "lightbulb", (handlers) =>
  Effect.gen(function* () {
    const lightbulb = yield* Lightbulb.Service

    const stableDashboard = Effect.fn("LightbulbHttpApi.stableDashboard")(function* () {
      return {
        snapshot: toStableDashboardSnapshot(yield* lightbulb.readLatestDashboard()),
      }
    })

    const prReviewRoutes = Effect.fn("LightbulbHttpApi.prReviewRoutes")(function* () {
      return {
        routes: (yield* lightbulb.readActivePRReviewRoutes()).map(toPRReviewRouteResponse),
      }
    })

    return handlers.handle("stableDashboard", stableDashboard).handle("prReviewRoutes", prReviewRoutes)
  }),
)

function toStableDashboardSnapshot(dashboard: Lightbulb.Dashboard | undefined) {
  if (!dashboard) return undefined

  const goal = dashboard.goals.find((item) => item.status === "active") ?? dashboard.goals[0]
  const loop =
    goal?.loops.find((item) => item.runs.some((run) => run.status === "queued" || run.status === "running")) ??
    goal?.loops[0]
  const run =
    loop?.runs.find((item) => item.status === "queued" || item.status === "running") ??
    loop?.runs.find((item) => item.gates.some((gate) => gate.status === "pending" || gate.status === "blocked")) ??
    loop?.runs.at(-1)
  const worker =
    run?.workers.find((item) => item.status === "queued" || item.status === "running" || item.status === "blocked") ??
    run?.workers.at(-1)
  const gate =
    dashboard.inbox.gates.find((item) => item.status === "pending" || item.status === "blocked") ??
    run?.gates.find((item) => item.status === "pending" || item.status === "blocked") ??
    null
  const reportArtifact =
    run?.artifacts.filter((item) => item.type === "report").at(-1) ??
    run?.artifacts.at(-1) ??
    dashboard.artifactHandles.at(-1) ??
    null
  const pickupPacket =
    dashboard.inbox.taskPackets.find((item) => item.workerID === worker?.id) ?? dashboard.inbox.taskPackets[0] ?? null
  const runnerTick = dashboard.operations.schedulerTicks.at(-1) ?? null
  const selectedIssue =
    dashboard.inbox.discoveryCandidates.topActionable[0] ??
    dashboard.inbox.discoveryCandidates.needsHuman[0] ??
    dashboard.inbox.discoveryCandidates.watch[0] ??
    null
  const humanAction = dashboard.inbox.humanInbox.actionRequired[0] ?? null

  return {
    account: dashboard.account,
    destination: goal?.title ?? "Lightbulb builds Lightbulb stable loop v0",
    currentRoute: {
      ...(goal ? { goalID: goal.id } : {}),
      goalTitle: goal?.title ?? "No goal selected",
      goalStatus: goal?.status ?? "missing",
      ...(loop ? { loopID: loop.id, loopKind: loop.kind, loopStatus: loop.status } : {}),
      ...(run ? { runID: run.id, runStatus: run.status } : {}),
      currentStop: currentStop({ run, gate, worker }),
      summary: routeSummary({ goal, loop, run }),
    },
    ...(pickupPacket ? { pickupPacket } : {}),
    ...(selectedIssue
      ? {
          selectedIssue: {
            sourceID: selectedIssue.sourceID,
            title: selectedIssue.title,
            url: selectedIssue.url,
            status: selectedIssue.status,
            suggestedAction: selectedIssue.suggestedAction,
          },
        }
      : {}),
    ...(worker
      ? {
          activeWorker: {
            id: worker.id,
            role: worker.role,
            status: worker.status,
            summary: worker.summary,
            ...latestLaunchAttempt(worker),
          },
        }
      : {}),
    ...(reportArtifact
      ? {
          latestReportArtifact: {
            id: reportArtifact.id,
            type: reportArtifact.type,
            uri: reportArtifact.uri,
            summary: reportArtifact.summary,
            status: reportArtifact.status,
          },
        }
      : {}),
    ...(gate
      ? {
          reviewGate: {
            id: gate.id,
            kind: gate.kind,
            status: gate.status,
            summary: gate.summary,
            ...(gate.artifactID ? { artifactID: gate.artifactID } : {}),
          },
        }
      : {}),
    ...(runnerTick
      ? {
          runnerTick: {
            id: runnerTick.id,
            timeCreated: runnerTick.timeCreated,
            trigger: runnerTick.trigger,
            admittedCount: runnerTick.admittedCount,
            skippedCount: runnerTick.skippedCount,
            outcomeCount: runnerTick.outcomeCount,
          },
        }
      : {}),
    blockedReason: blockedReason({ loop, run, gate }),
    nextWakeSource: nextWakeSource({ loop, gate, runnerTick }),
    readyHumanAction: readyHumanAction({ humanAction, gate, reportArtifact, pickupPacket }),
  }
}

function toPRReviewRouteResponse(route: Lightbulb.PRReviewRouteSummary) {
  return {
    ...route,
    currentStop: route.currentStop ?? undefined,
    latestEvidence: route.latestEvidence ?? undefined,
    activeWorker: route.activeWorker ?? undefined,
    blockedReason: route.blockedReason ?? undefined,
    nextWakeSource: route.nextWakeSource ?? undefined,
    lastWokeAt: route.lastWokeAt ?? undefined,
  }
}

function currentStop(input: {
  readonly run?: Lightbulb.DashboardRun
  readonly gate: Lightbulb.DashboardGate | null
  readonly worker?: Lightbulb.DashboardRun["workers"][number]
}) {
  if (input.gate?.status === "pending") return "Review gate waiting for human steering"
  if (input.gate?.status === "blocked") return "Review gate blocked"
  if (input.worker?.status === "running" || input.worker?.status === "queued") return "Worker execution"
  if (input.run?.status === "queued") return "Run admitted"
  if (input.run?.status === "complete") return "Worker report ready"
  if (input.run?.status === "blocked") return "Run blocked"
  return "Waiting for runner tick"
}

function routeSummary(input: {
  readonly goal?: Lightbulb.DashboardGoal
  readonly loop?: Lightbulb.DashboardLoop
  readonly run?: Lightbulb.DashboardRun
}) {
  if (input.run) return input.run.summary
  if (input.loop) return input.loop.summary
  if (input.goal) return input.goal.summary
  return "No Lightbulb route state is available yet."
}

function latestLaunchAttempt(worker: Lightbulb.DashboardRun["workers"][number]) {
  const attempt = worker.launchAttempts.at(-1)
  if (!attempt) return {}
  return {
    latestLaunchAttempt: {
      id: attempt.id,
      status: attempt.status,
      summary: attempt.summary,
      ...(attempt.command ? { command: attempt.command } : {}),
      ...(attempt.cwd ? { cwd: attempt.cwd } : {}),
      ...(attempt.worktreeID ? { worktreeID: attempt.worktreeID } : {}),
      ...(attempt.reportURI ? { reportURI: attempt.reportURI } : {}),
      ...(attempt.failureReason ? { failureReason: attempt.failureReason } : {}),
      timeUpdated: attempt.timeUpdated,
    },
  }
}

function blockedReason(input: {
  readonly loop?: Lightbulb.DashboardLoop
  readonly run?: Lightbulb.DashboardRun
  readonly gate: Lightbulb.DashboardGate | null
}) {
  if (input.gate?.status === "blocked") return input.gate.summary
  if (input.run?.status === "blocked") return input.run.summary
  if (input.loop?.scheduleClassification === "budget_held") return input.loop.scheduleReason ?? "Loop budget held"
  if (input.loop?.status === "blocked") return input.loop.summary
  return "None"
}

function nextWakeSource(input: {
  readonly loop?: Lightbulb.DashboardLoop
  readonly gate: Lightbulb.DashboardGate | null
  readonly runnerTick: Lightbulb.DashboardSchedulerTick | null
}) {
  if (input.gate?.status === "pending") return "human_review_gate"
  if (input.runnerTick) return `scheduler_tick:${input.runnerTick.trigger}`
  if (input.loop?.scheduleReason) return `loop_schedule:${input.loop.scheduleReason}`
  return "manual_heartbeat"
}

function readyHumanAction(input: {
  readonly humanAction: Lightbulb.HumanInboxItem | null
  readonly gate: Lightbulb.DashboardGate | null
  readonly reportArtifact: Lightbulb.ArtifactHandle | null
  readonly pickupPacket: Lightbulb.Dashboard["inbox"]["taskPackets"][number] | null
}) {
  if (input.humanAction) return humanDecisionLabel(input.humanAction.type) + ": " + input.humanAction.summary
  if (input.gate?.status === "pending") {
    return input.reportArtifact
      ? `Review ${input.reportArtifact.type} artifact ${input.reportArtifact.id}`
      : `Review gate ${input.gate.id}`
  }
  if (input.pickupPacket?.status === "ready") return `Launch worker for pickup packet ${input.pickupPacket.id}`
  return "No human action is ready"
}

function humanDecisionLabel(type: Lightbulb.HumanInboxDecisionType) {
  if (type === "approval_needed") return "Approval needed"
  if (type === "needs_info") return "Needs info"
  if (type === "conflict") return "Conflict"
  if (type === "stale_worker") return "Stale worker"
  if (type === "budget_kill_switch") return "Budget hold"
  if (type === "max_attempts") return "Max attempts"
  return "Reroute"
}
