import { and, asc, eq, inArray } from "drizzle-orm"
import { Effect } from "effect"
import type { Database } from "../database/database"
import type { Lightbulb } from "../lightbulb"
import {
  LightbulbEventTable,
  LightbulbGoalTable,
  LightbulbPRReviewCandidateTable,
  LightbulbPRReviewRouteTable,
  LightbulbPRReviewRouteWakeTable,
  LightbulbRouteStopTable,
  LightbulbRouteTable,
} from "./sql"

type LightbulbTransaction = Parameters<Parameters<Database.Interface["db"]["transaction"]>[0]>[0]

export type PRReviewRouteAdmissionServiceInput = {
  readonly accountID: Lightbulb.AccountID
  readonly candidateID: Lightbulb.PRReviewCandidateID
  readonly now?: number
  readonly wakeSource?: Lightbulb.PRReviewRouteWakeSource
  readonly source?: Record<string, unknown>
}

export type PRReviewRouteAdmissionResult = {
  readonly outcome: "admitted" | "adopted" | "held"
  readonly eventID: Lightbulb.EventID
  readonly route: Lightbulb.PRReviewRouteSummary | undefined
  readonly heldReason: string | null
}

export type PRReviewRouteWakeServiceInput = {
  readonly routeID: Lightbulb.RouteID
  readonly source: Lightbulb.PRReviewRouteWakeSource
  readonly summary: string
  readonly now?: number
  readonly artifactID?: Lightbulb.ArtifactID
  readonly status?: string
  readonly data?: Record<string, unknown>
  readonly activeWorker?: Lightbulb.PRReviewRouteWorkerHandle | null
  readonly blockedReason?: string | null
  readonly nextWakeSource?: Lightbulb.PRReviewRouteWakeSource | null
  readonly currentStopKind?: Lightbulb.RouteStopKind
  readonly mergeReady?: boolean
  readonly metadata?: Record<string, unknown>
}

export type PRReviewRouteWakeResult = {
  readonly eventID: Lightbulb.EventID
  readonly wakeID: Lightbulb.PRReviewRouteWakeID
  readonly route: Lightbulb.PRReviewRouteSummary
}

export function admitPRReviewRouteInDb(
  db: Database.Interface["db"],
  input: PRReviewRouteAdmissionServiceInput,
  ids: {
    readonly goal: () => Lightbulb.GoalID
    readonly route: () => Lightbulb.RouteID
    readonly stop: () => Lightbulb.RouteStopID
    readonly wake: () => Lightbulb.PRReviewRouteWakeID
    readonly event: () => Lightbulb.EventID
  },
) {
  const now = input.now ?? Date.now()
  return db
    .transaction((tx) =>
      Effect.gen(function* () {
        const candidate = yield* tx
          .select()
          .from(LightbulbPRReviewCandidateTable)
          .where(
            and(
              eq(LightbulbPRReviewCandidateTable.account_id, input.accountID),
              eq(LightbulbPRReviewCandidateTable.id, input.candidateID),
            ),
          )
          .get()
        if (!candidate) return yield* Effect.die(new Error("Lightbulb PR review candidate not found"))

        const existing = yield* tx
          .select()
          .from(LightbulbPRReviewRouteTable)
          .where(
            and(
              eq(LightbulbPRReviewRouteTable.account_id, input.accountID),
              eq(LightbulbPRReviewRouteTable.candidate_id, input.candidateID),
            ),
          )
          .get()
        if (existing) return yield* adoptedRoute(tx, existing.id, input.accountID, now, ids.event)

        if (candidate.status !== "ready" || candidate.state !== "open") {
          return yield* heldRoute(tx, input.accountID, undefined, "candidate_not_ready", candidate, now, ids.event)
        }

        const active = yield* tx
          .select()
          .from(LightbulbPRReviewRouteTable)
          .where(
            and(
              eq(LightbulbPRReviewRouteTable.account_id, input.accountID),
              eq(LightbulbPRReviewRouteTable.repository, candidate.repository),
              inArray(LightbulbPRReviewRouteTable.status, activeRouteStatuses),
            ),
          )
          .get()
        if (active) {
          return yield* heldRoute(tx, input.accountID, active.id, "active_repository_route", candidate, now, ids.event)
        }

        const goalID = ids.goal()
        const routeID = ids.route()
        const stops = prReviewStops(candidate).map((stop, sequence) => ({ ...stop, id: ids.stop(), sequence }))
        const evidence = admissionEvidence(candidate, now, input.wakeSource ?? "schedule_tick", input.source)
        const wakeID = ids.wake()
        const eventID = ids.event()

        yield* tx
          .insert(LightbulbGoalTable)
          .values({
            id: goalID,
            account_id: input.accountID,
            title: `Review ${candidate.repository}#${candidate.pr_number}`,
            objective: `Review pull request ${candidate.url} without mutating or merging it.`,
            source_ref: candidate.route_seed.sourceRef,
            status: "active",
            summary: `Read-only PR review route for ${candidate.repository}#${candidate.pr_number}.`,
            metadata: {
              kind: "pr_review_route",
              candidateID: candidate.id,
              repository: candidate.repository,
              pullNumber: candidate.pr_number,
            },
            time_created: now,
            time_updated: now,
          })
          .run()
        yield* tx
          .insert(LightbulbRouteTable)
          .values({
            id: routeID,
            account_id: input.accountID,
            goal_id: goalID,
            destination: "merge-readiness-report",
            status: "active",
            current_stop_id: stops[0]!.id,
            summary: `Route ${candidate.repository}#${candidate.pr_number} through read-only PR review.`,
            metadata: { kind: "pr_review", candidateID: candidate.id },
            time_created: now,
            time_updated: now,
          })
          .run()
        yield* Effect.all(
          stops.map((stop) =>
            tx
              .insert(LightbulbRouteStopTable)
              .values({
                id: stop.id,
                account_id: input.accountID,
                route_id: routeID,
                sequence: stop.sequence,
                kind: stop.kind,
                status: stop.sequence === 0 ? "active" : "pending",
                title: stop.title,
                objective: stop.objective,
                evidence: stop.evidence,
                metadata: stop.metadata,
                time_created: now,
                time_updated: now,
              })
              .run(),
          ),
        )
        yield* tx
          .insert(LightbulbPRReviewRouteTable)
          .values({
            id: routeID,
            account_id: input.accountID,
            candidate_id: candidate.id,
            goal_id: goalID,
            repository: candidate.repository,
            active_repository_key: candidate.repository,
            pr_number: candidate.pr_number,
            title: candidate.title,
            url: candidate.url,
            status: "active",
            current_stop_id: stops[0]!.id,
            latest_evidence: evidence,
            active_worker: null,
            blocked_reason: null,
            next_wake_source: "worker_report",
            merge_ready: false,
            last_wake_at: now,
            metadata: { baseRef: candidate.base_ref, headRef: candidate.head_ref, headSha: candidate.head_sha },
            time_created: now,
            time_updated: now,
          })
          .run()
        yield* insertWake(tx, {
          wakeID,
          accountID: input.accountID,
          routeID,
          source: evidence.source,
          summary: evidence.summary,
          evidence,
          activeWorker: null,
          blockedReason: null,
          nextWakeSource: "worker_report",
          currentStopID: stops[0]!.id,
          mergeReady: false,
          now,
          metadata: input.source,
        })
        yield* tx
          .insert(LightbulbEventTable)
          .values({
            id: eventID,
            account_id: input.accountID,
            aggregate_type: "pr_review_route",
            aggregate_id: routeID,
            type: "lightbulb.pr_review_route.admitted",
            summary: `Admitted PR review route for ${candidate.repository}#${candidate.pr_number}.`,
            data: {
              candidate_id: candidate.id,
              route_id: routeID,
              goal_id: goalID,
              repository: candidate.repository,
              pr_number: candidate.pr_number,
              current_stop_id: stops[0]!.id,
              next_wake_source: "worker_report",
              review_only: true,
            },
            time_created: now,
          })
          .run()

        return {
          outcome: "admitted" as const,
          eventID,
          route: yield* readPRReviewRouteSummary(tx, routeID),
          heldReason: null,
        }
      }),
    )
    .pipe(Effect.orDie)
}

export function recordPRReviewRouteWakeInDb(
  db: Database.Interface["db"],
  input: PRReviewRouteWakeServiceInput,
  ids: {
    readonly wake: () => Lightbulb.PRReviewRouteWakeID
    readonly event: () => Lightbulb.EventID
  },
) {
  const now = input.now ?? Date.now()
  return db
    .transaction((tx) =>
      Effect.gen(function* () {
        const route = yield* tx
          .select()
          .from(LightbulbPRReviewRouteTable)
          .where(eq(LightbulbPRReviewRouteTable.id, input.routeID))
          .get()
        if (!route) return yield* Effect.die(new Error("Lightbulb PR review route not found"))

        const stops = yield* tx
          .select()
          .from(LightbulbRouteStopTable)
          .where(eq(LightbulbRouteStopTable.route_id, input.routeID))
          .orderBy(asc(LightbulbRouteStopTable.sequence))
          .all()
        const currentStop = input.currentStopKind
          ? stops.find((stop) => stop.kind === input.currentStopKind)
          : stops.find((stop) => stop.id === route.current_stop_id)
        if (input.currentStopKind && !currentStop) {
          return yield* Effect.die(new Error("Lightbulb PR review route stop not found"))
        }

        const evidence = wakeEvidence(input, now)
        const wakeID = ids.wake()
        const eventID = ids.event()
        const activeWorker = input.activeWorker === undefined ? route.active_worker ?? null : input.activeWorker
        const blockedReason = input.blockedReason === undefined ? route.blocked_reason : input.blockedReason
        const nextWakeSource = input.nextWakeSource === undefined ? route.next_wake_source : input.nextWakeSource
        const mergeReady = input.mergeReady ?? route.merge_ready

        if (currentStop && currentStop.id !== route.current_stop_id && route.current_stop_id) {
          yield* tx
            .update(LightbulbRouteStopTable)
            .set({ status: "complete", time_updated: now })
            .where(eq(LightbulbRouteStopTable.id, route.current_stop_id))
            .run()
        }
        if (currentStop) {
          yield* tx
            .update(LightbulbRouteStopTable)
            .set({ status: blockedReason ? "blocked" : "active", time_updated: now })
            .where(eq(LightbulbRouteStopTable.id, currentStop.id))
            .run()
        }
        yield* tx
          .update(LightbulbRouteTable)
          .set({
            status: blockedReason ? "blocked" : "active",
            current_stop_id: currentStop?.id ?? route.current_stop_id,
            time_updated: now,
          })
          .where(eq(LightbulbRouteTable.id, input.routeID))
          .run()
        yield* tx
          .update(LightbulbPRReviewRouteTable)
          .set({
            status: blockedReason ? "blocked" : "active",
            active_repository_key: route.repository,
            current_stop_id: currentStop?.id ?? route.current_stop_id,
            latest_evidence: evidence,
            active_worker: activeWorker,
            blocked_reason: blockedReason,
            next_wake_source: nextWakeSource,
            merge_ready: mergeReady,
            last_wake_at: now,
            time_updated: now,
          })
          .where(eq(LightbulbPRReviewRouteTable.id, input.routeID))
          .run()
        yield* insertWake(tx, {
          wakeID,
          accountID: route.account_id,
          routeID: input.routeID,
          source: input.source,
          summary: input.summary,
          evidence,
          activeWorker,
          blockedReason,
          nextWakeSource,
          currentStopID: currentStop?.id ?? route.current_stop_id,
          mergeReady,
          now,
          metadata: input.metadata,
        })
        yield* tx
          .insert(LightbulbEventTable)
          .values({
            id: eventID,
            account_id: route.account_id,
            aggregate_type: "pr_review_route",
            aggregate_id: input.routeID,
            type: "lightbulb.pr_review_route.woke",
            summary: input.summary,
            data: {
              route_id: input.routeID,
              source: input.source,
              current_stop_id: currentStop?.id ?? route.current_stop_id,
              active_worker_id: activeWorker?.id ?? null,
              blocked_reason: blockedReason,
              next_wake_source: nextWakeSource,
              merge_ready: mergeReady,
            },
            time_created: now,
          })
          .run()

        const updated = yield* tx.select().from(LightbulbPRReviewRouteTable).where(eq(LightbulbPRReviewRouteTable.id, input.routeID)).get()
        const updatedStops = yield* tx
          .select()
          .from(LightbulbRouteStopTable)
          .where(eq(LightbulbRouteStopTable.route_id, input.routeID))
          .orderBy(asc(LightbulbRouteStopTable.sequence))
          .all()

        return {
          eventID,
          wakeID,
          route: toPRReviewRouteSummary(updated, updatedStops),
        }
      }),
    )
    .pipe(Effect.orDie)
}

export function toPRReviewRouteSummary(
  row: typeof LightbulbPRReviewRouteTable.$inferSelect | undefined,
  stops: readonly (typeof LightbulbRouteStopTable.$inferSelect)[],
): Lightbulb.PRReviewRouteSummary {
  if (!row) throw new Error("Lightbulb PR review route row is required")
  const currentStop = stops.find((stop) => stop.id === row.current_stop_id)
  return {
    id: row.id,
    goalID: row.goal_id,
    candidateID: row.candidate_id,
    repository: row.repository,
    pullNumber: row.pr_number,
    title: row.title,
    url: row.url,
    status: row.status,
    currentStop: currentStop
      ? {
          id: currentStop.id,
          kind: currentStop.kind,
          title: currentStop.title,
          status: currentStop.status,
        }
      : null,
    latestEvidence: row.latest_evidence ?? null,
    activeWorker: row.active_worker ?? null,
    blockedReason: row.blocked_reason,
    nextWakeSource: row.next_wake_source,
    mergeReady: row.merge_ready,
    lastWokeAt: row.last_wake_at,
  }
}

const activeRouteStatuses = ["active", "blocked"] satisfies Lightbulb.PRReviewRouteStatus[]

function prReviewStops(candidate: typeof LightbulbPRReviewCandidateTable.$inferSelect) {
  return [
    {
      kind: "review" as const,
      title: "Collect review evidence",
      objective: `Collect human, Copilot, and Codex review evidence for ${candidate.repository}#${candidate.pr_number}.`,
      evidence: "Review comments, requested changes, approvals, and reviewer availability.",
      metadata: { routeStage: "review" },
    },
    {
      kind: "verification" as const,
      title: "Check CI evidence",
      objective: "Summarize required checks and failing logs without mutating the pull request.",
      evidence: "GitHub check conclusions, focused local verification, and bounded failure excerpts.",
      metadata: { routeStage: "ci" },
    },
    {
      kind: "decision" as const,
      title: "Report merge readiness",
      objective: "Report whether the PR is ready to merge, blocked, or needs another worker loop.",
      evidence: "Compact readiness decision with links to artifacts and review signals.",
      metadata: { routeStage: "decision", reviewOnly: true },
    },
  ]
}

function admissionEvidence(
  candidate: typeof LightbulbPRReviewCandidateTable.$inferSelect,
  now: number,
  source: Lightbulb.PRReviewRouteWakeSource,
  data: Record<string, unknown> | undefined,
): Lightbulb.PRReviewRouteEvidence {
  return {
    observedAt: now,
    source,
    summary: `Admitted ${candidate.repository}#${candidate.pr_number} into the read-only PR review route.`,
    data,
  }
}

function wakeEvidence(input: PRReviewRouteWakeServiceInput, now: number): Lightbulb.PRReviewRouteEvidence {
  return {
    observedAt: now,
    source: input.source,
    summary: input.summary,
    artifactID: input.artifactID,
    status: input.status,
    data: input.data,
  }
}

function insertWake(
  tx: LightbulbTransaction,
  input: {
    readonly wakeID: Lightbulb.PRReviewRouteWakeID
    readonly accountID: Lightbulb.AccountID
    readonly routeID: Lightbulb.RouteID
    readonly source: Lightbulb.PRReviewRouteWakeSource
    readonly summary: string
    readonly evidence: Lightbulb.PRReviewRouteEvidence
    readonly activeWorker: Lightbulb.PRReviewRouteWorkerHandle | null
    readonly blockedReason: string | null
    readonly nextWakeSource: Lightbulb.PRReviewRouteWakeSource | null
    readonly currentStopID: Lightbulb.RouteStopID | null
    readonly mergeReady: boolean
    readonly now: number
    readonly metadata?: Record<string, unknown>
  },
) {
  return tx
    .insert(LightbulbPRReviewRouteWakeTable)
    .values({
      id: input.wakeID,
      account_id: input.accountID,
      route_id: input.routeID,
      source: input.source,
      summary: input.summary,
      evidence: input.evidence,
      active_worker: input.activeWorker,
      blocked_reason: input.blockedReason,
      next_wake_source: input.nextWakeSource,
      current_stop_id: input.currentStopID,
      merge_ready: input.mergeReady,
      metadata: input.metadata,
      time_created: input.now,
      time_updated: input.now,
    })
    .run()
}

function adoptedRoute(
  tx: LightbulbTransaction,
  routeID: Lightbulb.RouteID,
  accountID: Lightbulb.AccountID,
  now: number,
  eventID: () => Lightbulb.EventID,
) {
  return Effect.gen(function* () {
    const event = eventID()
    yield* tx
      .insert(LightbulbEventTable)
      .values({
        id: event,
        account_id: accountID,
        aggregate_type: "pr_review_route",
        aggregate_id: routeID,
        type: "lightbulb.pr_review_route.adopted",
        summary: "Adopted an existing PR review route for the candidate.",
        data: { route_id: routeID },
        time_created: now,
      })
      .run()
    return {
      outcome: "adopted" as const,
      eventID: event,
      route: yield* readPRReviewRouteSummary(tx, routeID),
      heldReason: null,
    }
  })
}

function heldRoute(
  tx: LightbulbTransaction,
  accountID: Lightbulb.AccountID,
  activeRouteID: Lightbulb.RouteID | undefined,
  heldReason: string,
  candidate: typeof LightbulbPRReviewCandidateTable.$inferSelect,
  now: number,
  eventID: () => Lightbulb.EventID,
) {
  return Effect.gen(function* () {
    const event = eventID()
    yield* tx
      .insert(LightbulbEventTable)
      .values({
        id: event,
        account_id: accountID,
        aggregate_type: "pr_review_route",
        aggregate_id: candidate.id,
        type: "lightbulb.pr_review_route.held",
        summary: `Held PR review route for ${candidate.repository}#${candidate.pr_number}: ${heldReason}.`,
        data: {
          candidate_id: candidate.id,
          repository: candidate.repository,
          pr_number: candidate.pr_number,
          held_reason: heldReason,
          active_route_id: activeRouteID ?? null,
        },
        time_created: now,
      })
      .run()
    return {
      outcome: "held" as const,
      eventID: event,
      route: activeRouteID ? yield* readPRReviewRouteSummary(tx, activeRouteID) : undefined,
      heldReason,
    }
  })
}

function readPRReviewRouteSummary(tx: LightbulbTransaction, routeID: Lightbulb.RouteID) {
  return Effect.gen(function* () {
    const route = yield* tx.select().from(LightbulbPRReviewRouteTable).where(eq(LightbulbPRReviewRouteTable.id, routeID)).get()
    const stops = yield* tx
      .select()
      .from(LightbulbRouteStopTable)
      .where(eq(LightbulbRouteStopTable.route_id, routeID))
      .orderBy(asc(LightbulbRouteStopTable.sequence))
      .all()
    return toPRReviewRouteSummary(route, stops)
  })
}
