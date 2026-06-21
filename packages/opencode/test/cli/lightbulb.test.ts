import { describe, expect, test } from "bun:test"
import { Effect } from "effect"
import { EOL } from "os"
import { Lightbulb } from "@opencode-ai/core/lightbulb"
import { formatLightbulbDashboard } from "../../src/cli/cmd/lightbulb"
import { cliIt } from "../lib/cli-process"

const lightbulbEnv = { OPENCODE_CLI_NAME: "lightbulb", COLUMNS: "120" }

describe("lightbulb CLI entrypoint", () => {
  cliIt.live(
    "shows Lightbulb help at the binary root",
    ({ opencode }) =>
      Effect.gen(function* () {
        const result = yield* opencode.spawn(["--help"], { env: lightbulbEnv })

        opencode.expectExit(result, 0, "lightbulb --help")
        expect(result.stderr).toContain("lightbulb dashboard")
        expect(result.stderr).toContain("dashboard")
        expect(result.stderr).not.toContain("opencode lightbulb")
      }),
    60_000,
  )

  cliIt.live(
    "shows dashboard help without the nested opencode lightbulb prefix",
    ({ opencode }) =>
      Effect.gen(function* () {
        const result = yield* opencode.spawn(["dashboard", "--help"], { env: lightbulbEnv })

        opencode.expectExit(result, 0, "lightbulb dashboard --help")
        expect(result.stderr).toContain("lightbulb dashboard")
        expect(result.stderr).toContain("show the Lightbulb account work graph")
        expect(result.stderr).not.toContain("opencode lightbulb dashboard")
      }),
    60_000,
  )

  cliIt.live(
    "seeds and prints the dashboard through the top-level Lightbulb command",
    ({ opencode }) =>
      Effect.gen(function* () {
        const result = yield* opencode.spawn(["dashboard", "--seed", "--format", "json"], { env: lightbulbEnv })

        opencode.expectExit(result, 0, "lightbulb dashboard --seed --format json")
        const dashboard = JSON.parse(result.stdout) as Lightbulb.Dashboard
        expect(dashboard.account.id).toStartWith("lbacc_")
        expect(dashboard.goals).toHaveLength(1)
        expect(dashboard.artifactHandles).toHaveLength(1)
      }),
    60_000,
  )

  cliIt.live(
    "keeps the opencode lightbulb dashboard compatibility path",
    ({ opencode }) =>
      Effect.gen(function* () {
        const result = yield* opencode.spawn(["lightbulb", "dashboard", "--help"], { env: { COLUMNS: "120" } })

        opencode.expectExit(result, 0, "opencode lightbulb dashboard --help")
        expect(result.stderr).toContain("opencode lightbulb dashboard")
        expect(result.stderr).toContain("show the Lightbulb account work graph")
      }),
    60_000,
  )

  cliIt.live(
    "fails fast for the inherited GitHub runner",
    ({ opencode }) =>
      Effect.gen(function* () {
        const result = yield* opencode.spawn(["github", "run"])

        opencode.expectExit(result, 1, "opencode github run")
        expect(result.stderr).toContain("The inherited OpenCode GitHub runner is disabled in Lightbulb")
      }),
    60_000,
  )
})

describe("lightbulb dashboard display", () => {
  test("renders the seeded account work graph as an operator surface", () => {
    const goalID = Lightbulb.GoalID.make("lbgoal_demo")
    const runID = Lightbulb.RunID.make("lbrun_demo")
    const workerID = Lightbulb.WorkerID.make("lbworker_demo")
    const artifactID = Lightbulb.ArtifactID.make("lbartifact_demo")
    const decisionArtifactID = Lightbulb.ArtifactID.make("lbartifact_decision")
    const lineage = [
      {
        relation: "produced_by" as const,
        runID,
        workerID,
        summary: "Worker produced this artifact for parent review.",
      },
    ]
    const integrity = {
      status: "unchecked" as const,
      checksum: null,
      checkedAt: null,
      uncheckedReason: "fixture artifact content not checked",
      expectedSizeBytes: null,
      actualChecksum: null,
      actualSizeBytes: null,
    }
    const retentionPolicy = { mode: "keep" as const }
    const retentionDecision = "keep" as const

    const artifactHandle = {
      id: artifactID,
      type: "report" as const,
      uri: ".lightbulb/runs/issue-3-dashboard.md",
      summary: "Dashboard worker report.",
      status: "registered" as const,
      integrity: {
        status: "unchecked" as const,
        checksum: null,
        checkedAt: null,
        uncheckedReason: null,
        expectedSizeBytes: null,
        actualChecksum: null,
        actualSizeBytes: null,
      },
      retentionPolicy: { mode: "keep" as const },
      retentionDecision: "keep" as const,
      producerKind: "worker" as const,
      producerRunID: runID,
      producerWorkerID: workerID,
      source: {},
      lineage,
    }

    expect(
      formatLightbulbDashboard({
        account: {
          id: Lightbulb.AccountID.make("lbacc_demo"),
          name: "Lightbulb Demo",
          status: "active",
        },
        goals: [
          {
            id: goalID,
            title: "Bootstrap loop harness",
            status: "active",
            summary: "Create one durable account control graph.",
            loops: [
              {
                id: Lightbulb.LoopID.make("lbloop_demo"),
                kind: "implementation",
                status: "active",
                summary: "Implementation loop owns the active tracer run.",
                profileID: null,
                schedule: null,
                budget: null,
                scheduleClassification: "not_due",
                scheduleReason: "schedule_not_configured",
                runs: [
                  {
                    id: runID,
                    status: "complete",
                    reviewStatus: "requested",
                    debugStatus: "fixed",
                    gateStatus: "pending",
                    summary: "Worker returned a report artifact.",
                    workers: [
                      {
                        id: workerID,
                        role: "bounded implementation worker",
                        status: "complete",
                        summary: "Returned the dashboard worker report.",
                      },
                    ],
                    gates: [
                      {
                        id: Lightbulb.GateID.make("lbgate_demo"),
                        kind: "review",
                        status: "pending",
                        summary: "Parent review is pending.",
                        artifactID,
                      },
                    ],
                    artifacts: [artifactHandle],
                  },
                ],
              },
            ],
          },
        ],
        inbox: {
          taskPackets: [
            {
              id: Lightbulb.TaskPacketID.make("lbpacket_demo"),
              workerID,
              title: "Render Lightbulb dashboard",
              status: "complete",
            },
          ],
          gates: [
            {
              id: Lightbulb.GateID.make("lbgate_demo"),
              kind: "review",
              status: "pending",
              summary: "Parent review is pending.",
              artifactID,
            },
          ],
        },
        artifactHandles: [
          artifactHandle,
          {
            id: decisionArtifactID,
            type: "adr",
            uri: "docs/lightbulb/adr/0005-issue-24-routing.md",
            summary: "Issue 24 ADR decision artifact.",
            status: "registered",
            integrity,
            retentionPolicy,
            retentionDecision,
            producerKind: "harness",
            producerRunID: null,
            producerWorkerID: null,
            source: {
              issueRef: "#24",
              goalID,
            },
            decision: {
              title: "Issue 24 ADR decision artifact.",
              status: "pending",
              owner: "architecture",
              reviewer: null,
              supersedesArtifactID: null,
              supersededByArtifactID: null,
            },
            lineage: [],
          },
        ],
      }).replaceAll(EOL, "\n"),
    ).toBe(`Lightbulb Dashboard
Account Lightbulb Demo [active] lbacc_demo

Goals / Loops / Runs
  goal lbgoal_demo [active] Bootstrap loop harness
    Create one durable account control graph.
    loop lbloop_demo implementation [active]
      Implementation loop owns the active tracer run.
      run lbrun_demo [complete] review=requested debug=fixed gate=pending
        Worker returned a report artifact.
        workers
          lbworker_demo bounded implementation worker [complete]
        gates
          gate lbgate_demo review [pending] artifact=lbartifact_demo
        artifacts
          handle lbartifact_demo report [registered] .lightbulb/runs/issue-3-dashboard.md

Inbox
  packet lbpacket_demo [complete] Render Lightbulb dashboard worker=lbworker_demo
  gate lbgate_demo review [pending] artifact=lbartifact_demo

Artifact Handles
  handle lbartifact_demo report [registered] .lightbulb/runs/issue-3-dashboard.md
  handle lbartifact_decision adr [registered] decision=pending docs/lightbulb/adr/0005-issue-24-routing.md source=issue:#24,goal:lbgoal_demo`)
  })
})
