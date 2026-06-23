import { describe, expect, test } from "bun:test"
import {
  blockedReason,
  currentStopLabel,
  formatWakeSource,
  latestEvidenceSummary,
  routeStats,
  type PRReviewRoute,
} from "./lightbulb-pr-review-data"

const activeRoute = {
  id: "lbroute_active",
  goalID: "lbgoal_active",
  candidateID: "lbprcand_active",
  repository: "heyimcarlos/lightbulb",
  pullNumber: 72,
  title: "feat(core): route review evidence",
  url: "https://github.com/heyimcarlos/lightbulb/pull/72",
  status: "active",
  currentStop: {
    id: "lbstop_review",
    kind: "review",
    title: "Collect review evidence",
    status: "active",
  },
  latestEvidence: {
    observedAt: 1_782_145_200_000,
    source: "review_evidence",
    summary: "Copilot review pending; local reviewer passed.",
  },
  activeWorker: {
    id: "lbworker_review",
    role: "read-only reviewer",
    status: "running",
    summary: "Polling review evidence.",
  },
  nextWakeSource: "ci_evidence",
  mergeReady: false,
  lastWokeAt: 1_782_145_200_000,
} satisfies PRReviewRoute

describe("Lightbulb PR review route presentation", () => {
  test("summarizes active routes without worker transcripts", () => {
    expect(routeStats([activeRoute])).toEqual({ active: 1, blocked: 0, mergeReady: 0 })
    expect(currentStopLabel(activeRoute)).toBe("Review · Collect review evidence · Active")
    expect(latestEvidenceSummary(activeRoute)).toBe("Review Evidence · Copilot review pending; local reviewer passed.")
    expect(formatWakeSource(activeRoute.nextWakeSource)).toBe("CI Evidence")
  })

  test("keeps empty route states explicit", () => {
    const route = {
      ...activeRoute,
      currentStop: undefined,
      latestEvidence: undefined,
      activeWorker: undefined,
      blockedReason: "waiting_for_copilot_review",
      nextWakeSource: undefined,
      status: "blocked",
    } satisfies PRReviewRoute

    expect(routeStats([])).toEqual({ active: 0, blocked: 0, mergeReady: 0 })
    expect(routeStats([route])).toEqual({ active: 0, blocked: 1, mergeReady: 0 })
    expect(currentStopLabel(route)).toBe("No active stop")
    expect(latestEvidenceSummary(route)).toBe("No evidence recorded")
    expect(blockedReason(route)).toBe("waiting_for_copilot_review")
    expect(formatWakeSource(route.nextWakeSource)).toBe("None")
  })
})
