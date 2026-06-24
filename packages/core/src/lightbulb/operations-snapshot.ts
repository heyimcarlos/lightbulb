import { and, desc, eq } from "drizzle-orm"
import { Effect } from "effect"
import type { Database } from "../database/database"
import type { Lightbulb } from "../lightbulb"
import { Hash } from "../util/hash"
import { classifyLoopSchedule } from "./scheduler"
import {
  LightbulbEventTable,
  LightbulbOperationsSnapshotTable,
} from "./sql"

type OperationsSnapshotRow = typeof LightbulbOperationsSnapshotTable.$inferSelect
type EventRow = typeof LightbulbEventTable.$inferSelect

type OperationsSnapshotDraft = {
  readonly accountID: Lightbulb.AccountID
  readonly snapshotKey: string
  readonly status: Lightbulb.OperationsSnapshotStatus
  readonly summary: string
  readonly sourceHash: string
  readonly generatedAt: number
  readonly nextWakeAt: number | null
  readonly counts: Lightbulb.OperationsSnapshotCounts
  readonly handles: Lightbulb.OperationsSnapshotHandles
  readonly metadata: Record<string, unknown> | null
}

export function publishOperationsSnapshotInDb(
  db: Database.Interface["db"],
  input: Lightbulb.PublishOperationsSnapshotInput,
  graph: Lightbulb.AccountGraph,
  schedulerTickEvents: readonly EventRow[],
  ids: {
    readonly snapshot: () => Lightbulb.OperationsSnapshotID
    readonly event: () => Lightbulb.EventID
  },
) {
  return db
    .transaction((tx) =>
      Effect.gen(function* () {
        const draft = buildOperationsSnapshot(graph, schedulerTickEvents, {
          now: input.now ?? Date.now(),
          snapshotKey: input.snapshotKey ?? "latest",
          metadata: input.metadata,
        })
        const existing = yield* tx
          .select()
          .from(LightbulbOperationsSnapshotTable)
          .where(
            and(
              eq(LightbulbOperationsSnapshotTable.account_id, input.accountID),
              eq(LightbulbOperationsSnapshotTable.snapshot_key, draft.snapshotKey),
            ),
          )
          .orderBy(desc(LightbulbOperationsSnapshotTable.time_updated))
          .get()

        if (existing?.source_hash === draft.sourceHash) {
          return {
            snapshot: toOperationsSnapshot(existing),
            changed: false,
            eventID: null,
          } satisfies Lightbulb.PublishOperationsSnapshotResult
        }

        const row = existing
          ? yield* tx
              .update(LightbulbOperationsSnapshotTable)
              .set({
                status: draft.status,
                summary: draft.summary,
                source_hash: draft.sourceHash,
                generated_at: draft.generatedAt,
                next_wake_at: draft.nextWakeAt,
                counts: draft.counts,
                handles: draft.handles,
                metadata: draft.metadata,
                time_updated: draft.generatedAt,
              })
              .where(eq(LightbulbOperationsSnapshotTable.id, existing.id))
              .returning()
              .get()
          : yield* tx
              .insert(LightbulbOperationsSnapshotTable)
              .values({
                id: ids.snapshot(),
                account_id: draft.accountID,
                snapshot_key: draft.snapshotKey,
                status: draft.status,
                summary: draft.summary,
                source_hash: draft.sourceHash,
                generated_at: draft.generatedAt,
                next_wake_at: draft.nextWakeAt,
                counts: draft.counts,
                handles: draft.handles,
                metadata: draft.metadata,
                time_created: draft.generatedAt,
                time_updated: draft.generatedAt,
              })
              .returning()
              .get()
        const eventID = ids.event()
        yield* tx
          .insert(LightbulbEventTable)
          .values({
            id: eventID,
            account_id: draft.accountID,
            aggregate_type: "operations_snapshot",
            aggregate_id: row.id,
            type: "lightbulb.operations_snapshot.published",
            summary: draft.summary,
            data: {
              account_id: draft.accountID,
              snapshot_key: draft.snapshotKey,
              status: draft.status,
              source_hash: draft.sourceHash,
              previous_source_hash: existing?.source_hash ?? null,
              next_wake_at: draft.nextWakeAt,
              counts: draft.counts,
              handles: draft.handles,
            },
            time_created: draft.generatedAt,
          })
          .run()

        return {
          snapshot: toOperationsSnapshot(row),
          changed: true,
          eventID,
        } satisfies Lightbulb.PublishOperationsSnapshotResult
      }),
    )
    .pipe(Effect.orDie)
}

export function buildOperationsSnapshot(
  graph: Lightbulb.AccountGraph,
  schedulerTickEvents: readonly EventRow[],
  input: {
    readonly now: number
    readonly snapshotKey: string
    readonly metadata?: Record<string, unknown>
  },
): OperationsSnapshotDraft {
  const schedules = graph.loops.map((loop) =>
    classifyLoopSchedule({ loop, runs: graph.runs, usage: graph.budgetUsage, now: input.now }),
  )
  const latestTick = schedulerTickEvents[0] ?? null
  const latestOutcomes = eventOutcomes(latestTick)
  const handles = {
    selectedLoop: selectedLoopHandle(latestOutcomes),
    activeOwnership: activeOwnershipHandles(graph),
    readyWork: readyWorkHandles(graph),
    heldLoops: heldLoopHandles(graph, schedules),
    staleWorkers: supervisorReasonHandles(graph, "stale_worker_reason"),
    recoveryRequired: supervisorReasonHandles(graph, "recovery_required_reason"),
    reviewGates: reviewGateHandles(graph),
    budgetHolds: budgetHoldHandles(schedules),
    dependencyReleases: dependencyReleaseHandles(graph.events),
    recentArtifacts: graph.artifacts
      .slice(-5)
      .reverse()
      .map((artifact) => ({
        id: artifact.id,
        kind: artifact.type,
        status: artifact.status,
        summary: artifact.summary,
        uri: artifact.uri,
        issueRef: artifact.source_issue_ref ?? undefined,
      })),
    humanActions: humanInboxHandles(graph),
  } satisfies Lightbulb.OperationsSnapshotHandles
  const counts = snapshotCounts(graph, schedules, handles, latestOutcomes)
  const status = snapshotStatus(graph, counts)
  const nextWakeAt = nextWake(schedules, latestTick)
  const summary = snapshotSummary(status, counts, handles)
  const sourceHash = checksum({
    accountID: graph.account.id,
    status,
    summary,
    nextWakeAt,
    counts,
    handles,
  })

  return {
    accountID: graph.account.id,
    snapshotKey: input.snapshotKey,
    status,
    summary,
    sourceHash,
    generatedAt: input.now,
    nextWakeAt,
    counts,
    handles,
    metadata: input.metadata ?? null,
  }
}

export function toOperationsSnapshot(row: OperationsSnapshotRow): Lightbulb.OperationsSnapshot {
  return {
    id: row.id,
    accountID: row.account_id,
    snapshotKey: row.snapshot_key,
    status: row.status,
    summary: row.summary,
    sourceHash: row.source_hash,
    generatedAt: row.generated_at,
    nextWakeAt: row.next_wake_at,
    counts: normalizeSnapshotCounts(row.counts),
    handles: normalizeSnapshotHandles(row.handles),
    metadata: row.metadata ?? null,
    timeCreated: row.time_created,
    timeUpdated: row.time_updated,
  }
}

function snapshotCounts(
  graph: Lightbulb.AccountGraph,
  schedules: readonly ReturnType<typeof classifyLoopSchedule>[],
  handles: Lightbulb.OperationsSnapshotHandles,
  latestOutcomes: readonly SchedulerOutcome[],
): Lightbulb.OperationsSnapshotCounts {
  return {
    goals: {
      active: graph.goals.filter((goal) => goal.status === "active").length,
      held: graph.goals.filter((goal) => goal.status === "held").length,
      terminal: graph.goals.filter((goal) => ["completed", "cancelled", "stopped"].includes(goal.status)).length,
    },
    loops: {
      total: graph.loops.length,
      active: graph.loops.filter((loop) => loop.status === "active" || loop.status === "idle").length,
      ready: schedules.filter((schedule) => schedule.classification === "due").length,
      held: graph.loops.filter((loop) => loop.status === "held" || loop.status === "blocked").length,
      disabled: graph.loops.filter((loop) => loop.status === "disabled").length,
      noOp: latestOutcomes.filter((outcome) => outcome.outcome === "skipped").length,
      stale: handles.staleWorkers.length,
      recoveryRequired: handles.recoveryRequired.length,
    },
    runs: {
      queued: graph.runs.filter((run) => run.status === "queued").length,
      running: graph.runs.filter((run) => run.status === "running").length,
      blocked: graph.runs.filter((run) => run.status === "blocked").length,
      complete: graph.runs.filter((run) => run.status === "complete").length,
      failed: graph.runs.filter((run) => run.status === "failed").length,
    },
    workers: {
      queued: graph.workers.filter((worker) => worker.status === "queued").length,
      running: graph.workers.filter((worker) => worker.status === "running").length,
      blocked: graph.workers.filter((worker) => worker.status === "blocked").length,
      complete: graph.workers.filter((worker) => worker.status === "complete").length,
      failed: graph.workers.filter((worker) => worker.status === "failed").length,
    },
    gates: {
      pendingReview: graph.gates.filter((gate) => gate.kind === "review" && gate.status === "pending").length,
      blocked: graph.gates.filter((gate) => gate.status === "blocked").length,
      failed: graph.gates.filter((gate) => gate.status === "failed").length,
      passed: graph.gates.filter((gate) => gate.status === "passed").length,
    },
    discovery: {
      topActionable: graph.discoveryCandidates.filter((candidate) => candidate.section === "top_actionable").length,
      needsHuman: graph.discoveryCandidates.filter((candidate) => candidate.section === "needs_human").length,
      watch: graph.discoveryCandidates.filter((candidate) => candidate.section === "watch").length,
      noise: graph.discoveryCandidates.filter((candidate) => candidate.section === "noise").length,
    },
    budget: {
      open: schedules.filter((schedule) => schedule.budget?.status === "open").length,
      held: schedules.filter((schedule) => schedule.budget?.status === "held").length,
      exhausted: schedules.filter((schedule) => Boolean(schedule.budget?.holdReason?.includes("exhausted"))).length,
    },
    dependencies: {
      released: handles.dependencyReleases.length,
      blocked: graph.discoveryCandidates.filter((candidate) => candidate.status === "blocked").length,
    },
    artifacts: {
      reports: graph.artifacts.filter((artifact) => artifact.type === "report").length,
      recent: handles.recentArtifacts.length,
    },
    launchAttempts: {
      active: graph.workerLaunchAttempts.filter((attempt) => activeLaunchStatus(attempt.status)).length,
      failed: graph.workerLaunchAttempts.filter((attempt) => attempt.status === "launch_failed").length,
      complete: graph.workerLaunchAttempts.filter((attempt) => attempt.status === "complete").length,
      collisionHolds: graph.events.filter(
        (event) =>
          event.type === "lightbulb.worker_launch.skipped" &&
          stringField(event.data, "reason") === "ownership_collision",
      ).length,
    },
    humanInbox: {
      actionRequired: handles.humanActions.length,
      approvalNeeded: graph.humanInboxItems.filter((item) => item.status === "open" && item.type === "approval_needed").length,
      needsInfo: graph.humanInboxItems.filter((item) => item.status === "open" && item.type === "needs_info").length,
      conflicts: graph.humanInboxItems.filter((item) => item.status === "open" && item.type === "conflict").length,
      escalated: graph.humanInboxItems.filter(
        (item) =>
          item.status === "open" &&
          ["stale_worker", "budget_kill_switch", "max_attempts", "reroute_proposal"].includes(item.type),
      ).length,
    },
  }
}

function normalizeSnapshotCounts(counts: Lightbulb.OperationsSnapshotCounts): Lightbulb.OperationsSnapshotCounts {
  return {
    ...counts,
    launchAttempts: {
      ...counts.launchAttempts,
      collisionHolds: counts.launchAttempts.collisionHolds ?? 0,
    },
    humanInbox: {
      actionRequired: counts.humanInbox?.actionRequired ?? 0,
      approvalNeeded: counts.humanInbox?.approvalNeeded ?? 0,
      needsInfo: counts.humanInbox?.needsInfo ?? 0,
      conflicts: counts.humanInbox?.conflicts ?? 0,
      escalated: counts.humanInbox?.escalated ?? 0,
    },
  }
}

function normalizeSnapshotHandles(handles: Lightbulb.OperationsSnapshotHandles): Lightbulb.OperationsSnapshotHandles {
  return {
    ...handles,
    humanActions: handles.humanActions ?? [],
  }
}

function snapshotStatus(graph: Lightbulb.AccountGraph, counts: Lightbulb.OperationsSnapshotCounts): Lightbulb.OperationsSnapshotStatus {
  if (
    graph.goals.length === 0 &&
    graph.loops.length === 0 &&
    graph.runs.length === 0 &&
    graph.discoveryCandidates.length === 0
  ) {
    return "empty"
  }
  if (
    counts.gates.pendingReview > 0 ||
    counts.gates.blocked > 0 ||
    counts.runs.blocked > 0 ||
    counts.runs.failed > 0 ||
    counts.workers.blocked > 0 ||
    counts.workers.failed > 0 ||
    counts.loops.stale > 0 ||
    counts.loops.recoveryRequired > 0 ||
    counts.launchAttempts.collisionHolds > 0 ||
    counts.humanInbox.actionRequired > 0
  ) {
    return "attention_required"
  }
  if (counts.budget.held > 0 || counts.loops.held > 0) return "held"
  return "active"
}

function snapshotSummary(
  status: Lightbulb.OperationsSnapshotStatus,
  counts: Lightbulb.OperationsSnapshotCounts,
  handles: Lightbulb.OperationsSnapshotHandles,
) {
  if (status === "empty") return "No Lightbulb operations state is available."
  if (status === "attention_required") {
    return [
      counts.gates.pendingReview ? `${counts.gates.pendingReview} review gate(s)` : undefined,
      counts.runs.failed ? `${counts.runs.failed} failed run(s)` : undefined,
      counts.workers.failed ? `${counts.workers.failed} failed worker(s)` : undefined,
      counts.loops.stale ? `${counts.loops.stale} stale worker hold(s)` : undefined,
      counts.loops.recoveryRequired ? `${counts.loops.recoveryRequired} recovery hold(s)` : undefined,
      counts.launchAttempts.collisionHolds ? `${counts.launchAttempts.collisionHolds} ownership collision(s)` : undefined,
      counts.humanInbox.actionRequired ? `${counts.humanInbox.actionRequired} human inbox item(s)` : undefined,
    ]
      .filter((part): part is string => Boolean(part))
      .join(", ") + " need operator attention."
  }
  if (status === "held") return "Lightbulb operations are held by budget or loop policy."
  return `Lightbulb operations active with ${handles.readyWork.length} ready work item(s) and ${handles.activeOwnership.length} active owner(s).`
}

function nextWake(schedules: readonly ReturnType<typeof classifyLoopSchedule>[], latestTick: EventRow | null) {
  const scheduleWake = schedules
    .map((schedule) => schedule.schedule?.nextDueAt)
    .filter((value): value is number => typeof value === "number")
    .sort((a, b) => a - b)[0]
  const eventWake = numberField(latestTick?.data, "next_wake_at")
  return scheduleWake ?? eventWake ?? null
}

function selectedLoopHandle(outcomes: readonly SchedulerOutcome[]): Lightbulb.OperationsSnapshotCompactHandle | null {
  const selected = outcomes.find((outcome) => outcome.outcome === "admitted") ?? null
  if (!selected) return null
  return {
    id: selected.loopID,
    kind: selected.kind,
    status: selected.outcome,
    summary: selected.runID ? `Selected loop admitted run ${selected.runID}.` : "Selected loop was admitted.",
    reason: selected.reason ?? undefined,
  }
}

function activeOwnershipHandles(graph: Lightbulb.AccountGraph): Lightbulb.OperationsSnapshotCompactHandle[] {
  return [
    ...graph.runs
      .filter((run) => run.status === "queued" || run.status === "running")
      .map((run) => ({
        id: run.id,
        kind: "run",
        status: run.status,
        summary: run.summary,
      })),
    ...graph.workerLaunchAttempts
      .filter((attempt) => activeLaunchStatus(attempt.status))
      .map((attempt) => ({
        id: attempt.id,
        kind: "worker_launch",
        status: attempt.status,
        summary: attempt.summary,
        uri: attempt.report_uri ?? attempt.log_uri ?? undefined,
        issueRef: stringMetadata(attempt.metadata, "issue_ref"),
        reason: ownershipSummary(attempt.metadata),
      })),
  ]
}

function readyWorkHandles(graph: Lightbulb.AccountGraph): Lightbulb.OperationsSnapshotCompactHandle[] {
  return graph.discoveryCandidates
    .filter((candidate) => candidate.section === "top_actionable")
    .slice(0, 5)
    .map((candidate) => ({
      id: candidate.source_id,
      kind: candidate.source_kind,
      status: candidate.status,
      summary: candidate.title,
      uri: candidate.url,
      issueRef: candidate.source_handles.issueRef,
      reason: candidate.suggested_action,
    }))
}

function heldLoopHandles(
  graph: Lightbulb.AccountGraph,
  schedules: readonly ReturnType<typeof classifyLoopSchedule>[],
): Lightbulb.OperationsSnapshotCompactHandle[] {
  return graph.loops
    .filter((loop) => loop.status === "held" || loop.status === "blocked" || loop.status === "disabled")
    .map((loop) => {
      const schedule = schedules.find((item) => item.loopID === loop.id)
      return {
        id: loop.id,
        kind: loop.kind,
        status: loop.status,
        summary: loop.summary,
        reason: schedule?.reason ?? undefined,
        nextWakeAt: schedule?.schedule?.nextDueAt ?? null,
      }
    })
}

function supervisorReasonHandles(
  graph: Lightbulb.AccountGraph,
  key: "stale_worker_reason" | "recovery_required_reason",
): Lightbulb.OperationsSnapshotCompactHandle[] {
  return graph.loops
    .flatMap((loop) => {
      const reason = readSupervisorReason(loop.metadata, key)
      if (!reason) return []
      return [
        {
          id: loop.id,
          kind: loop.kind,
          status: loop.status,
          summary: loop.summary,
          reason,
        },
      ]
    })
}

function reviewGateHandles(graph: Lightbulb.AccountGraph): Lightbulb.OperationsSnapshotCompactHandle[] {
  return graph.gates
    .filter((gate) => gate.kind === "review" && (gate.status === "pending" || gate.status === "blocked"))
    .map((gate) => ({
      id: gate.id,
      kind: gate.kind,
      status: gate.status,
      summary: gate.summary,
      uri: gate.artifact_id ?? undefined,
    }))
}

function humanInboxHandles(graph: Lightbulb.AccountGraph): Lightbulb.OperationsSnapshotCompactHandle[] {
  return graph.humanInboxItems
    .filter((item) => item.status === "open")
    .slice()
    .sort((left, right) => priorityRank(left.priority) - priorityRank(right.priority) || left.first_seen_at - right.first_seen_at)
    .slice(0, 8)
    .map((item) => ({
      id: item.id,
      kind: item.type,
      status: item.status,
      summary: item.summary,
      uri: item.source.issueURL,
      issueRef: item.source.issueRef,
      reason: item.reason,
    }))
}

function priorityRank(priority: Lightbulb.HumanInboxPriority) {
  if (priority === "high") return 0
  if (priority === "medium") return 1
  return 2
}

function budgetHoldHandles(
  schedules: readonly ReturnType<typeof classifyLoopSchedule>[],
): Lightbulb.OperationsSnapshotCompactHandle[] {
  return schedules
    .filter((schedule) => schedule.budget?.status === "held")
    .map((schedule) => ({
      id: schedule.loopID,
      kind: schedule.kind,
      status: schedule.classification,
      summary: schedule.summary,
      reason: schedule.budget?.holdReason ?? schedule.reason ?? undefined,
      nextWakeAt: schedule.schedule?.nextDueAt ?? null,
    }))
}

function dependencyReleaseHandles(events: readonly EventRow[]): Lightbulb.OperationsSnapshotCompactHandle[] {
  return events
    .filter((event) => event.type === "lightbulb.issue_dependency.reconciled")
    .slice(-5)
    .reverse()
    .map((event) => ({
      id: event.id,
      kind: "dependency_release",
      status: stringField(event.data, "status"),
      summary: event.summary,
      issueRef: stringField(event.data, "issue_ref") ?? undefined,
    }))
}

type SchedulerOutcome = {
  readonly loopID: Lightbulb.LoopID
  readonly kind: Lightbulb.LoopKind
  readonly outcome: "admitted" | "skipped"
  readonly runID: Lightbulb.RunID | null
  readonly reason: string | null
}

function eventOutcomes(event: EventRow | null): SchedulerOutcome[] {
  if (!Array.isArray(event?.data.outcomes)) return []
  return event.data.outcomes
    .map((value) => {
      if (!isRecord(value)) return
      if (typeof value.loopID !== "string") return
      if (typeof value.kind !== "string") return
      if (value.outcome !== "admitted" && value.outcome !== "skipped") return
      return {
        loopID: value.loopID as Lightbulb.LoopID,
        kind: value.kind as Lightbulb.LoopKind,
        outcome: value.outcome,
        runID: typeof value.runID === "string" ? (value.runID as Lightbulb.RunID) : null,
        reason: typeof value.reason === "string" ? value.reason : null,
      } satisfies SchedulerOutcome
    })
    .filter((outcome): outcome is SchedulerOutcome => outcome !== undefined)
}

function activeLaunchStatus(status: Lightbulb.WorkerLaunchStatus) {
  return status === "requested" || status === "launching" || status === "running"
}

function readSupervisorReason(metadata: Record<string, unknown> | null | undefined, key: string) {
  if (!isRecord(metadata?.supervisor)) return null
  const value = metadata.supervisor[key]
  return typeof value === "string" && value.length > 0 ? value : null
}

function checksum(value: unknown) {
  return "sha256:" + Hash.sha256(stableJson(value))
}

function stableJson(value: unknown): string {
  if (value === undefined) return "null"
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null"
  if (Array.isArray(value)) return "[" + value.map((item) => stableJson(item)).join(",") + "]"
  if (!isRecord(value)) return JSON.stringify(value) ?? "null"
  return (
    "{" +
    Object.keys(value)
      .sort()
      .map((key) => JSON.stringify(key) + ":" + stableJson(value[key]))
      .join(",") +
    "}"
  )
}

function numberField(data: Record<string, unknown> | undefined, key: string) {
  const value = data?.[key]
  return typeof value === "number" ? value : undefined
}

function stringField(data: Record<string, unknown>, key: string) {
  const value = data[key]
  return typeof value === "string" ? value : undefined
}

function stringMetadata(data: Record<string, unknown> | null | undefined, key: string) {
  const value = data?.[key]
  return typeof value === "string" ? value : undefined
}

function ownershipSummary(data: Record<string, unknown> | null | undefined) {
  if (!Array.isArray(data?.ownership_keys)) return undefined
  return data.ownership_keys
    .flatMap((item) => {
      if (!isRecord(item) || typeof item.summary !== "string") return []
      return [item.summary]
    })
    .filter((summary) => !summary.startsWith("task packet "))
    .slice(0, 3)
    .join(", ") || undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
