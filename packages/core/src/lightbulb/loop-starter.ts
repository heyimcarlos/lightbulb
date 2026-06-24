import { Effect } from "effect"
import type { Lightbulb } from "../lightbulb"
import {
  bootstrapLoopProfiles,
  defaultAccountLoopProfilePolicy,
  type LoopProfileBootstrapSummary,
  type LoopProfileDefaultPolicy,
  type LoopProfileDefinition,
  type LoopProfileGoalRef,
  type LoopProfileHandle,
  type LoopProfileRouteSeed,
  type LoopProfileRunLogPolicy,
  type LoopProfileStarterRouteStop,
  type LoopProfileStorage,
} from "./loop-profile"

export type LoopStarterID =
  | "system-discovery"
  | "pr-review-babysitter"
  | "issue-triage"
  | "daily-status"
  | "failure-debug"
  | "trace-eval"

export type LoopStarterDefinition = {
  readonly starterID: LoopStarterID
  readonly title: string
  readonly summary: string
  readonly profile: LoopProfileDefinition
}

export type LoopStarterBootstrapInput = LoopProfileGoalRef & {
  readonly starters?: readonly LoopStarterDefinition[]
  readonly starterIDs?: readonly LoopStarterID[]
  readonly defaultPolicy?: LoopProfileDefaultPolicy
  readonly promote?: boolean
  readonly now: number
  readonly storage: LoopProfileStorage
}

export type LoopStarterBootstrapServiceInput = LoopProfileGoalRef & {
  readonly starterIDs?: readonly LoopStarterID[]
  readonly defaultPolicy?: LoopProfileDefaultPolicy
  readonly promote?: boolean
  readonly now?: number
}

export type LoopStarterHandle = {
  readonly starterID: LoopStarterID
  readonly title: string
  readonly profileID: string
  readonly loopID: Lightbulb.LoopID | null
  readonly outcome: LoopProfileHandle["outcome"]
  readonly reason: LoopProfileHandle["reason"]
  readonly promoted: boolean
  readonly firstWakePrompt: string
  readonly routeSeed: LoopProfileRouteSeed
  readonly runLogPolicy: LoopProfileRunLogPolicy
  readonly profile: LoopProfileHandle["profile"]
}

export type LoopStarterBootstrapSummary = LoopProfileBootstrapSummary & {
  readonly starters: readonly LoopStarterHandle[]
  readonly unknownStarterIDs: readonly string[]
}

const HOUR = 60 * 60 * 1000

const defaultRunLogPolicy = {
  mode: "compact",
  retention: "operator-summary",
  rawTranscriptPolicy: "forbidden",
} satisfies Omit<LoopProfileRunLogPolicy, "requiredHandles">

export const defaultLoopStarterPolicy = {
  ...defaultAccountLoopProfilePolicy,
  schedule: {
    enabled: false,
    cadenceMs: 6 * HOUR,
  },
} satisfies LoopProfileDefaultPolicy

export const standardLoopStarters: readonly LoopStarterDefinition[] = [
  createStarter({
    starterID: "system-discovery",
    title: "System Discovery",
    kind: "discovery",
    summary: "Discover ready stable-v0 work and produce bounded pickup candidates.",
    goal: "Find unblocked Lightbulb work, keep the parent route honest, and stop when no safe pickup exists.",
    cadence: "Every 6h",
    cadenceMs: 6 * HOUR,
    risk: "low",
    skills: ["lightbulb-github-project-triage", "codebase-research", "pickup-packet"],
    state: "candidate-discovery",
    readModel: "GitHub issue queue, discovery inbox, operations snapshot, and route stops",
    tokenCostTier: "medium",
    dailyCap: 4,
    humanGates: ["needs-info", "ready-for-human"],
    earlyExitRequirement: "Exit when no unblocked ready-for-agent issue can become a pickup packet.",
    firstWakePrompt:
      "Read the stable-v0 milestone and discovery inbox, select one unblocked ready issue, and return a compact pickup recommendation with source handles.",
    routeSeed: {
      destination: "Select one ready Lightbulb issue for supervised worker pickup.",
      summary: "Discovery starter route for stable-v0 issue selection.",
      stops: [
        stop("scan", "discovery", "Scan Stable-v0 Queue", "Read milestone issues, PRs, blockers, and recent operations evidence.", "Issue URLs, blocker state, and latest dashboard/operator handles."),
        stop("packet", "decision", "Create Pickup Recommendation", "Choose one safe ready issue or stop with a bounded blocker reason.", "Pickup packet handle or no-op reason."),
      ],
    },
    requiredHandles: ["github:milestone:stable-loop-v0", "lightbulb:operator-export:state", "lightbulb:discovery-inbox"],
  }),
  createStarter({
    starterID: "pr-review-babysitter",
    title: "PR Review Babysitter",
    kind: "review",
    summary: "Watch review routes, CI, reviewer feedback, and merge gates for active Lightbulb PRs.",
    goal: "Move one filed PR through deterministic review, fix feedback loops, and human/merge gates without losing evidence.",
    cadence: "Every 30m",
    cadenceMs: 30 * 60 * 1000,
    risk: "high",
    skills: ["lightbulb-pr-pipeline", "code-review", "ci-evidence"],
    state: "pr-review-route",
    readModel: "PR review candidates, route wakes, babysitter digest, worker reports, and review gates from #65/#66/#75",
    tokenCostTier: "high",
    dailyCap: 6,
    humanGates: ["review-approval", "ci", "merge"],
    earlyExitRequirement: "Exit when no active PR route is waiting, CI is still running, or a human merge gate is blocking.",
    firstWakePrompt:
      "Read active PR review routes and the babysitter digest, then return the next bounded review/CI/merge action with evidence handles only.",
    routeSeed: {
      destination: "Drive one active Lightbulb PR to a clean review gate.",
      summary: "PR babysitter route seeded from review-candidate and route-monitor foundations.",
      stops: [
        stop("watch", "review", "Watch Review Route", "Load current PR route stop, route wakes, and babysitter digest.", "Route summary, latest wake, and active worker handle."),
        stop("verify", "verification", "Verify Current Head", "Check CI/review evidence and determine whether a maker worker must fix feedback.", "CI run URL, review verdict, and checked head SHA."),
        stop("gate", "decision", "Hold Or Merge Gate", "Expose merge-ready, blocked, or needs-human state for parent action.", "Gate handle and recommended parent action."),
      ],
    },
    requiredHandles: ["github:pull-request", "lightbulb:pr-review-route", "lightbulb:review-gate", "lightbulb:artifact-report"],
  }),
  createStarter({
    starterID: "issue-triage",
    title: "Issue Triage",
    kind: "discovery",
    summary: "Classify open issues into ready pickup, human decisions, blockers, duplicates, and noise.",
    goal: "Keep GitHub issues usable as Lightbulb pickup packets without automatic unsafe mutations.",
    cadence: "Every 4h",
    cadenceMs: 4 * HOUR,
    risk: "medium",
    skills: ["lightbulb-github-project-triage", "issue-routing", "to-issues"],
    state: "issue-intake",
    readModel: "issue queue intake, dependency reconciliation, mutation outbox, and discovery candidates",
    tokenCostTier: "medium",
    dailyCap: 4,
    humanGates: ["needs-info", "label-conflict", "safe-write-approval"],
    earlyExitRequirement: "Exit when every issue is classified or a mutation requires human approval.",
    firstWakePrompt:
      "Read open issue snapshots, classify each into the Lightbulb triage vocabulary, and emit pickup candidates or mutation proposals without applying them.",
    routeSeed: {
      destination: "Turn open issues into safe Lightbulb work queues.",
      summary: "Issue triage route for candidate discovery and safe mutation proposals.",
      stops: [
        stop("intake", "discovery", "Ingest Issue Queue", "Read open issue snapshots and dependency markers.", "Issue snapshot handles and intake summary."),
        stop("classify", "decision", "Classify Work", "Route issues into ready, human, duplicate, watch, noise, or mutation proposal buckets.", "Discovery candidate and outbox handles."),
      ],
    },
    requiredHandles: ["github:issues", "lightbulb:issue-intake", "lightbulb:mutation-outbox"],
  }),
  createStarter({
    starterID: "daily-status",
    title: "Daily Status",
    kind: "status",
    summary: "Publish a compact operator digest of goals, routes, workers, gates, budgets, and next wakeups.",
    goal: "Give the human operator one concise view of what is running, blocked, done, and waiting.",
    cadence: "Every 24h",
    cadenceMs: 24 * HOUR,
    risk: "low",
    skills: ["lightbulb-maintainer-orchestrator", "summarization", "operator-export"],
    state: "operator-status",
    readModel: "dashboard, operator export, scheduler supervisor pass, operations snapshot, and readiness audit",
    tokenCostTier: "low",
    dailyCap: 1,
    humanGates: ["operator-review"],
    earlyExitRequirement: "Exit after publishing one compact digest with no raw worker transcript content.",
    firstWakePrompt:
      "Read the dashboard, operator export, readiness audit, and operations snapshot, then return a compact status digest and next action.",
    routeSeed: {
      destination: "Publish one operator-safe daily Lightbulb status.",
      summary: "Status route for stable-v0 heartbeat evidence.",
      stops: [
        stop("collect", "review", "Collect Read Models", "Read current goal, route, run, worker, gate, budget, and readiness state.", "Dashboard/operator export handles."),
        stop("publish", "decision", "Publish Digest", "Summarize only current state, blockers, and next action.", "Status artifact handle."),
      ],
    },
    requiredHandles: ["lightbulb:dashboard", "lightbulb:operator-export", "lightbulb:readiness-audit"],
  }),
  createStarter({
    starterID: "failure-debug",
    title: "Failure Debug",
    kind: "debug",
    summary: "Reproduce and isolate failed runs, stale workers, broken gates, and local smoke failures.",
    goal: "Convert failure evidence into a minimal diagnosis, fix packet, or human escalation.",
    cadence: "Every 2h",
    cadenceMs: 2 * HOUR,
    risk: "medium",
    skills: ["debug", "diagnose", "regression-test-selection"],
    state: "recovery-required",
    readModel: "failed runs, blocked gates, stale worker attempts, smoke evidence, and report artifacts",
    tokenCostTier: "medium",
    dailyCap: 4,
    humanGates: ["needs-info", "failed-gate", "destructive-risk"],
    earlyExitRequirement: "Exit when the failure cannot be reproduced from compact evidence or a human decision is required.",
    firstWakePrompt:
      "Read failed run and gate evidence, reproduce the smallest local failure, and return diagnosis plus the next bounded fix packet.",
    routeSeed: {
      destination: "Recover one failing Lightbulb route without duplicate worker ownership.",
      summary: "Failure-debug route for compact diagnosis and recovery decisions.",
      stops: [
        stop("reproduce", "debug", "Reproduce Failure", "Use compact evidence to reproduce the current failure locally.", "Command, exit code, and focused failure excerpt."),
        stop("isolate", "debug", "Isolate Cause", "Classify the failure and choose fix, retry, or escalation.", "Diagnosis artifact and proposed next packet."),
      ],
    },
    requiredHandles: ["lightbulb:failed-run", "lightbulb:gate", "lightbulb:worker-launch-attempt"],
  }),
  createStarter({
    starterID: "trace-eval",
    title: "Trace Eval",
    kind: "integration",
    summary: "Analyze Lightbulb events and reports to propose harness improvements from real failures.",
    goal: "Hill-climb Lightbulb prompts, gates, route templates, and policies without growing parent context.",
    cadence: "Every 24h",
    cadenceMs: 24 * HOUR,
    risk: "medium",
    skills: ["lightbulb-loop-maintainer", "evaluation", "issue-slicing"],
    state: "trace-evaluation",
    readModel: "lightbulb_event, operator run-log, worker reports, gates, budget holds, and human inbox outcomes",
    tokenCostTier: "medium",
    dailyCap: 1,
    humanGates: ["proposal-review", "safe-write-approval"],
    earlyExitRequirement: "Exit after creating bounded improvement proposals or when evidence is insufficient.",
    firstWakePrompt:
      "Read recent loop events, run logs, gates, reports, and human outcomes, classify failure modes, and propose bounded Lightbulb improvements.",
    routeSeed: {
      destination: "Propose one evidence-backed Lightbulb harness improvement.",
      summary: "Trace-eval route for failure-mode classification and improvement proposals.",
      stops: [
        stop("analyze", "review", "Analyze Trace Evidence", "Classify recent loop failures, repeated holds, and verifier gaps.", "Failure classification with source handles."),
        stop("propose", "decision", "Propose Improvement", "Emit one bounded improvement proposal without applying it automatically.", "Mutation outbox or issue proposal handle."),
      ],
    },
    requiredHandles: ["lightbulb:event-log", "lightbulb:operator-export:run-log", "lightbulb:human-inbox"],
  }),
]

export function bootstrapLoopStarters(input: LoopStarterBootstrapInput) {
  return Effect.gen(function* () {
    const starters = input.starters ?? standardLoopStarters
    const unknownStarterIDs = input.starterIDs?.filter((starterID) => !starters.some((starter) => starter.starterID === starterID)) ?? []
    const selected = input.starterIDs
      ? starters.filter((starter) => input.starterIDs?.includes(starter.starterID))
      : starters
    const summary = yield* bootstrapLoopProfiles({
      accountID: input.accountID,
      goalID: input.goalID,
      profiles: selected.map((starter) => profileForBootstrap(starter, input.promote === true)),
      defaultPolicy: input.defaultPolicy ?? defaultLoopStarterPolicy,
      now: input.now,
      storage: input.storage,
    })

    return {
      ...summary,
      starters: selected
        .map((starter) => {
          const handle = summary.handles.find((item) => item.profileID === starter.profile.profileID)
          return handle ? starterHandle(starter, handle, input.promote === true) : undefined
        })
        .filter((starter): starter is LoopStarterHandle => starter !== undefined),
      unknownStarterIDs,
    } satisfies LoopStarterBootstrapSummary
  })
}

function profileForBootstrap(starter: LoopStarterDefinition, promoted: boolean): LoopProfileDefinition {
  return {
    ...starter.profile,
    schedule: {
      enabled: promoted,
      cadenceMs: starter.profile.schedule?.cadenceMs ?? defaultLoopStarterPolicy.schedule.cadenceMs,
    },
  }
}

function starterHandle(starter: LoopStarterDefinition, handle: LoopProfileHandle, promoted: boolean): LoopStarterHandle {
  return {
    starterID: starter.starterID,
    title: starter.title,
    profileID: starter.profile.profileID,
    loopID: handle.loopID,
    outcome: handle.outcome,
    reason: handle.reason,
    promoted,
    firstWakePrompt: starter.profile.starter?.firstWakePrompt ?? "",
    routeSeed: starter.profile.starter?.routeSeed ?? {
      destination: starter.profile.summary,
      summary: starter.summary,
      stops: [],
    },
    runLogPolicy: starter.profile.starter?.runLogPolicy ?? {
      ...defaultRunLogPolicy,
      requiredHandles: [],
    },
    profile: handle.profile,
  }
}

function createStarter(input: {
  readonly starterID: LoopStarterID
  readonly title: string
  readonly kind: Lightbulb.LoopKind
  readonly summary: string
  readonly goal: string
  readonly cadence: string
  readonly cadenceMs: number
  readonly risk: Lightbulb.LoopProfileRisk
  readonly skills: readonly string[]
  readonly state: string
  readonly readModel: string
  readonly tokenCostTier: Lightbulb.LoopProfileTokenCostTier
  readonly dailyCap: number
  readonly humanGates: readonly string[]
  readonly earlyExitRequirement: string
  readonly firstWakePrompt: string
  readonly routeSeed: LoopProfileRouteSeed
  readonly requiredHandles: readonly string[]
}): LoopStarterDefinition {
  return {
    starterID: input.starterID,
    title: input.title,
    summary: input.summary,
    profile: {
      profileID: input.starterID,
      kind: input.kind,
      summary: input.summary,
      registry: {
        name: input.title,
        goal: input.goal,
        cadence: input.cadence,
        risk: input.risk,
        skills: input.skills,
        state: input.state,
        readModel: input.readModel,
        phases: input.routeSeed.stops.map((item) => ({ id: item.id, goal: item.objective })),
        humanGates: input.humanGates,
        readinessMode: "human_gate",
        tokenCostTier: input.tokenCostTier,
        dailyCap: input.dailyCap,
        earlyExitRequirement: input.earlyExitRequirement,
        starterRef: "lightbulb:loop-starter:" + input.starterID,
      },
      starter: {
        starterID: input.starterID,
        firstWakePrompt: input.firstWakePrompt,
        routeSeed: input.routeSeed,
        runLogPolicy: {
          ...defaultRunLogPolicy,
          requiredHandles: input.requiredHandles,
        },
      },
      schedule: {
        enabled: false,
        cadenceMs: input.cadenceMs,
      },
      budget: {
        status: "open",
        maxRunsPerDay: input.dailyCap,
        maxTokens: input.tokenCostTier === "high" ? 250_000 : input.tokenCostTier === "medium" ? 160_000 : 60_000,
        maxCostUsd: input.tokenCostTier === "high" ? 30 : input.tokenCostTier === "medium" ? 15 : 5,
        maxContextTokens: input.tokenCostTier === "high" ? 900_000 : input.tokenCostTier === "medium" ? 600_000 : 240_000,
      },
    },
  }
}

function stop(
  id: string,
  kind: Lightbulb.RouteStopKind,
  title: string,
  objective: string,
  evidence: string,
): LoopProfileStarterRouteStop {
  return {
    id,
    kind,
    title,
    objective,
    evidence,
  }
}
