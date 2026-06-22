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

const decodeAccountID = Schema.decodeUnknownOption(Lightbulb.AccountID)

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

export const LightbulbCommand = effectCmd({
  command: "lightbulb",
  describe: "Lightbulb account orchestration tools",
  instance: false,
  builder: (yargs: Argv) => yargs.command(LightbulbDashboardCommand).demandCommand(),
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
    ...formatOperations(dashboard),
    "",
    "Queue",
    ...formatInbox(dashboard),
    "",
    "Artifacts",
    ...(dashboard.artifactHandles.length === 0
      ? ["- none"]
      : dashboard.artifactHandles.map((artifact) => `- ${formatArtifactHandle(artifact)}`)),
  ].join(EOL)
}

function formatGoal(goal: Lightbulb.DashboardGoal) {
  return [
    `- ${goal.title} [${goal.status}] ${goal.id}`,
    `  ${goal.summary}`,
    ...(goal.loops.length === 0 ? ["  loops: none"] : goal.loops.flatMap(formatLoop)),
  ]
}

function formatOperations(dashboard: Lightbulb.Dashboard) {
  if (dashboard.operations.schedulerTicks.length === 0) return []
  return [
    "",
    "Operations",
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

function formatLoop(loop: Lightbulb.DashboardLoop) {
  return [
    `  - ${loop.kind} loop [${loop.status}] ${loop.id} - ${loop.summary}`,
    ...(
      loop.runs.length === 0
        ? ["    runs: none"]
        : loop.runs.flatMap((run) => [
            `    run ${run.id} [${run.status}] - ${run.summary}`,
            `    checks: review ${run.reviewStatus}, debug ${run.debugStatus}, gate ${run.gateStatus}`,
            `    workers: ${summarizeStatuses(run.workers)}`,
            `    gates: ${summarizeGates(run.gates)}`,
            `    artifacts: ${run.artifacts.length}`,
          ])
    ),
  ]
}

function formatInbox(dashboard: Lightbulb.Dashboard) {
  if (dashboard.inbox.taskPackets.length === 0 && dashboard.inbox.gates.length === 0) return ["- empty"]
  return [
    ...dashboard.inbox.gates.map((gate) => `- gate ${formatGate(gate)} - ${gate.summary}`),
    ...dashboard.inbox.taskPackets.map((packet) => `- packet ${packet.title} [${packet.status}] worker=${packet.workerID}`),
  ]
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

function summarizeStatuses(items: readonly { readonly status: string }[]) {
  if (items.length === 0) return "none"
  return [
    ...items
      .reduce((counts, item) => counts.set(item.status, (counts.get(item.status) ?? 0) + 1), new Map<string, number>())
      .entries(),
  ]
    .map(([status, count]) => `${count} ${status}`)
    .join(", ")
}

function summarizeGates(gates: readonly Lightbulb.DashboardGate[]) {
  if (gates.length === 0) return "none"
  return gates.map(formatGate).join(", ")
}

function formatGate(gate: Lightbulb.DashboardGate) {
  return `${gate.id} ${gate.kind} [${gate.status}] artifact=${gate.artifactID ?? "none"}`
}

function formatOperationSource(source: Record<string, unknown>) {
  return Object.entries(source)
    .map(([key, value]) => `${key}=${String(value)}`)
    .join(" ")
}
