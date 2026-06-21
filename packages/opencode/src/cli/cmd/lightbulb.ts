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

const DashboardCommand = effectCmd({
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
  builder: (yargs: Argv) => yargs.command(DashboardCommand).demandCommand(),
  handler: Effect.fn("Cli.lightbulb")(function* () {}),
})

export function formatLightbulbDashboard(dashboard: Lightbulb.Dashboard) {
  return [
    "Lightbulb Dashboard",
    `Account ${dashboard.account.name} [${dashboard.account.status}] ${dashboard.account.id}`,
    "",
    "Goals / Loops / Runs",
    ...(
      dashboard.goals.length === 0
        ? ["  no goals"]
        : dashboard.goals.flatMap((goal) => [
            `  goal ${goal.id} [${goal.status}] ${goal.title}`,
            `    ${goal.summary}`,
            ...goal.loops.flatMap(formatLoop),
          ])
    ),
    "",
    "Inbox",
    ...formatInbox(dashboard),
    "",
    "Artifact Handles",
    ...(
      dashboard.artifactHandles.length === 0
        ? ["  no artifacts"]
        : dashboard.artifactHandles.map((artifact) => `  ${formatArtifactHandle(artifact)}`)
    ),
  ].join(EOL)
}

function formatLoop(loop: Lightbulb.DashboardLoop) {
  return [
    `    loop ${loop.id} ${loop.kind} [${loop.status}]`,
    `      ${loop.summary}`,
    ...(
      loop.runs.length === 0
        ? ["      no runs"]
        : loop.runs.flatMap((run) => [
            `      run ${run.id} [${run.status}] review=${run.reviewStatus} debug=${run.debugStatus} gate=${run.gateStatus}`,
            `        ${run.summary}`,
            "        workers",
            ...(
              run.workers.length === 0
                ? ["          no workers"]
                : run.workers.map((worker) => `          ${worker.id} ${worker.role} [${worker.status}]`)
            ),
            "        gates",
            ...(run.gates.length === 0 ? ["          no gates"] : run.gates.map((gate) => formatGate(gate))),
            "        artifacts",
            ...(
              run.artifacts.length === 0
                ? ["          no artifacts"]
                : run.artifacts.map((artifact) => `          ${formatArtifactHandle(artifact)}`)
            ),
          ])
    ),
  ]
}

function formatInbox(dashboard: Lightbulb.Dashboard) {
  if (dashboard.inbox.taskPackets.length === 0 && dashboard.inbox.gates.length === 0) return ["  empty"]
  return [
    ...dashboard.inbox.taskPackets.map(
      (packet) => `  packet ${packet.id} [${packet.status}] ${packet.title} worker=${packet.workerID}`,
    ),
    ...dashboard.inbox.gates.map((gate) => formatGate(gate, "  ")),
  ]
}

function formatGate(gate: Lightbulb.DashboardGate, indent = "          ") {
  return `${indent}gate ${gate.id} ${gate.kind} [${gate.status}] artifact=${gate.artifactID ?? "none"}`
}

function formatArtifactHandle(artifact: Lightbulb.ArtifactHandle) {
  const source = formatArtifactSource(artifact)
  const decision = artifact.decision ? ` decision=${artifact.decision.status}` : ""
  return `handle ${artifact.id} ${artifact.type} [${artifact.status}]${decision} ${artifact.uri}${source ? ` source=${source}` : ""}`
}

function formatArtifactSource(artifact: Lightbulb.ArtifactHandle) {
  return [
    artifact.source?.issueRef ? `issue:${artifact.source.issueRef}` : undefined,
    artifact.source?.goalID ? `goal:${artifact.source.goalID}` : undefined,
    artifact.source?.loopID ? `loop:${artifact.source.loopID}` : undefined,
    artifact.source?.runID ? `run:${artifact.source.runID}` : undefined,
    artifact.source?.gateID ? `gate:${artifact.source.gateID}` : undefined,
  ]
    .filter((part): part is string => part !== undefined)
    .join(",")
}
