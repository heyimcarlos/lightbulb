import { describe, expect, test } from "bun:test"
import { Lightbulb } from "@opencode-ai/core/lightbulb"

const accountID = "lbacc_dependency_reconcile" as Lightbulb.AccountID

describe("Lightbulb dependency unblock reconciliation", () => {
  test("unblocks a dependency-only issue when the dependency issue is closed", () => {
    const result = Lightbulb.reconcileDependencyUnblocks({
      snapshots: [
        snapshot(29, "Dependency unblock reconciliation", ["ready-for-agent", "blocked-by-dependency"], {
          dependencyRefs: ["#10"],
          blockedReason: "Blocked by #10.",
        }),
        snapshot(10, "Review gate schema", ["agent-done"], { state: "closed" }),
      ],
      now: 100,
    })
    const reconciled = result.snapshots.find((item) => item.number === 29)
    const intake = Lightbulb.ingestIssueQueueSnapshots({ snapshots: result.snapshots.filter((item) => item.number === 29) })

    expect(reconciled?.labels).toEqual(["ready-for-agent"])
    expect(reconciled?.dependencyRefs).toEqual([])
    expect(reconciled?.blockedReason).toBe("None - dependency satisfied by github:issue:10:closed.")
    expect(intake.classifications[0]?.status).toBe("ready")
    expect(result.mutations).toEqual([
      expect.objectContaining({
        issueRef: "#29",
        removeLabels: ["blocked-by-dependency"],
        setBlockedReason: "None - dependency satisfied by github:issue:10:closed.",
        evidenceHandles: ["github:issue:10:closed"],
      }),
    ])
    expect(result.events.map((event) => [event.issueRef, event.evidenceHandles])).toEqual([
      ["#29", ["github:issue:10:closed"]],
    ])
    expect(result.operatorSummaries).toEqual([
      {
        issueRef: "#29",
        issueHandle: "github:issue:29",
        title: "Dependency unblock reconciliation",
        status: "dependency_satisfied",
        evidenceHandles: ["github:issue:10:closed"],
        remainingHoldRefs: [],
        summary: "Issue #29 dependency hold cleared by github:issue:10:closed.",
      },
    ])
  })

  test("unblocks an issue from integrated open dependency evidence", () => {
    const result = Lightbulb.reconcileDependencyUnblocks({
      snapshots: [
        snapshot(29, "Dependency unblock reconciliation", ["ready-for-agent", "blocked-by-dependency"], {
          dependencyRefs: ["#12"],
        }),
        snapshot(12, "Issue queue intake", ["agent-integrated"], { state: "open" }),
      ],
    })

    expect(result.snapshots.find((item) => item.number === 29)?.blockedReason).toBe(
      "None - dependency satisfied by github:issue:12:integrated.",
    )
    expect(result.operatorSummaries[0]?.evidenceHandles).toEqual(["github:issue:12:integrated"])
  })

  test("unblocks an issue from base-ref evidence tied to the dependency", () => {
    const result = Lightbulb.reconcileDependencyUnblocks({
      snapshots: [
        snapshot(29, "Dependency unblock reconciliation", ["ready-for-agent", "blocked-by-dependency"], {
          dependencyRefs: ["#22"],
        }),
      ],
      baseBranchEvidence: [
        {
          dependencyRef: "#22",
          baseRef: "origin/lightbulb",
          commitSha: "abc1234",
          filePath: "packages/core/src/lightbulb/worker-launch.ts",
          summary: "worker launch adapter merged on origin/lightbulb",
        },
      ],
    })

    expect(result.snapshots.find((item) => item.number === 29)?.dependencyRefs).toEqual([])
    expect(result.operatorSummaries[0]?.evidenceHandles).toEqual(["git:origin/lightbulb:abc1234"])
  })

  test("unblocks an issue from accepted integration gate evidence", () => {
    const result = Lightbulb.reconcileDependencyUnblocks({
      snapshots: [
        snapshot(29, "Dependency unblock reconciliation", ["ready-for-agent", "blocked-by-dependency"], {
          dependencyRefs: ["#10"],
        }),
      ],
      integrationGateEvidence: [
        {
          dependencyRef: "#10",
          gateID: "lbgate_accepted" as Lightbulb.GateID,
          status: "accepted",
          summary: "Review gate accepted #10 artifacts.",
        },
      ],
    })

    expect(result.snapshots.find((item) => item.number === 29)?.blockedReason).toBe(
      "None - dependency satisfied by lightbulb:gate:lbgate_accepted:accepted.",
    )
    expect(result.mutations[0]?.evidenceHandles).toEqual(["lightbulb:gate:lbgate_accepted:accepted"])
  })

  test("preserves mixed human, budget, context, and ADR holds after dependency evidence lands", () => {
    const result = Lightbulb.reconcileDependencyUnblocks({
      snapshots: [
        snapshot(
          29,
          "Dependency unblock reconciliation",
          ["ready-for-agent", "blocked-by-dependency", "needs-info", "budget-held", "context-policy-held", "adr-gate-held"],
          {
            dependencyRefs: ["#10"],
            blockedReason: "Blocked by #10, needs-info, budget, context, and ADR gate.",
          },
        ),
        snapshot(10, "Review gate schema", ["agent-integrated"]),
      ],
    })
    const reconciled = result.snapshots.find((item) => item.number === 29)
    const intake = Lightbulb.ingestIssueQueueSnapshots({ snapshots: result.snapshots.filter((item) => item.number === 29) })

    expect(reconciled?.labels).toEqual(["ready-for-agent", "needs-info", "budget-held", "context-policy-held", "adr-gate-held"])
    expect(reconciled?.dependencyRefs).toEqual([])
    expect(reconciled?.blockedReason).toBe(
      "Still blocked by label:needs-info, label:budget-held, label:context-policy-held, label:adr-gate-held; dependency satisfied by github:issue:10:integrated.",
    )
    expect(intake.classifications[0]?.status).toBe("human_held")
    expect(intake.classifications[0]?.blockerRefs).toEqual([
      "label:needs-info",
      "label:budget-held",
      "label:context-policy-held",
      "label:adr-gate-held",
    ])
    expect(result.operatorSummaries[0]?.status).toBe("remaining_holds")
  })

  test("keeps dependency holds when no explicit evidence is present", () => {
    const result = Lightbulb.reconcileDependencyUnblocks({
      snapshots: [
        snapshot(29, "Dependency unblock reconciliation", ["ready-for-agent", "blocked-by-dependency"], {
          dependencyRefs: ["#999"],
        }),
      ],
      integrationGateEvidence: [
        {
          dependencyRef: "#999",
          gateID: "lbgate_pending" as Lightbulb.GateID,
          status: "pending",
          summary: "Integration gate is still pending.",
        },
      ],
    })
    const intake = Lightbulb.ingestIssueQueueSnapshots({ snapshots: result.snapshots })

    expect(result.snapshots[0]?.labels).toEqual(["ready-for-agent", "blocked-by-dependency"])
    expect(result.snapshots[0]?.dependencyRefs).toEqual(["#999"])
    expect(result.mutations).toEqual([])
    expect(result.events).toEqual([])
    expect(result.skipped).toEqual([
      {
        issueRef: "#29",
        issueHandle: "github:issue:29",
        title: "Dependency unblock reconciliation",
        dependencyRefs: ["#999"],
        reason: "missing_evidence",
        summary: "Issue #29 remains dependency-held; missing explicit evidence for #999.",
      },
    ])
    expect(intake.classifications[0]?.status).toBe("dependency_blocked")
  })

  test("retries dependency reconciliation without duplicating comments, labels, or events", () => {
    const input = {
      snapshots: [
        snapshot(29, "Dependency unblock reconciliation", ["ready-for-agent", "blocked-by-dependency"], {
          dependencyRefs: ["#10"],
        }),
        snapshot(10, "Review gate schema", ["agent-integrated"]),
      ],
    }
    const first = Lightbulb.reconcileDependencyUnblocks(input)
    const second = Lightbulb.reconcileDependencyUnblocks({ ...input, snapshots: first.snapshots })
    const reconciled = second.snapshots.find((item) => item.number === 29)

    expect(first.mutations).toHaveLength(1)
    expect(first.events).toHaveLength(1)
    expect(second.mutations).toEqual([])
    expect(second.events).toEqual([])
    expect(reconciled?.labels).toEqual(["ready-for-agent"])
    expect(reconciled?.comments).toHaveLength(1)
    expect(reconciled?.eventKeys).toHaveLength(1)
  })
})

function snapshot(
  number: number,
  title: string,
  labels: readonly string[],
  options?: {
    readonly state?: "open" | "closed"
    readonly dependencyRefs?: readonly string[]
    readonly blockedReason?: string
  },
) {
  return {
    accountID,
    number,
    title,
    url: "https://github.com/heyimcarlos/lightbulb/issues/" + number,
    labels,
    updatedAt: Date.UTC(2026, 0, number),
    state: options?.state,
    dependencyRefs: options?.dependencyRefs,
    blockedReason: options?.blockedReason,
  } satisfies Lightbulb.IssueQueueSnapshot
}
