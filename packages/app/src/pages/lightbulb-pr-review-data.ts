import type { LightbulbPrReviewRouteSummary } from "@opencode-ai/sdk/v2/client"

export type PRReviewRoute = LightbulbPrReviewRouteSummary

export function routeStats(routes: readonly PRReviewRoute[]) {
  return {
    active: routes.filter((route) => route.status === "active").length,
    blocked: routes.filter((route) => route.status === "blocked" || route.blockedReason).length,
    mergeReady: routes.filter((route) => route.mergeReady).length,
  }
}

export function formatWakeSource(source: PRReviewRoute["nextWakeSource"] | undefined) {
  if (!source) return "None"
  return source
    .split("_")
    .map(formatWord)
    .join(" ")
}

export function formatStatus(status: string | undefined) {
  if (!status) return "Unknown"
  return status
    .split("_")
    .map(formatWord)
    .join(" ")
}

export function formatTimestamp(value: number | string | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "Not recorded"
  return new Date(value).toLocaleString()
}

export function currentStopLabel(route: PRReviewRoute) {
  if (!route.currentStop) return "No active stop"
  return `${formatStatus(route.currentStop.kind)} · ${route.currentStop.title} · ${formatStatus(route.currentStop.status)}`
}

export function latestEvidenceSummary(route: PRReviewRoute) {
  if (!route.latestEvidence) return "No evidence recorded"
  return [
    formatWakeSource(route.latestEvidence.source),
    route.latestEvidence.status ? formatStatus(route.latestEvidence.status) : undefined,
    route.latestEvidence.artifactID,
    route.latestEvidence.summary,
  ]
    .filter((part): part is string => !!part)
    .join(" · ")
}

export function blockedReason(route: PRReviewRoute) {
  return route.blockedReason ?? "None"
}

function formatWord(value: string) {
  if (value === "ci") return "CI"
  if (value === "pr") return "PR"
  return value.slice(0, 1).toUpperCase() + value.slice(1)
}
