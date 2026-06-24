import { and, asc, eq } from "drizzle-orm"
import { Effect } from "effect"
import type { Database } from "../database/database"
import type { Lightbulb } from "../lightbulb"
import { Hash } from "../util/hash"
import { classifyLoopSchedule } from "./scheduler"
import { toPRReviewRouteDigest } from "./pr-review-state"
import {
  LightbulbEventTable,
  LightbulbHumanInboxItemTable,
} from "./sql"

type HumanInboxRow = typeof LightbulbHumanInboxItemTable.$inferSelect
type LightbulbTransaction = Parameters<Parameters<Database.Interface["db"]["transaction"]>[0]>[0]
type HumanInboxDraft = {
  readonly itemKey: string
  readonly type: Lightbulb.HumanInboxDecisionType
  readonly priority: Lightbulb.HumanInboxPriority
  readonly summary: string
  readonly reason: string
  readonly suggestedDecision: string
  readonly lastAction: string
  readonly source: Lightbulb.HumanInboxSource
  readonly metadata: Record<string, unknown> | null
}

export type HumanInboxProjectionInput = {
  readonly accountID: Lightbulb.AccountID
  readonly now?: number
  readonly maxAttempts?: number
  readonly source?: Record<string, unknown>
}

export type HumanInboxProjectionResult = {
  readonly accountID: Lightbulb.AccountID
  readonly projectedAt: number
  readonly changed: boolean
  readonly eventID: Lightbulb.EventID | null
  readonly digest: Lightbulb.HumanInboxDigest
}

export function projectHumanInboxInDb(
  db: Database.Interface["db"],
  input: HumanInboxProjectionInput,
  graph: Lightbulb.AccountGraph,
  ids: {
    readonly event: () => Lightbulb.EventID
  },
) {
  return db
    .transaction((tx) =>
      Effect.gen(function* () {
        const projectedAt = input.now ?? Date.now()
        const drafts = humanInboxDrafts(graph, { now: projectedAt, maxAttempts: input.maxAttempts ?? 2 })
        const draftKeys = new Set(drafts.map((draft) => draft.itemKey))
        const existing = yield* tx
          .select()
          .from(LightbulbHumanInboxItemTable)
          .where(eq(LightbulbHumanInboxItemTable.account_id, input.accountID))
          .orderBy(asc(LightbulbHumanInboxItemTable.item_key))
          .all()
        const existingByKey = new Map(existing.map((row) => [row.item_key, row]))
        const upserts = yield* Effect.all(
          drafts.map((draft) => upsertHumanInboxDraft(tx, input.accountID, draft, existingByKey.get(draft.itemKey), projectedAt)),
        )
        const resolved = yield* Effect.all(
          existing
            .filter((row) => row.status === "open" && !draftKeys.has(row.item_key))
            .map((row) =>
              tx
                .update(LightbulbHumanInboxItemTable)
                .set({
                  status: "resolved",
                  resolved_at: projectedAt,
                  last_seen_at: projectedAt,
                  time_updated: projectedAt,
                })
                .where(eq(LightbulbHumanInboxItemTable.id, row.id))
                .returning()
                .get()
                .pipe(Effect.map((updated) => ({ row: updated, changed: true }))),
            ),
        )
        const changed = [...upserts, ...resolved].some((item) => item.changed)
        const rows = yield* tx
          .select()
          .from(LightbulbHumanInboxItemTable)
          .where(eq(LightbulbHumanInboxItemTable.account_id, input.accountID))
          .orderBy(asc(LightbulbHumanInboxItemTable.first_seen_at), asc(LightbulbHumanInboxItemTable.id))
          .all()
        const digest = toHumanInboxDigest(rows, { accountID: input.accountID, now: projectedAt })
        if (!changed) {
          return {
            accountID: input.accountID,
            projectedAt,
            changed: false,
            eventID: null,
            digest,
          } satisfies HumanInboxProjectionResult
        }

        const eventID = ids.event()
        yield* tx
          .insert(LightbulbEventTable)
          .values({
            id: eventID,
            account_id: input.accountID,
            aggregate_type: "human_inbox",
            aggregate_id: input.accountID,
            type: "lightbulb.human_inbox.projected",
            summary: humanInboxProjectionSummary(digest),
            data: {
              account_id: input.accountID,
              action_required_count: digest.counts.actionRequired,
              suppressed_count: digest.counts.suppressed,
              counts: digest.counts,
              source: input.source ?? {},
            },
            time_created: projectedAt,
          })
          .run()

        return {
          accountID: input.accountID,
          projectedAt,
          changed: true,
          eventID,
          digest,
        } satisfies HumanInboxProjectionResult
      }),
    )
    .pipe(Effect.orDie)
}

export function readHumanInboxDigestInDb(
  db: Database.Interface["db"],
  input: {
    readonly accountID: Lightbulb.AccountID
    readonly now?: number
  },
) {
  return db
    .select()
    .from(LightbulbHumanInboxItemTable)
    .where(eq(LightbulbHumanInboxItemTable.account_id, input.accountID))
    .orderBy(asc(LightbulbHumanInboxItemTable.first_seen_at), asc(LightbulbHumanInboxItemTable.id))
    .all()
    .pipe(Effect.orDie, Effect.map((rows) => toHumanInboxDigest(rows, { accountID: input.accountID, now: input.now ?? Date.now() })))
}

export function toHumanInboxDigest(
  rows: readonly HumanInboxRow[],
  input: {
    readonly accountID: Lightbulb.AccountID
    readonly now?: number
  },
): Lightbulb.HumanInboxDigest {
  const now = input.now ?? Date.now()
  const actionRequired = rows
    .filter((row) => row.status === "open")
    .map((row) => toHumanInboxItem(row, now))
    .sort(compareHumanInboxItems)
  const suppressed = rows
    .filter((row) => row.status !== "open")
    .map((row) => toHumanInboxItem(row, now))
    .sort(compareHumanInboxItems)
  return {
    accountID: input.accountID,
    generatedAt: now,
    actionRequired,
    suppressed,
    byType: {
      approval_needed: actionRequired.filter((item) => item.type === "approval_needed"),
      needs_info: actionRequired.filter((item) => item.type === "needs_info"),
      conflict: actionRequired.filter((item) => item.type === "conflict"),
      stale_worker: actionRequired.filter((item) => item.type === "stale_worker"),
      budget_kill_switch: actionRequired.filter((item) => item.type === "budget_kill_switch"),
      max_attempts: actionRequired.filter((item) => item.type === "max_attempts"),
      reroute_proposal: actionRequired.filter((item) => item.type === "reroute_proposal"),
    },
    counts: {
      actionRequired: actionRequired.length,
      suppressed: suppressed.length,
      approvalNeeded: actionRequired.filter((item) => item.type === "approval_needed").length,
      needsInfo: actionRequired.filter((item) => item.type === "needs_info").length,
      conflict: actionRequired.filter((item) => item.type === "conflict").length,
      staleWorker: actionRequired.filter((item) => item.type === "stale_worker").length,
      budgetKillSwitch: actionRequired.filter((item) => item.type === "budget_kill_switch").length,
      maxAttempts: actionRequired.filter((item) => item.type === "max_attempts").length,
      rerouteProposal: actionRequired.filter((item) => item.type === "reroute_proposal").length,
    },
  }
}

export function humanInboxDrafts(
  graph: Lightbulb.AccountGraph,
  options: {
    readonly now: number
    readonly maxAttempts: number
  },
): readonly HumanInboxDraft[] {
  const schedules = graph.loops.map((loop) =>
    classifyLoopSchedule({ loop, runs: graph.runs, usage: graph.budgetUsage, now: options.now }),
  )
  return [
    ...gateDrafts(graph),
    ...discoveryDrafts(graph),
    ...issueMutationDrafts(graph),
    ...staleWorkerDrafts(graph),
    ...budgetDrafts(graph, schedules),
    ...maxAttemptDrafts(graph, options.maxAttempts),
    ...rerouteDrafts(graph),
    ...ownershipCollisionDrafts(graph),
  ]
}

function upsertHumanInboxDraft(
  tx: LightbulbTransaction,
  accountID: Lightbulb.AccountID,
  draft: HumanInboxDraft,
  existing: HumanInboxRow | undefined,
  now: number,
) {
  if (!existing) {
    return tx
      .insert(LightbulbHumanInboxItemTable)
      .values({
        id: humanInboxItemID(accountID, draft.itemKey),
        account_id: accountID,
        item_key: draft.itemKey,
        type: draft.type,
        status: "open",
        priority: draft.priority,
        summary: draft.summary,
        reason: draft.reason,
        suggested_decision: draft.suggestedDecision,
        last_action: draft.lastAction,
        source: draft.source,
        first_seen_at: now,
        last_seen_at: now,
        resolved_at: null,
        metadata: draft.metadata,
        time_created: now,
        time_updated: now,
      })
      .returning()
      .get()
      .pipe(Effect.map((row) => ({ row, changed: true })))
  }
  if (!humanInboxRowChanged(existing, draft)) return Effect.succeed({ row: existing, changed: false })
  return tx
    .update(LightbulbHumanInboxItemTable)
    .set({
      type: draft.type,
      status: "open",
      priority: draft.priority,
      summary: draft.summary,
      reason: draft.reason,
      suggested_decision: draft.suggestedDecision,
      last_action: draft.lastAction,
      source: draft.source,
      first_seen_at: existing.status === "open" ? existing.first_seen_at : now,
      last_seen_at: now,
      resolved_at: null,
      metadata: draft.metadata,
      time_updated: now,
    })
    .where(
      and(
        eq(LightbulbHumanInboxItemTable.account_id, accountID),
        eq(LightbulbHumanInboxItemTable.item_key, draft.itemKey),
      ),
    )
    .returning()
    .get()
    .pipe(Effect.map((row) => ({ row, changed: true })))
}

function humanInboxRowChanged(row: HumanInboxRow, draft: HumanInboxDraft) {
  return (
    row.type !== draft.type ||
    row.status !== "open" ||
    row.priority !== draft.priority ||
    row.summary !== draft.summary ||
    row.reason !== draft.reason ||
    row.suggested_decision !== draft.suggestedDecision ||
    row.last_action !== draft.lastAction ||
    stableJson(row.source) !== stableJson(draft.source) ||
    stableJson(row.metadata ?? null) !== stableJson(draft.metadata)
  )
}

function gateDrafts(graph: Lightbulb.AccountGraph): readonly HumanInboxDraft[] {
  return graph.gates
    .filter((gate) => gate.status === "pending" || gate.status === "blocked")
    .map((gate) => {
      const run = graph.runs.find((item) => item.id === gate.run_id)
      const loop = run ? graph.loops.find((item) => item.id === run.loop_id) : undefined
      return {
        itemKey: "gate:" + gate.id,
        type: "approval_needed",
        priority: gate.status === "blocked" ? "high" : "medium",
        summary: shortText(gate.summary),
        reason: gate.status === "blocked" ? "Review gate is blocked." : "Review gate is waiting for human review.",
        suggestedDecision: "Review the artifact and approve, reject, or request rework.",
        lastAction: shortText(gate.summary),
        source: compactSource({
          goalID: loop?.goal_id,
          loopID: loop?.id,
          runID: gate.run_id,
          gateID: gate.id,
          artifactID: gate.artifact_id ?? undefined,
        }),
        metadata: { gateKind: gate.kind, status: gate.status },
      } satisfies HumanInboxDraft
    })
}

function discoveryDrafts(graph: Lightbulb.AccountGraph): readonly HumanInboxDraft[] {
  return graph.discoveryCandidates
    .filter((candidate) => candidate.section === "needs_human" && candidate.status !== "resolved" && candidate.status !== "ignored")
    .map((candidate) => ({
      itemKey: "discovery:" + candidate.id,
      type: "needs_info",
      priority: "medium",
      summary: shortText(candidate.title),
      reason: shortText(candidate.reason),
      suggestedDecision: shortText(candidate.suggested_action),
      lastAction: "Discovery classified " + (candidate.source_handles.issueRef ?? candidate.source_id) + " as needs_human.",
      source: compactSource({
        issueRef: candidate.source_handles.issueRef,
        issueURL: candidate.url,
      }),
      metadata: {
        sourceKind: candidate.source_kind,
        sourceID: candidate.source_id,
        labels: candidate.labels,
      },
    }))
}

function issueMutationDrafts(graph: Lightbulb.AccountGraph): readonly HumanInboxDraft[] {
  return graph.issueMutationOutbox.flatMap((item) => {
    const type = issueMutationDecisionType(item)
    if (!type) return []
    return [
      {
        itemKey: "issue-mutation:" + item.id,
        type,
        priority: type === "conflict" ? "high" : "medium",
        summary: shortText(item.apply_summary),
        reason: issueMutationReason(item, type),
        suggestedDecision:
          type === "conflict"
            ? "Inspect current issue state and adjust, approve, or supersede the proposed mutation."
            : "Approve or reject the proposed issue mutation before applying it.",
        lastAction: shortText(item.apply_result?.summary ?? item.apply_summary),
        source: compactSource({
          goalID: item.source_goal_id ?? item.source_handles.goalID,
          loopID: item.source_loop_id ?? item.source_handles.loopID,
          runID: item.source_run_id ?? item.source_handles.runID,
          issueRef: item.target_issue_ref ?? undefined,
          issueURL: item.target_issue_url ?? undefined,
          mutationID: item.id,
        }),
        metadata: {
          action: item.action,
          repository: item.repository,
          holdReasons: item.hold_reasons,
        },
      } satisfies HumanInboxDraft,
    ]
  })
}

function staleWorkerDrafts(graph: Lightbulb.AccountGraph): readonly HumanInboxDraft[] {
  return graph.loops.flatMap((loop) => {
    const staleReason = supervisorReason(loop.metadata, "stale_worker_reason")
    const recoveryReason = supervisorReason(loop.metadata, "recovery_required_reason")
    const reason = staleReason ?? recoveryReason
    if (!reason) return []
    return [
      {
        itemKey: "loop:" + loop.id + ":stale-worker",
        type: "stale_worker",
        priority: "high",
        summary: shortText(loop.summary),
        reason: shortText(reason),
        suggestedDecision: "Inspect worker ownership and choose retry, recover, or mark blocked.",
        lastAction: "Loop supervisor recorded " + (staleReason ? "a stale worker." : "a recovery hold."),
        source: compactSource({
          goalID: loop.goal_id,
          loopID: loop.id,
        }),
        metadata: {
          ...(staleReason ? { staleWorkerReason: staleReason } : {}),
          ...(recoveryReason ? { recoveryRequiredReason: recoveryReason } : {}),
        },
      } satisfies HumanInboxDraft,
    ]
  })
}

function budgetDrafts(
  graph: Lightbulb.AccountGraph,
  schedules: readonly ReturnType<typeof classifyLoopSchedule>[],
): readonly HumanInboxDraft[] {
  return schedules
    .filter((schedule) => schedule.budget?.status === "held" || schedule.classification === "budget_held")
    .flatMap((schedule) => {
      const loop = graph.loops.find((item) => item.id === schedule.loopID)
      if (!loop) return []
      return [
        {
          itemKey: "loop:" + loop.id + ":budget",
          type: "budget_kill_switch",
          priority: "high",
          summary: shortText(loop.summary),
          reason: schedule.budget?.holdReason ?? schedule.reason ?? "budget_held",
          suggestedDecision: "Review the loop budget policy before admitting more work.",
          lastAction: "Scheduler classified loop budget as held.",
          source: compactSource({
            goalID: loop.goal_id,
            loopID: loop.id,
          }),
          metadata: {
            profileID: schedule.profileID,
            classification: schedule.classification,
          },
        } satisfies HumanInboxDraft,
      ]
    })
}

function maxAttemptDrafts(graph: Lightbulb.AccountGraph, maxAttempts: number): readonly HumanInboxDraft[] {
  return toPRReviewRouteDigest(graph.prReviewRoutes, graph.routeStops, graph.prReviewRouteWakes, { maxAttempts })
    .escalated.filter((item) => item.escalationReasons.includes("attempt_budget_exhausted"))
    .map((item) => {
      const route = graph.prReviewRoutes.find((candidate) => candidate.id === item.routeID)
      return {
        itemKey: "pr-route:" + item.routeID + ":max-attempts",
        type: "max_attempts",
        priority: "high",
        summary: shortText(item.title),
        reason: "PR review route exhausted " + item.attemptCount + "/" + item.maxAttempts + " attempts.",
        suggestedDecision: "Decide whether to retry, reroute, or hand off to a human.",
        lastAction: shortText(item.lastAction),
        source: compactSource({
          goalID: route?.goal_id,
          routeID: item.routeID,
          issueRef: route ? route.repository + "#" + route.pr_number : undefined,
          issueURL: item.url,
        }),
        metadata: {
          repository: item.repository,
          pullNumber: item.pullNumber,
          status: item.status,
          escalationReasons: item.escalationReasons,
        },
      } satisfies HumanInboxDraft
    })
}

function rerouteDrafts(graph: Lightbulb.AccountGraph): readonly HumanInboxDraft[] {
  return graph.routes
    .filter((route) => route.status === "rerouting")
    .map((route) => {
      const steer = graph.routeSteers.filter((item) => item.route_id === route.id).at(-1)
      return {
        itemKey: "route:" + route.id + ":reroute",
        type: "reroute_proposal",
        priority: "medium",
        summary: shortText(route.summary),
        reason: steer?.reason ?? "route_rerouting",
        suggestedDecision: "Accept the reroute, adjust the route, or block the route.",
        lastAction: shortText(steer?.summary ?? route.summary),
        source: compactSource({
          goalID: route.goal_id,
          routeID: route.id,
          routeStopID: route.current_stop_id ?? undefined,
          routeSteerID: steer?.id,
        }),
        metadata: {
          destination: route.destination,
          routeStatus: route.status,
        },
      } satisfies HumanInboxDraft
    })
}

function ownershipCollisionDrafts(graph: Lightbulb.AccountGraph): readonly HumanInboxDraft[] {
  return graph.events
    .filter((event) => event.type === "lightbulb.worker_launch.skipped" && stringField(event.data, "reason") === "ownership_collision")
    .map((event) => ({
      itemKey: "event:" + event.id + ":ownership-collision",
      type: "conflict",
      priority: "high",
      summary: shortText(event.summary),
      reason: "Worker launch skipped because another owner already holds this work.",
      suggestedDecision: "Inspect the active owner and decide whether to wait, cancel, or retry.",
      lastAction: shortText(event.summary),
      source: compactSource({
        eventID: event.id,
        runID: stringField(event.data, "run_id") as Lightbulb.RunID | undefined,
        workerID: stringField(event.data, "worker_id") as Lightbulb.WorkerID | undefined,
        taskPacketID: stringField(event.data, "task_packet_id") as Lightbulb.TaskPacketID | undefined,
        launchAttemptID: stringField(event.data, "attempt_id") as Lightbulb.WorkerLaunchAttemptID | undefined,
      }),
      metadata: {
        eventType: event.type,
      },
    }))
}

function issueMutationDecisionType(
  item: Lightbulb.AccountGraph["issueMutationOutbox"][number],
): Lightbulb.HumanInboxDecisionType | undefined {
  if (item.status === "ready") return "approval_needed"
  if (item.status !== "held") return
  if (item.hold_reasons.includes("missing_operator_approval")) return "approval_needed"
  if (
    item.hold_reasons.some((reason) =>
      [
        "conflicting_state_label",
        "unsafe_label_removal",
        "stale_snapshot_precondition",
        "unsupported_adapter_capability",
        "safe_write_path_denied",
        "safe_write_label_denied",
        "safe_write_issue_type_denied",
        "safe_write_risk_denied",
      ].includes(reason),
    )
  ) {
    return "conflict"
  }
}

function issueMutationReason(
  item: Lightbulb.AccountGraph["issueMutationOutbox"][number],
  type: Lightbulb.HumanInboxDecisionType,
) {
  if (type === "conflict") return "Issue mutation is held by " + item.hold_reasons.join(", ") + "."
  if (item.status === "ready") return "Issue mutation is ready but requires operator approval."
  return "Issue mutation is held for operator approval."
}

function toHumanInboxItem(row: HumanInboxRow, now: number): Lightbulb.HumanInboxItem {
  return {
    id: row.id,
    accountID: row.account_id,
    type: row.type,
    status: row.status,
    priority: row.priority,
    summary: row.summary,
    reason: row.reason,
    suggestedDecision: row.suggested_decision,
    lastAction: row.last_action,
    source: row.source,
    ageMs: Math.max(0, now - row.first_seen_at),
    firstSeenAt: row.first_seen_at,
    lastSeenAt: row.last_seen_at,
    resolvedAt: row.resolved_at,
    metadata: row.metadata ?? null,
  }
}

function compareHumanInboxItems(left: Lightbulb.HumanInboxItem, right: Lightbulb.HumanInboxItem) {
  return priorityRank(left.priority) - priorityRank(right.priority) || left.firstSeenAt - right.firstSeenAt || left.id.localeCompare(right.id)
}

function priorityRank(priority: Lightbulb.HumanInboxPriority) {
  if (priority === "high") return 0
  if (priority === "medium") return 1
  return 2
}

function humanInboxItemID(accountID: Lightbulb.AccountID, itemKey: string): Lightbulb.HumanInboxItemID {
  return ("lbinbox_" + Hash.fast(accountID + ":" + itemKey).slice(0, 30)) as Lightbulb.HumanInboxItemID
}

function compactSource(source: Lightbulb.HumanInboxSource): Lightbulb.HumanInboxSource {
  return Object.fromEntries(
    Object.entries(source).filter(([, value]) => typeof value === "string" && value.length > 0),
  ) as Lightbulb.HumanInboxSource
}

function supervisorReason(metadata: Record<string, unknown> | null | undefined, key: string) {
  const supervisor = metadata?.supervisor
  if (!isRecord(supervisor)) return
  return stringField(supervisor, key)
}

function stringField(data: Record<string, unknown> | null | undefined, key: string) {
  const value = data?.[key]
  return typeof value === "string" && value.length > 0 ? value : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function shortText(value: string) {
  const trimmed = value.replace(/\s+/g, " ").trim()
  if (trimmed.length <= 240) return trimmed
  return trimmed.slice(0, 237) + "..."
}

function humanInboxProjectionSummary(digest: Lightbulb.HumanInboxDigest) {
  if (digest.counts.actionRequired === 0) return "Projected an empty human inbox."
  return "Projected " + digest.counts.actionRequired + " human inbox item(s) requiring action."
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return "[" + value.map(stableJson).join(",") + "]"
  if (value && typeof value === "object") {
    return (
      "{" +
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => JSON.stringify(key) + ":" + stableJson(entry))
        .join(",") +
      "}"
    )
  }
  return JSON.stringify(value)
}
