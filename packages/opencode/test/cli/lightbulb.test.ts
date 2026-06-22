import { describe, expect, test } from "bun:test"
import { Effect } from "effect"
import { EOL } from "os"
import path from "node:path"
import { Lightbulb } from "@opencode-ai/core/lightbulb"
import { formatLightbulbDashboard } from "../../src/cli/cmd/lightbulb"
import { cliIt } from "../lib/cli-process"

const lightbulbEnv = { OPENCODE_CLI_NAME: "lightbulb", COLUMNS: "120" }
const packageRoot = path.resolve(import.meta.dir, "../..")

async function runPackageBin(args: readonly string[]) {
  const proc = Bun.spawn([process.execPath, path.join(packageRoot, "bin", "lightbulb"), ...args], {
    cwd: packageRoot,
    env: {
      ...process.env,
      COLUMNS: "120",
      OPENCODE_BIN_PATH: "",
      OPENCODE_CLI_NAME: "",
    },
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  })
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ])
  return { stdout, stderr, exitCode }
}

describe("lightbulb CLI entrypoint", () => {
  test("runs the direct package binary wrapper for the primary command path", async () => {
    const lightbulb = await runPackageBin(["dashboard", "--help"])

    expect(lightbulb.exitCode).toBe(0)
    expect(lightbulb.stderr).toContain("lightbulb dashboard")
    expect(lightbulb.stderr).not.toContain("opencode lightbulb dashboard")
  })

  test("does not expose opencode as a package binary", async () => {
    const packageJson = (await Bun.file(path.join(packageRoot, "package.json")).json()) as {
      bin?: Record<string, string>
    }

    expect(packageJson.bin).toEqual({ lightbulb: "./bin/lightbulb" })
    expect(await Bun.file(path.join(packageRoot, "bin", "opencode")).exists()).toBe(false)
  })

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
    "rejects the retired nested Lightbulb dashboard compatibility path",
    ({ opencode }) =>
      Effect.gen(function* () {
        const result = yield* opencode.spawn(["lightbulb", "dashboard", "--help"], { env: { COLUMNS: "120" } })

        opencode.expectExit(result, 1, "lightbulb lightbulb dashboard --help")
        expect(result.stderr).toContain("Nested Lightbulb command has been retired. Use: lightbulb dashboard --help")
        expect(result.stderr).not.toContain("opencode lightbulb dashboard")
      }),
    60_000,
  )

  cliIt.live(
    "fails fast for the inherited GitHub runner",
    ({ opencode }) =>
      Effect.gen(function* () {
        const result = yield* opencode.spawn(["github", "run"], { env: lightbulbEnv })

        opencode.expectExit(result, 1, "lightbulb github run")
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
    const prReviewRouteID = Lightbulb.RouteID.make("lbroute_pr_review")
    const prReviewStopID = Lightbulb.RouteStopID.make("lbstop_pr_review")
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
          prReviewCandidates: [
            {
              id: Lightbulb.PRReviewCandidateID.make("lbprcand_demo"),
              repository: "heyimcarlos/lightbulb",
              pullNumber: 65,
              title: "Discover PR review goal candidates",
              url: "https://github.com/heyimcarlos/lightbulb/pull/65",
              state: "open",
              status: "ready",
              baseRef: "dev",
              headRef: "pr-candidates",
              headSha: "28c26c4a4",
              lastSeenAt: Date.UTC(2026, 0, 1),
              lastCheckedAt: Date.UTC(2026, 0, 1),
              routeSeed: {
                sourceRef: "github:heyimcarlos/lightbulb/pull/65",
                repository: "heyimcarlos/lightbulb",
                pullNumber: 65,
                url: "https://github.com/heyimcarlos/lightbulb/pull/65",
                baseRef: "dev",
                headRef: "pr-candidates",
                headSha: "28c26c4a4",
              },
              evidence: {
                observedAt: Date.UTC(2026, 0, 1),
                source: { provider: "fixture" },
                reason: "returned_by_scan",
              },
            },
          ],
          prReviewRoutes: [
            {
              id: prReviewRouteID,
              goalID,
              candidateID: Lightbulb.PRReviewCandidateID.make("lbprcand_demo"),
              repository: "heyimcarlos/lightbulb",
              pullNumber: 65,
              title: "Discover PR review goal candidates",
              url: "https://github.com/heyimcarlos/lightbulb/pull/65",
              status: "active",
              currentStop: {
                id: prReviewStopID,
                kind: "review",
                title: "Collect review evidence",
                status: "active",
              },
              latestEvidence: {
                observedAt: Date.UTC(2026, 0, 1),
                source: "schedule_tick",
                summary: "Admitted PR review route.",
              },
              activeWorker: null,
              blockedReason: null,
              nextWakeSource: "worker_report",
              mergeReady: false,
              lastWokeAt: Date.UTC(2026, 0, 1),
            },
          ],
        },
        operations: {
          schedulerTicks: [],
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
    ).toBe(`Lightbulb Status
Account: Lightbulb Demo [active] lbacc_demo
Totals: 1 goals, 1 loops, 1 runs, 1 gates waiting

Work
- Bootstrap loop harness [active] lbgoal_demo
  Create one durable account control graph.
  - implementation loop [active] lbloop_demo - Implementation loop owns the active tracer run.
    run lbrun_demo [complete] - Worker returned a report artifact.
    checks: review requested, debug fixed, gate pending
    workers: lbworker_demo [complete] bounded implementation worker
    gates: lbgate_demo review [pending] artifact=lbartifact_demo
    artifacts: 1
    handle lbartifact_demo report [registered] .lightbulb/runs/issue-3-dashboard.md

Queue
- gate lbgate_demo review [pending] artifact=lbartifact_demo - Parent review is pending.
- packet lbpacket_demo Render Lightbulb dashboard [complete] worker=lbworker_demo
- pr-candidate heyimcarlos/lightbulb#65 [ready/open] Discover PR review goal candidates base=dev head=pr-candidates
- pr-route heyimcarlos/lightbulb#65 [active] Discover PR review goal candidates stop=review:active next=worker_report mergeReady=no

Artifacts
- handle lbartifact_demo report [registered] .lightbulb/runs/issue-3-dashboard.md
- handle lbartifact_decision adr [registered] decision=pending docs/lightbulb/adr/0005-issue-24-routing.md (issue #24, goal lbgoal_demo)`)
  })

  test("renders recent scheduler ticks as bounded operations state", () => {
    expect(
      formatLightbulbDashboard({
        account: {
          id: Lightbulb.AccountID.make("lbacc_ops"),
          name: "Lightbulb Ops",
          status: "active",
        },
        goals: [],
        inbox: {
          taskPackets: [],
          gates: [],
          prReviewCandidates: [],
          prReviewRoutes: [],
        },
        operations: {
          schedulerTicks: [
            {
              id: Lightbulb.EventID.make("lbevent_ops"),
              timeCreated: Date.UTC(2026, 0, 1),
              trigger: "schedule",
              admittedCount: 1,
              skippedCount: 1,
              outcomeCount: 2,
              source: { cron_id: "heartbeat" },
              outcomes: [
                {
                  loopID: Lightbulb.LoopID.make("lbloop_ops"),
                  profileID: "implementation",
                  kind: "implementation",
                  outcome: "admitted",
                  runID: Lightbulb.RunID.make("lbrun_ops"),
                  eventID: Lightbulb.EventID.make("lbevent_admitted"),
                  classification: "due",
                  reason: null,
                },
                {
                  loopID: Lightbulb.LoopID.make("lbloop_wait"),
                  profileID: "status",
                  kind: "status",
                  outcome: "skipped",
                  runID: null,
                  eventID: Lightbulb.EventID.make("lbevent_skipped"),
                  classification: "not_due",
                  reason: "next_due_at_in_future",
                },
              ],
            },
          ],
        },
        artifactHandles: [],
      }).replaceAll(EOL, "\n"),
    ).toBe(`Lightbulb Status
Account: Lightbulb Ops [active] lbacc_ops
Totals: 0 goals, 0 loops, 0 runs, 0 gates waiting

Work
- none

Operations
  scheduler tick lbevent_ops trigger=schedule admitted=1 skipped=1 outcomes=2
    source cron_id=heartbeat
    loop lbloop_ops implementation [admitted] classification=due reason=none run=lbrun_ops
    loop lbloop_wait status [skipped] classification=not_due reason=next_due_at_in_future run=none

Queue
- empty

Artifacts
- none`)
  })
})
