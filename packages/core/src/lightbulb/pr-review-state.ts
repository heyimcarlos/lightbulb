import { asc, eq, inArray } from "drizzle-orm"
import { Effect } from "effect"
import type { Database } from "../database/database"
import type { Lightbulb } from "../lightbulb"
import { toPRReviewRouteSummary } from "./pr-review-route"
import {
  LightbulbPRReviewRouteTable,
  LightbulbPRReviewRouteWakeTable,
  LightbulbRouteStopTable,
} from "./sql"

type PRReviewRouteRow = typeof LightbulbPRReviewRouteTable.$inferSelect
type PRReviewRouteWakeRow = typeof LightbulbPRReviewRouteWakeTable.$inferSelect
type RouteStopRow = typeof LightbulbRouteStopTable.$inferSelect

export type PRReviewRouteDigestInput = {
  readonly accountID: Lightbulb.AccountID
  readonly now?: number
  readonly recentRetentionMs?: number
  readonly maxAttempts?: number
}

export function readPRReviewRouteDigestInDb(db: Database.Interface["db"], input: PRReviewRouteDigestInput) {
  return Effect.gen(function* () {
    const routes = yield* db
      .select()
      .from(LightbulbPRReviewRouteTable)
      .where(eq(LightbulbPRReviewRouteTable.account_id, input.accountID))
      .orderBy(asc(LightbulbPRReviewRouteTable.repository), asc(LightbulbPRReviewRouteTable.pr_number))
      .all()
      .pipe(Effect.orDie)
    if (routes.length === 0) return emptyDigest()

    const routeIDs = routes.map((route) => route.id)
    const stops = yield* db
      .select()
      .from(LightbulbRouteStopTable)
      .where(inArray(LightbulbRouteStopTable.route_id, routeIDs))
      .orderBy(asc(LightbulbRouteStopTable.sequence))
      .all()
      .pipe(Effect.orDie)
    const wakes = yield* db
      .select()
      .from(LightbulbPRReviewRouteWakeTable)
      .where(inArray(LightbulbPRReviewRouteWakeTable.route_id, routeIDs))
      .orderBy(asc(LightbulbPRReviewRouteWakeTable.time_created))
      .all()
      .pipe(Effect.orDie)

    return toPRReviewRouteDigest(routes, stops, wakes, input)
  })
}

export function toPRReviewRouteDigest(
  routes: readonly PRReviewRouteRow[],
  stops: readonly RouteStopRow[],
  wakes: readonly PRReviewRouteWakeRow[],
  options?: {
    readonly now?: number
    readonly recentRetentionMs?: number
    readonly maxAttempts?: number
  },
): Lightbulb.PRReviewRouteDigest {
  const now = options?.now ?? Date.now()
  const recentRetentionMs = options?.recentRetentionMs ?? 24 * 60 * 60 * 1_000
  return routes.reduce((digest, route) => {
    const item = toDigestItem(
      route,
      stops.filter((stop) => stop.route_id === route.id),
      wakes.filter((wake) => wake.route_id === route.id),
      options?.maxAttempts ?? 2,
    )
    if (route.status === "complete" || route.status === "held") {
      if ((item.lastWokeAt ?? route.time_updated) >= now - recentRetentionMs) return { ...digest, recent: [...digest.recent, item] }
      return digest
    }
    if (item.escalationReasons.length > 0) return { ...digest, escalated: [...digest.escalated, item] }
    return { ...digest, watched: [...digest.watched, item] }
  }, emptyDigest())
}

function toDigestItem(
  route: PRReviewRouteRow,
  stops: readonly RouteStopRow[],
  wakes: readonly PRReviewRouteWakeRow[],
  maxAttempts: number,
): Lightbulb.PRReviewRouteDigestItem {
  const summary = toPRReviewRouteSummary(route, stops)
  const attemptCount = wakes.filter((wake) => wake.source !== "schedule_tick").length
  const status = digestStatus(summary)
  const latestEvidence = compactEvidence(summary.latestEvidence)
  return {
    routeID: summary.id,
    candidateID: summary.candidateID,
    repository: summary.repository,
    pullNumber: summary.pullNumber,
    title: summary.title,
    url: summary.url,
    status,
    routeStatus: summary.status,
    currentStop: summary.currentStop,
    attemptCount,
    maxAttempts,
    lastAction: summary.latestEvidence?.summary ?? "No route wake recorded.",
    latestEvidence,
    activeWorker: summary.activeWorker,
    humanDecision: humanDecision(summary),
    blockedReason: summary.blockedReason,
    escalationReasons: escalationReasons(summary, attemptCount, maxAttempts),
    nextWakeSource: summary.nextWakeSource,
    mergeReady: summary.mergeReady,
    lastWokeAt: summary.lastWokeAt,
  }
}

function digestStatus(route: Lightbulb.PRReviewRouteSummary): Lightbulb.PRReviewRouteDigestStatus {
  if (route.blockedReason || route.status === "blocked") return "blocked"
  if (route.mergeReady) return "ready"
  if (route.latestEvidence?.source === "ci_evidence" && failedStatus(route.latestEvidence.status)) return "ci_red"
  if (route.latestEvidence?.source === "review_evidence" && changesRequestedStatus(route.latestEvidence.status)) {
    return "changes_requested"
  }
  return "idle"
}

function failedStatus(status: string | undefined) {
  return status === "failure" || status === "failed" || status === "error"
}

function changesRequestedStatus(status: string | undefined) {
  return status === "changes_requested" || status === "requested_changes"
}

function humanDecision(route: Lightbulb.PRReviewRouteSummary) {
  const value = route.latestEvidence?.data?.humanDecision
  if (typeof value === "string" && value.trim()) return value.trim()
  if (route.nextWakeSource !== "human_steering") return null
  if (route.mergeReady) return "merge_ready"
  return "waiting_for_human"
}

function compactEvidence(evidence: Lightbulb.PRReviewRouteEvidence | null) {
  if (!evidence) return null
  const data = evidence.data
    ? Object.fromEntries(
        Object.entries(evidence.data).filter(([key]) => !["rawTranscript", "rawWorkerLog", "rawLog", "transcript"].includes(key)),
      )
    : undefined
  return {
    ...evidence,
    data: data && Object.keys(data).length > 0 ? data : undefined,
  }
}

function escalationReasons(route: Lightbulb.PRReviewRouteSummary, attemptCount: number, maxAttempts: number) {
  return [
    route.blockedReason,
    attemptCount >= maxAttempts && !route.mergeReady ? "attempt_budget_exhausted" : undefined,
  ].filter((reason): reason is string => typeof reason === "string" && reason.length > 0)
}

function emptyDigest(): Lightbulb.PRReviewRouteDigest {
  return {
    watched: [],
    escalated: [],
    recent: [],
  }
}
