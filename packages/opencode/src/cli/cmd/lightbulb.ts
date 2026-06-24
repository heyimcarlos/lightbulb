import type { Argv } from "yargs"
import { EOL } from "os"
import { Effect, Option, Schema } from "effect"
import { Lightbulb } from "@opencode-ai/core/lightbulb"
import { effectCmd, fail } from "../effect-cmd"

type DashboardArgs = {
  readonly account?: string
  readonly seed?: boolean
  readonly accountName?: string
  readonly artifactUri?: string
  readonly format: "text" | "json"
}

type ExportArgs = DashboardArgs & {
  readonly section: Lightbulb.OperatorExportSection
}

type ReadinessArgs = DashboardArgs

type LoopStartersArgs = {
  readonly account?: string
  readonly goal?: string
  readonly seed?: boolean
  readonly bootstrap?: boolean
  readonly promote?: boolean
  readonly starter?: readonly string[]
  readonly format: "text" | "json"
}

const decodeAccountID = Schema.decodeUnknownOption(Lightbulb.AccountID)
const decodeGoalID = Schema.decodeUnknownOption(Lightbulb.GoalID)

export const LightbulbDashboardCommand = effectCmd({
  command: "dashboard",
  describe: "show the Lightbulb account work graph",
  instance: false,
  builder: (yargs: Argv) =>
    yargs
      .option("account", {
        describe: "Lightbulb account ID to display",
        type: "string",
      })
      .option("seed", {
        describe: "seed a tracer-bullet graph before displaying it",
        type: "boolean",
      })
      .option("account-name", {
        describe: "account name to use with --seed",
        type: "string",
      })
      .option("artifact-uri", {
        describe: "artifact URI to use with --seed",
        type: "string",
      })
      .option("format", {
        describe: "output format",
        choices: ["text", "json"] as const,
        default: "text" as const,
      }),
  handler: Effect.fn("Cli.lightbulb.dashboard")(function* (args: DashboardArgs) {
    return yield* Effect.gen(function* () {
      if (args.seed && args.account) return yield* fail("Use either --seed or --account, not both")

      const lightbulb = yield* Lightbulb.Service
      const seeded = args.seed
        ? yield* lightbulb.seedTracerBullet({
            accountName: args.accountName,
            artifactUri: args.artifactUri,
          })
        : undefined
      const decodedAccountID =
        args.account === undefined ? undefined : Option.getOrUndefined(decodeAccountID(args.account))
      if (args.account !== undefined && decodedAccountID === undefined) {
        return yield* fail(`Invalid Lightbulb account ID: ${args.account}`)
      }

      const accountID = seeded?.accountID ?? decodedAccountID
      if (accountID === undefined) return yield* fail("Pass --seed to create a tracer graph or --account <lbacc_...>")

      const dashboard = yield* lightbulb.readDashboard(accountID)
      if (!dashboard) return yield* fail(`Lightbulb account not found: ${accountID}`)

      if (args.format === "json") {
        console.log(JSON.stringify(dashboard, null, 2))
        return
      }
      console.log(formatLightbulbDashboard(dashboard))
    }).pipe(Effect.provide(Lightbulb.defaultLayer))
  }),
})

export const LightbulbOperatorExportCommand = effectCmd({
  command: "operator-export",
  describe: "show compact Lightbulb operator exports",
  instance: false,
  builder: (yargs: Argv) =>
    yargs
      .option("account", {
        describe: "Lightbulb account ID to export",
        type: "string",
      })
      .option("seed", {
        describe: "seed a tracer-bullet graph before exporting it",
        type: "boolean",
      })
      .option("account-name", {
        describe: "account name to use with --seed",
        type: "string",
      })
      .option("artifact-uri", {
        describe: "artifact URI to use with --seed",
        type: "string",
      })
      .option("section", {
        describe: "operator export section",
        choices: ["all", "state", "budget", "run-log"] as const,
        default: "all" as const,
      })
      .option("format", {
        describe: "output format",
        choices: ["text", "json"] as const,
        default: "text" as const,
      }),
  handler: Effect.fn("Cli.lightbulb.operatorExport")(function* (args: ExportArgs) {
    return yield* Effect.gen(function* () {
      if (args.seed && args.account) return yield* fail("Use either --seed or --account, not both")

      const lightbulb = yield* Lightbulb.Service
      const seeded = args.seed
        ? yield* lightbulb.seedTracerBullet({
            accountName: args.accountName,
            artifactUri: args.artifactUri,
          })
        : undefined
      const decodedAccountID =
        args.account === undefined ? undefined : Option.getOrUndefined(decodeAccountID(args.account))
      if (args.account !== undefined && decodedAccountID === undefined) {
        return yield* fail(`Invalid Lightbulb account ID: ${args.account}`)
      }

      const accountID = seeded?.accountID ?? decodedAccountID
      if (accountID === undefined) return yield* fail("Pass --seed to create a tracer graph or --account <lbacc_...>")

      const operatorExport = yield* lightbulb.readOperatorExport({ accountID })
      if (!operatorExport) return yield* fail(`Lightbulb account not found: ${accountID}`)

      if (args.format === "json") {
        console.log(JSON.stringify(operatorExportSection(operatorExport, args.section), null, 2))
        return
      }
      console.log(formatLightbulbOperatorExport(operatorExport, args.section))
    }).pipe(Effect.provide(Lightbulb.defaultLayer))
  }),
})

export const LightbulbReadinessAuditCommand = effectCmd({
  command: "readiness-audit",
  describe: "show native Lightbulb loop readiness",
  instance: false,
  builder: (yargs: Argv) =>
    yargs
      .option("account", {
        describe: "Lightbulb account ID to audit",
        type: "string",
      })
      .option("seed", {
        describe: "seed a tracer-bullet graph before auditing it",
        type: "boolean",
      })
      .option("account-name", {
        describe: "account name to use with --seed",
        type: "string",
      })
      .option("artifact-uri", {
        describe: "artifact URI to use with --seed",
        type: "string",
      })
      .option("format", {
        describe: "output format",
        choices: ["text", "json"] as const,
        default: "text" as const,
      }),
  handler: Effect.fn("Cli.lightbulb.readinessAudit")(function* (args: ReadinessArgs) {
    return yield* Effect.gen(function* () {
      if (args.seed && args.account) return yield* fail("Use either --seed or --account, not both")

      const lightbulb = yield* Lightbulb.Service
      const seeded = args.seed
        ? yield* lightbulb.seedTracerBullet({
            accountName: args.accountName,
            artifactUri: args.artifactUri,
          })
        : undefined
      const decodedAccountID =
        args.account === undefined ? undefined : Option.getOrUndefined(decodeAccountID(args.account))
      if (args.account !== undefined && decodedAccountID === undefined) {
        return yield* fail(`Invalid Lightbulb account ID: ${args.account}`)
      }

      const accountID = seeded?.accountID ?? decodedAccountID
      if (accountID === undefined) return yield* fail("Pass --seed to create a tracer graph or --account <lbacc_...>")

      const readiness = yield* lightbulb.readLoopReadiness({ accountID })
      if (!readiness) return yield* fail(`Lightbulb account not found: ${accountID}`)

      if (args.format === "json") {
        console.log(JSON.stringify(readiness, null, 2))
        return
      }
      console.log(formatLightbulbReadinessAudit(readiness))
    }).pipe(Effect.provide(Lightbulb.defaultLayer))
  }),
})

export const LightbulbLoopStartersCommand = effectCmd({
  command: "loop-starters",
  describe: "list or bootstrap Lightbulb loop profile starters",
  instance: false,
  builder: (yargs: Argv) =>
    yargs
      .option("account", {
        describe: "Lightbulb account ID to bootstrap into",
        type: "string",
      })
      .option("goal", {
        describe: "Lightbulb goal ID to bootstrap into",
        type: "string",
      })
      .option("seed", {
        describe: "seed a tracer-bullet graph before bootstrapping starters",
        type: "boolean",
      })
      .option("bootstrap", {
        describe: "create or adopt starter profiles for the selected goal",
        type: "boolean",
      })
      .option("promote", {
        describe: "enable starter schedules immediately instead of report-only defaults",
        type: "boolean",
      })
      .option("starter", {
        describe: "specific starter ID to bootstrap; can be passed more than once",
        type: "string",
        array: true,
      })
      .option("format", {
        describe: "output format",
        choices: ["text", "json"] as const,
        default: "text" as const,
      }),
  handler: Effect.fn("Cli.lightbulb.loopStarters")(function* (args: LoopStartersArgs) {
    return yield* Effect.gen(function* () {
      if (!args.bootstrap) {
        if (args.format === "json") {
          console.log(JSON.stringify(Lightbulb.standardLoopStarters, null, 2))
          return
        }
        console.log(formatLightbulbLoopStarters(Lightbulb.standardLoopStarters))
        return
      }
      if (args.seed && (args.account || args.goal)) return yield* fail("Use either --seed or --account/--goal, not both")

      const starterIDs = parseStarterIDs(args.starter)
      const invalidStarterIDs = args.starter?.filter((starterID) => !isLoopStarterID(starterID)) ?? []
      if (invalidStarterIDs.length > 0) {
        return yield* fail(`Unknown Lightbulb starter ID: ${invalidStarterIDs.join(", ")}`)
      }

      const lightbulb = yield* Lightbulb.Service
      const seeded = args.seed ? yield* lightbulb.seedTracerBullet() : undefined
      const decodedAccountID =
        args.account === undefined ? undefined : Option.getOrUndefined(decodeAccountID(args.account))
      if (args.account !== undefined && decodedAccountID === undefined) {
        return yield* fail(`Invalid Lightbulb account ID: ${args.account}`)
      }
      const decodedGoalID = args.goal === undefined ? undefined : Option.getOrUndefined(decodeGoalID(args.goal))
      if (args.goal !== undefined && decodedGoalID === undefined) {
        return yield* fail(`Invalid Lightbulb goal ID: ${args.goal}`)
      }

      const accountID = seeded?.accountID ?? decodedAccountID
      const goalID = seeded?.goalID ?? decodedGoalID
      if (accountID === undefined || goalID === undefined) {
        return yield* fail("Pass --bootstrap with --seed or --account <lbacc_...> --goal <lbgoal_...>")
      }

      const summary = yield* lightbulb.bootstrapLoopStarters({
        accountID,
        goalID,
        starterIDs,
        promote: args.promote === true,
      })

      if (args.format === "json") {
        console.log(JSON.stringify(summary, null, 2))
        return
      }
      console.log(formatLightbulbLoopStarterBootstrap(summary))
    }).pipe(Effect.provide(Lightbulb.defaultLayer))
  }),
})

export const LightbulbCommand = effectCmd({
  command: "lightbulb",
  describe: "Lightbulb account orchestration tools",
  instance: false,
  builder: (yargs: Argv) =>
    yargs
      .command(LightbulbDashboardCommand)
      .command(LightbulbOperatorExportCommand)
      .command(LightbulbReadinessAuditCommand)
      .command(LightbulbLoopStartersCommand)
      .demandCommand(),
  handler: Effect.fn("Cli.lightbulb")(function* () {}),
})

export function formatLightbulbDashboard(dashboard: Lightbulb.Dashboard) {
  return [
    "Lightbulb Status",
    `Account: ${dashboard.account.name} [${dashboard.account.status}] ${dashboard.account.id}`,
    `Totals: ${dashboard.goals.length} goals, ${countLoops(dashboard)} loops, ${countRuns(dashboard)} runs, ${dashboard.inbox.gates.length} gates waiting`,
    "",
    "Work",
    ...(dashboard.goals.length === 0 ? ["- none"] : dashboard.goals.flatMap(formatGoal)),
    ...formatDashboardReadiness(dashboard),
    ...formatOperations(dashboard),
    "",
    "Queue",
    ...formatInbox(dashboard),
    "",
    "Artifacts",
    ...(dashboard.artifactHandles.length === 0
      ? ["- none"]
      : dashboard.artifactHandles.map((artifact) => `- ${formatArtifactHandle(artifact)}`)),
    "",
    "Operator Exports",
    `- lightbulb operator-export --account ${dashboard.account.id}`,
    `- lightbulb operator-export --account ${dashboard.account.id} --section state`,
    `- lightbulb operator-export --account ${dashboard.account.id} --section budget`,
    `- lightbulb operator-export --account ${dashboard.account.id} --section run-log`,
    `- lightbulb readiness-audit --account ${dashboard.account.id}`,
  ].join(EOL)
}

export function formatLightbulbReadinessAudit(readiness: Lightbulb.LoopReadinessAudit) {
  return [
    "Lightbulb Readiness Audit",
    `Account: ${readiness.account.name} [${readiness.account.status}] ${readiness.account.id}`,
    `Generated: ${readiness.generatedAt}`,
    `Level: ${readiness.level} score=${readiness.score}`,
    readiness.summary,
    "",
    "Profiles",
    ...(readiness.profiles.length === 0
      ? ["- none"]
      : readiness.profiles.map(
          (profile) =>
            `- ${profile.profileID ?? "unprofiled"} ${profile.kind} ${profile.loopID} [${profile.level}] ` +
            `score=${profile.score} missing=${formatMissingReasons(profile.missingReasons)}`,
        )),
  ].join(EOL)
}

export function formatLightbulbLoopStarters(starters: readonly Lightbulb.LoopStarterDefinition[]) {
  return [
    "Lightbulb Loop Starters",
    ...(starters.length === 0
      ? ["- none"]
      : starters.map(
          (starter) =>
            `- ${starter.starterID} ${starter.title} ${starter.profile.kind} ` +
            `[${starter.profile.registry?.readinessMode ?? "unknown"}] ${starter.summary}`,
        )),
  ].join(EOL)
}

export function formatLightbulbLoopStarterBootstrap(summary: Lightbulb.LoopStarterBootstrapSummary) {
  return [
    "Lightbulb Loop Starter Bootstrap",
    `Account: ${summary.accountID}`,
    `Goal: ${summary.goalID}`,
    `Totals: created=${summary.created.length} adopted=${summary.adopted.length} skipped=${summary.skipped.length} ` +
      `held=${summary.held.length} invalid=${summary.invalid.length}`,
    ...(summary.unknownStarterIDs.length > 0 ? [`Unknown: ${summary.unknownStarterIDs.join(", ")}`] : []),
    "",
    "Starters",
    ...(summary.starters.length === 0 ? ["- none"] : summary.starters.flatMap(formatLoopStarterHandle)),
  ].join(EOL)
}

function formatLoopStarterHandle(starter: Lightbulb.LoopStarterHandle) {
  return [
    `- ${starter.starterID} ${starter.title} [${starter.outcome}] loop=${starter.loopID ?? "none"} ` +
      `promoted=${starter.promoted ? "yes" : "no"} reason=${starter.reason ?? "none"}`,
    `  route: ${starter.routeSeed.destination}`,
    `  first wake: ${starter.firstWakePrompt}`,
    `  run-log: ${starter.runLogPolicy.mode} handles=${starter.runLogPolicy.requiredHandles.join(",") || "none"}`,
  ]
}

export function formatLightbulbOperatorExport(
  operatorExport: Lightbulb.OperatorExport,
  section: Lightbulb.OperatorExportSection = "all",
) {
  return [
    "Lightbulb Operator Export",
    `Account: ${operatorExport.account.name} [${operatorExport.account.status}] ${operatorExport.account.id}`,
    `Generated: ${operatorExport.generatedAt}`,
    "",
    "Read Paths",
    `- all: ${operatorExport.access.all}`,
    `- state: ${operatorExport.access.state}`,
    `- budget: ${operatorExport.access.budget}`,
    `- run-log: ${operatorExport.access.runLog}`,
    ...(section === "all" || section === "state" ? formatOperatorState(operatorExport.state) : []),
    ...(section === "all" || section === "budget" ? formatOperatorBudget(operatorExport.budget) : []),
    ...(section === "all" || section === "run-log" ? formatOperatorRunLog(operatorExport.runLog) : []),
  ].join(EOL)
}

function operatorExportSection(operatorExport: Lightbulb.OperatorExport, section: Lightbulb.OperatorExportSection) {
  if (section === "state") return operatorExport.state
  if (section === "budget") return operatorExport.budget
  if (section === "run-log") return operatorExport.runLog
  return operatorExport
}

function parseStarterIDs(values: readonly string[] | undefined) {
  return values?.filter(isLoopStarterID)
}

function isLoopStarterID(value: string): value is Lightbulb.LoopStarterID {
  return Lightbulb.standardLoopStarters.some((starter) => starter.starterID === value)
}

function formatOperatorState(state: Lightbulb.OperatorStateExport) {
  return [
    "",
    "State",
    ...formatOperatorStateSection("high-priority/active", state.highPriorityActive),
    ...formatOperatorStateSection("watch", state.watch),
    ...formatOperatorStateSection("human inbox", state.humanInbox),
    ...formatOperatorStateSection("noise/ignored", state.recentNoiseIgnored),
    ...formatOperatorStateSection("resolved/recent", state.resolvedRecent),
  ]
}

function formatOperatorStateSection(label: string, items: readonly Lightbulb.OperatorStateItem[]) {
  return [
    `  ${label}: ${items.length}`,
    ...(items.length === 0 ? ["    - none"] : items.map((item) => `    - ${formatOperatorStateItem(item)}`)),
  ]
}

function formatOperatorStateItem(item: Lightbulb.OperatorStateItem) {
  return (
    `${item.kind} ${item.id} [${item.status}] ${item.title} - ${item.summary}` +
    `${item.issueRef ? ` issue=${item.issueRef}` : ""}` +
    `${item.action ? ` action=${item.action}` : ""}`
  )
}

function formatOperatorBudget(budget: Lightbulb.OperatorBudgetExport) {
  return [
    "",
    "Budget",
    `  kill-switch=${budget.killSwitch.active ? "active" : "inactive"} reason=${budget.killSwitch.reason ?? "none"}`,
    `  totals loops=${budget.totals.loops} open=${budget.totals.open} held=${budget.totals.held} ` +
      `exhausted=${budget.totals.exhausted} unknown=${budget.totals.unknown}`,
    `  remaining runs=${budget.totals.remainingRunsToday ?? "unknown"} tokens=${budget.totals.remainingTokenUnits ?? "unknown"} ` +
      `cost=${budget.totals.remainingCostUnits ?? "unknown"} context=${budget.totals.remainingContextUnits ?? "unknown"} ` +
      `approvals=${budget.totals.remainingApprovals ?? "unbounded"} workerSpawns=${budget.totals.remainingWorkerSpawnsForActiveRun ?? "not-configured"}`,
    ...(budget.loops.length === 0
      ? ["  loops: none"]
      : budget.loops.map(
          (loop) =>
            `  - loop ${loop.loopID} profile=${loop.profileID ?? "none"} [${loop.state}] reason=${loop.reason ?? "none"} ` +
            `remainingRuns=${loop.remaining.runsToday ?? "unknown"} remainingTokens=${loop.remaining.tokenUnits ?? "unknown"} ` +
            `workerSpawns=${loop.remaining.workerSpawnsForActiveRun ?? "not-configured"}`,
        )),
  ]
}

function formatOperatorRunLog(runLog: Lightbulb.OperatorRunLogExport) {
  return [
    "",
    "Run Log",
    ...(runLog.entries.length === 0
      ? ["  - none"]
      : runLog.entries.map(
          (entry) =>
            `  - run ${entry.runID} profile=${entry.profileID ?? "none"} [${entry.outcome}] ` +
            `duration=${entry.durationMs ?? "open"} items=${entry.itemsFound.length} actions=${entry.actions.length} ` +
            `escalations=${entry.escalations.length} cost=${entry.usageEstimate.costUnits} tokens=${entry.usageEstimate.tokenUnits} ` +
            `artifacts=${entry.handles.artifactIDs.length}`,
        )),
  ]
}

function formatGoal(goal: Lightbulb.DashboardGoal) {
  return [
    `- ${goal.title} [${goal.status}] ${goal.id}`,
    `  ${goal.summary}`,
    ...(goal.loops.length === 0 ? ["  loops: none"] : goal.loops.flatMap(formatLoop)),
  ]
}

function formatDashboardReadiness(dashboard: Lightbulb.Dashboard) {
  if (!dashboard.readiness) return []
  return [
    "",
    "Readiness",
    `  account [${dashboard.readiness.level}] score=${dashboard.readiness.score} - ${dashboard.readiness.summary}`,
    ...dashboard.readiness.profiles.map(
      (profile) =>
        `  - profile ${profile.profileID ?? "unprofiled"} loop=${profile.loopID} ` +
        `[${profile.level}] score=${profile.score} missing=${formatMissingReasons(profile.missingReasons)}`,
    ),
  ]
}

function formatOperations(dashboard: Lightbulb.Dashboard) {
  if (!dashboard.operations.snapshot && dashboard.operations.schedulerTicks.length === 0) return []
  return [
    "",
    "Operations",
    ...(dashboard.operations.snapshot ? formatOperationsSnapshot(dashboard.operations.snapshot) : []),
    ...dashboard.operations.schedulerTicks.flatMap((tick) => [
      `  scheduler tick ${tick.id} trigger=${tick.trigger} admitted=${tick.admittedCount} ` +
        `skipped=${tick.skippedCount} outcomes=${tick.outcomeCount}`,
      ...(tick.source ? [`    source ${formatOperationSource(tick.source)}`] : []),
      ...tick.outcomes.map(
        (outcome) =>
          `    loop ${outcome.loopID} ${outcome.kind} [${outcome.outcome}] ` +
          `classification=${outcome.classification ?? "unknown"} reason=${outcome.reason ?? "none"} ` +
          `run=${outcome.runID ?? "none"}`,
      ),
    ]),
  ]
}

function formatOperationsSnapshot(snapshot: Lightbulb.OperationsSnapshot) {
  return [
    `  snapshot ${snapshot.id} [${snapshot.status}] key=${snapshot.snapshotKey}`,
    `    ${snapshot.summary}`,
    `    nextWake=${snapshot.nextWakeAt ?? "none"} hash=${snapshot.sourceHash}`,
    `    counts ready=${snapshot.counts.loops.ready} activeOwners=${snapshot.handles.activeOwnership.length} ` +
      `reviewGates=${snapshot.counts.gates.pendingReview} budgetHeld=${snapshot.counts.budget.held} ` +
      `dependencyReleased=${snapshot.counts.dependencies.released} collisionHolds=${snapshot.counts.launchAttempts.collisionHolds} ` +
      `humanActions=${snapshot.counts.humanInbox.actionRequired}`,
    ...snapshot.handles.activeOwnership.map(
      (item) => `    owner ${item.id} [${item.status ?? "unknown"}] ${item.summary}${item.reason ? ` (${item.reason})` : ""}`,
    ),
    ...snapshot.handles.readyWork.map((item) => `    ready ${item.id} ${item.kind} ${item.summary}`),
    ...snapshot.handles.reviewGates.map((item) => `    review ${item.id} [${item.status ?? "unknown"}] ${item.summary}`),
    ...snapshot.handles.humanActions.map((item) => `    human ${item.id} ${item.kind} ${item.summary}`),
  ]
}

function formatLoop(loop: Lightbulb.DashboardLoop) {
  return [
    `  - ${loop.kind} loop [${loop.status}] ${loop.id} - ${loop.summary}`,
    ...(
      loop.runs.length === 0
        ? ["    runs: none"]
        : loop.runs.flatMap((run) => [
            `    run ${run.id} [${run.status}] - ${run.summary}`,
            `    checks: review ${run.reviewStatus}, debug ${run.debugStatus}, gate ${run.gateStatus}`,
            `    workers: ${summarizeWorkers(run.workers)}`,
            `    gates: ${summarizeGates(run.gates)}`,
            `    artifacts: ${run.artifacts.length}`,
            ...run.artifacts.map((artifact) => `    ${formatArtifactHandle(artifact)}`),
          ])
    ),
  ]
}

function formatInbox(dashboard: Lightbulb.Dashboard) {
  if (
    dashboard.inbox.taskPackets.length === 0 &&
    dashboard.inbox.gates.length === 0 &&
    countDiscoveryCandidates(dashboard.inbox.discoveryCandidates) === 0 &&
    dashboard.inbox.prReviewCandidates.length === 0 &&
    dashboard.inbox.prReviewRoutes.length === 0 &&
    countPRReviewDigestItems(dashboard.inbox.prReviewRouteDigest) === 0 &&
    countHumanInboxItems(dashboard.inbox.humanInbox) === 0
  ) {
    return ["- empty"]
  }
  return [
    ...dashboard.inbox.gates.map((gate) => `- gate ${formatGate(gate)} - ${gate.summary}`),
    ...dashboard.inbox.taskPackets.map(
      (packet) => `- packet ${packet.id} ${packet.title} [${packet.status}] worker=${packet.workerID}`,
    ),
    ...formatDiscoveryInbox(dashboard.inbox.discoveryCandidates),
    ...dashboard.inbox.prReviewCandidates.map(formatPRReviewCandidate),
    ...dashboard.inbox.prReviewRoutes.map(formatPRReviewRoute),
    ...formatPRReviewRouteDigest(dashboard.inbox.prReviewRouteDigest),
    ...formatHumanInbox(dashboard.inbox.humanInbox),
  ]
}

function formatDiscoveryInbox(inbox: Lightbulb.DiscoveryCandidateInbox) {
  return [
    ...inbox.topActionable.map((candidate) => formatDiscoveryCandidate("top", candidate)),
    ...inbox.needsHuman.map((candidate) => formatDiscoveryCandidate("human", candidate)),
    ...inbox.possibleDuplicates.map((candidate) => formatDiscoveryCandidate("duplicate", candidate)),
    ...inbox.watch.map((candidate) => formatDiscoveryCandidate("watch", candidate)),
    ...inbox.noise.map((candidate) => formatDiscoveryCandidate("noise", candidate)),
    ...inbox.recentResolved.map((candidate) => formatDiscoveryCandidate("resolved", candidate)),
  ]
}

function formatDiscoveryCandidate(section: string, candidate: Lightbulb.DiscoveryCandidateSummary) {
  const duplicates = candidate.duplicateRefs.length ? ` duplicates=${candidate.duplicateRefs.join(",")}` : ""
  return (
    `- issue-candidate ${candidate.sourceHandles.issueRef ?? candidate.sourceID} ${section} ` +
    `[${candidate.status}] score=${candidate.score} action=${candidate.suggestedAction}${duplicates} ${candidate.title}`
  )
}

function countDiscoveryCandidates(inbox: Lightbulb.DiscoveryCandidateInbox) {
  return (
    inbox.topActionable.length +
    inbox.needsHuman.length +
    inbox.possibleDuplicates.length +
    inbox.watch.length +
    inbox.noise.length +
    inbox.recentResolved.length
  )
}

function formatPRReviewCandidate(candidate: Lightbulb.PRReviewCandidateSummary) {
  return (
    `- pr-candidate ${candidate.repository}#${candidate.pullNumber} [${candidate.status}/${candidate.state}] ` +
    `${candidate.title} base=${candidate.baseRef} head=${candidate.headRef}`
  )
}

function formatPRReviewRoute(route: Lightbulb.PRReviewRouteSummary) {
  return (
    `- pr-route ${route.repository}#${route.pullNumber} [${route.status}] ${route.title} ` +
    `stop=${route.currentStop ? `${route.currentStop.kind}:${route.currentStop.status}` : "none"} ` +
    `next=${route.nextWakeSource ?? "none"} mergeReady=${route.mergeReady ? "yes" : "no"}` +
    `${route.blockedReason ? ` blocked=${route.blockedReason}` : ""}` +
    `${route.activeWorker ? ` worker=${route.activeWorker.id}` : ""}`
  )
}

function formatPRReviewRouteDigest(digest: Lightbulb.PRReviewRouteDigest) {
  if (countPRReviewDigestItems(digest) === 0) return []
  return [
    "  PR review digest",
    ...digest.escalated.map((item) => formatPRReviewDigestItem("escalated", item)),
    ...digest.watched.map((item) => formatPRReviewDigestItem("watch", item)),
    ...digest.recent.map((item) => formatPRReviewDigestItem("recent", item)),
  ]
}

function formatPRReviewDigestItem(kind: "watch" | "escalated" | "recent", item: Lightbulb.PRReviewRouteDigestItem) {
  return (
    `  - pr-${kind} ${item.repository}#${item.pullNumber} [${item.status}] attempts=${item.attemptCount}/${item.maxAttempts} ` +
    `stop=${item.currentStop ? `${item.currentStop.kind}:${item.currentStop.status}` : "none"} ` +
    `next=${item.nextWakeSource ?? "none"} decision=${item.humanDecision ?? "none"} ` +
    `last=${item.lastAction}` +
    `${item.escalationReasons.length > 0 ? ` reasons=${item.escalationReasons.join(",")}` : ""}` +
    `${item.activeWorker ? ` worker=${item.activeWorker.id}` : ""}`
  )
}

function countPRReviewDigestItems(digest: Lightbulb.PRReviewRouteDigest) {
  return digest.watched.length + digest.escalated.length + digest.recent.length
}

function formatHumanInbox(inbox: Lightbulb.HumanInboxDigest) {
  if (countHumanInboxItems(inbox) === 0) return []
  return [
    "  Human inbox",
    ...inbox.actionRequired.map(
      (item) =>
        `  - human ${item.type} [${item.priority}] ${item.summary} ` +
        `reason=${item.reason} action=${item.suggestedDecision} source=${formatHumanInboxSource(item.source)}`,
    ),
  ]
}

function countHumanInboxItems(inbox: Lightbulb.HumanInboxDigest) {
  return inbox.actionRequired.length
}

function formatHumanInboxSource(source: Lightbulb.HumanInboxSource) {
  return (
    source.issueRef ??
    source.gateID ??
    source.routeID ??
    source.loopID ??
    source.runID ??
    source.mutationID ??
    source.eventID ??
    "unknown"
  )
}

function formatArtifactHandle(artifact: Lightbulb.ArtifactHandle) {
  const decision = artifact.decision ? ` decision=${artifact.decision.status}` : ""
  const source = formatArtifactSource(artifact)
  return `handle ${artifact.id} ${artifact.type} [${artifact.status}]${decision} ${artifact.uri}${source ? ` (${source})` : ""}`
}

function formatArtifactSource(artifact: Lightbulb.ArtifactHandle) {
  return [
    artifact.source?.issueRef ? `issue ${artifact.source.issueRef}` : undefined,
    artifact.source?.goalID ? `goal ${artifact.source.goalID}` : undefined,
    artifact.source?.loopID ? `loop ${artifact.source.loopID}` : undefined,
    artifact.source?.runID ? `run ${artifact.source.runID}` : undefined,
    artifact.source?.gateID ? `gate ${artifact.source.gateID}` : undefined,
  ]
    .filter((part): part is string => part !== undefined)
    .join(", ")
}

function countLoops(dashboard: Lightbulb.Dashboard) {
  return dashboard.goals.reduce((sum, goal) => sum + goal.loops.length, 0)
}

function countRuns(dashboard: Lightbulb.Dashboard) {
  return dashboard.goals.reduce(
    (sum, goal) => sum + goal.loops.reduce((loopSum, loop) => loopSum + loop.runs.length, 0),
    0,
  )
}

function summarizeWorkers(workers: readonly { readonly id: string; readonly status: string; readonly role: string }[]) {
  if (workers.length === 0) return "none"
  return workers.map((worker) => `${worker.id} [${worker.status}] ${worker.role}`).join(", ")
}

function summarizeGates(gates: readonly Lightbulb.DashboardGate[]) {
  if (gates.length === 0) return "none"
  return gates.map(formatGate).join(", ")
}

function formatGate(gate: Lightbulb.DashboardGate) {
  return `${gate.id} ${gate.kind} [${gate.status}] artifact=${gate.artifactID ?? "none"}`
}

function formatMissingReasons(reasons: readonly string[]) {
  if (reasons.length === 0) return "none"
  return reasons.join(",")
}

function formatOperationSource(source: Record<string, unknown>) {
  return Object.entries(source)
    .map(([key, value]) => `${key}=${String(value)}`)
    .join(" ")
}
