import { describe, expect, test } from "bun:test"
import { EOL } from "os"
import { Lightbulb } from "@opencode-ai/core/lightbulb"
import { formatLightbulbDashboard } from "../../src/cli/cmd/lightbulb"

describe("lightbulb dashboard display", () => {
  test("renders the seeded account work graph as an operator surface", () => {
    const runID = Lightbulb.RunID.make("lbrun_demo")
    const workerID = Lightbulb.WorkerID.make("lbworker_demo")
    const artifactID = Lightbulb.ArtifactID.make("lbartifact_demo")
    const lineage = [
      {
        relation: "produced_by" as const,
        runID,
        workerID,
        summary: "Worker produced this artifact for parent review.",
      },
    ]

    expect(
      formatLightbulbDashboard({
        account: {
          id: Lightbulb.AccountID.make("lbacc_demo"),
          name: "Lightbulb Demo",
          status: "active",
        },
        goals: [
          {
            id: Lightbulb.GoalID.make("lbgoal_demo"),
            title: "Bootstrap loop harness",
            status: "open",
            summary: "Create one durable account control graph.",
            loops: [
              {
                id: Lightbulb.LoopID.make("lbloop_demo"),
                kind: "implementation",
                status: "active",
                summary: "Implementation loop owns the active tracer run.",
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
                    artifacts: [
                      {
                        id: artifactID,
                        type: "report",
                        uri: ".lightbulb/runs/issue-3-dashboard.md",
                        summary: "Dashboard worker report.",
                        status: "registered",
                        producerRunID: runID,
                        producerWorkerID: workerID,
                        lineage,
                      },
                    ],
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
          {
            id: artifactID,
            type: "report",
            uri: ".lightbulb/runs/issue-3-dashboard.md",
            summary: "Dashboard worker report.",
            status: "registered",
            producerRunID: runID,
            producerWorkerID: workerID,
            lineage,
          },
        ],
      }).replaceAll(EOL, "\n"),
    ).toBe(`Lightbulb Dashboard
Account Lightbulb Demo [active] lbacc_demo

Goals / Loops / Runs
  goal lbgoal_demo [open] Bootstrap loop harness
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
  handle lbartifact_demo report [registered] .lightbulb/runs/issue-3-dashboard.md`)
  })
})
