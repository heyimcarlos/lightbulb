import { and, asc, eq } from "drizzle-orm"
import { Effect } from "effect"
import type { Database } from "../database/database"
import type { Lightbulb } from "../lightbulb"
import {
  LightbulbEventTable,
  LightbulbLoopTable,
  LightbulbRunTable,
  LightbulbTaskPacketTable,
  LightbulbWorkerLaunchAttemptTable,
  LightbulbWorkerTable,
} from "./sql"

type LightbulbTransaction = Parameters<Parameters<Database.Interface["db"]["transaction"]>[0]>[0]

export type WorkerLaunchMetadataValue = string | number | boolean | null

export type WorkerLaunchServiceInput = {
  readonly accountID: Lightbulb.AccountID
  readonly workerID: Lightbulb.WorkerID
  readonly taskPacketID: Lightbulb.TaskPacketID
  readonly trigger?: Lightbulb.WorkerLaunchTrigger
  readonly now?: number
  readonly status?: Lightbulb.WorkerLaunchStatus
  readonly holdReason?: Lightbulb.WorkerLaunchHoldReason
  readonly issueRef?: string
  readonly workItemRef?: string
  readonly environmentSummary?: Record<string, WorkerLaunchMetadataValue>
  readonly summary?: string
  readonly cwd: string
  readonly worktreeID?: string
  readonly command: string
  readonly profileID?: string
  readonly sessionID?: string
  readonly processID?: number
  readonly heartbeatURI?: string
  readonly logURI?: string
  readonly reportURI?: string
  readonly failureReason?: string
  readonly metadata?: Record<string, unknown>
}

export type WorkerLaunchInput = Omit<WorkerLaunchServiceInput, "now"> & {
  readonly now: number
}

export type WorkerLaunchAttemptHandle = {
  readonly id: Lightbulb.WorkerLaunchAttemptID
  readonly accountID: Lightbulb.AccountID
  readonly runID: Lightbulb.RunID
  readonly workerID: Lightbulb.WorkerID
  readonly taskPacketID: Lightbulb.TaskPacketID
  readonly status: Lightbulb.WorkerLaunchStatus
  readonly trigger: Lightbulb.WorkerLaunchTrigger
  readonly summary: string
  readonly cwd: string
  readonly worktreeID: string | null
  readonly command: string
  readonly profileID: string | null
  readonly sessionID: string | null
  readonly processID: number | null
  readonly heartbeatURI: string | null
  readonly logURI: string | null
  readonly reportURI: string | null
  readonly failureReason: string | null
  readonly metadata: Record<string, unknown> | null
  readonly timeCreated: number
  readonly timeUpdated: number
}

export type WorkerLaunchResult =
  | {
      readonly outcome: "launched"
      readonly attempt: WorkerLaunchAttemptHandle
      readonly eventID: Lightbulb.EventID
    }
  | {
      readonly outcome: "already_active"
      readonly attempt: WorkerLaunchAttemptHandle
      readonly eventID: Lightbulb.EventID
    }
  | {
      readonly outcome: "skipped"
      readonly reason: string
      readonly eventID: Lightbulb.EventID
    }

export function launchWorkerInDb(
  db: Database.Interface["db"],
  input: WorkerLaunchInput,
  ids: { readonly launchAttempt: () => Lightbulb.WorkerLaunchAttemptID; readonly event: () => Lightbulb.EventID },
): Effect.Effect<WorkerLaunchResult> {
  return db
    .transaction((tx) =>
      Effect.gen(function* () {
        const trigger = input.trigger ?? "scheduler"
        const worker = yield* tx
          .select()
          .from(LightbulbWorkerTable)
          .where(and(eq(LightbulbWorkerTable.account_id, input.accountID), eq(LightbulbWorkerTable.id, input.workerID)))
          .get()
        if (!worker) return yield* insertSkippedEvent(tx, input, trigger, ids.event(), "missing_worker")

        const run = yield* tx
          .select()
          .from(LightbulbRunTable)
          .where(and(eq(LightbulbRunTable.account_id, input.accountID), eq(LightbulbRunTable.id, worker.run_id)))
          .get()
        if (!run) return yield* insertSkippedEvent(tx, input, trigger, ids.event(), "missing_run")

        const loop = yield* tx
          .select()
          .from(LightbulbLoopTable)
          .where(and(eq(LightbulbLoopTable.account_id, input.accountID), eq(LightbulbLoopTable.id, run.loop_id)))
          .get()
        if (!loop) return yield* insertSkippedEvent(tx, input, trigger, ids.event(), "missing_loop", run.id)

        const packet = yield* tx
          .select()
          .from(LightbulbTaskPacketTable)
          .where(
            and(
              eq(LightbulbTaskPacketTable.account_id, input.accountID),
              eq(LightbulbTaskPacketTable.id, input.taskPacketID),
              eq(LightbulbTaskPacketTable.worker_id, input.workerID),
            ),
          )
          .get()
        if (!packet) return yield* insertSkippedEvent(tx, input, trigger, ids.event(), "missing_task_packet", run.id, loop.id, loop.goal_id)

        const status = input.status ?? (input.holdReason ? "blocked" : input.failureReason ? "launch_failed" : "running")

        const existing = yield* tx
          .select()
          .from(LightbulbWorkerLaunchAttemptTable)
          .where(
            and(
              eq(LightbulbWorkerLaunchAttemptTable.account_id, input.accountID),
              eq(LightbulbWorkerLaunchAttemptTable.active_key, activeKey(input.accountID, input.taskPacketID)),
            ),
          )
          .orderBy(asc(LightbulbWorkerLaunchAttemptTable.time_created))
          .get()
        if (existing) {
          if (canRefreshWorkerLaunch(existing.status, status)) {
            const refreshed = yield* tx
              .update(LightbulbWorkerLaunchAttemptTable)
              .set({
                active_key: isActiveWorkerLaunchStatus(status) ? activeKey(input.accountID, input.taskPacketID) : null,
                status,
                trigger,
                summary: input.summary ?? defaultSummary(status),
                cwd: input.cwd,
                worktree_id: input.worktreeID ?? existing.worktree_id,
                command: input.command,
                profile_id: input.profileID ?? existing.profile_id,
                session_id: input.sessionID ?? existing.session_id,
                process_id: input.processID ?? existing.process_id,
                heartbeat_uri: input.heartbeatURI ?? existing.heartbeat_uri,
                log_uri: input.logURI ?? existing.log_uri,
                report_uri: input.reportURI ?? existing.report_uri,
                failure_reason: input.failureReason ?? existing.failure_reason,
                metadata: mergeLaunchMetadata(existing.metadata, input),
                time_updated: input.now,
              })
              .where(and(eq(LightbulbWorkerLaunchAttemptTable.account_id, input.accountID), eq(LightbulbWorkerLaunchAttemptTable.id, existing.id)))
              .returning()
              .get()
            yield* updateLaunchReadModel(tx, input, run, status, refreshed.summary)
            const eventID = ids.event()
            yield* insertLaunchEvent(tx, launchEventType(status), input, trigger, refreshed, run, loop, eventID)
            return { outcome: "launched" as const, attempt: toWorkerLaunchAttemptHandle(refreshed), eventID }
          }
          const eventID = ids.event()
          yield* insertLaunchEvent(tx, "lightbulb.worker_launch.already_active", input, trigger, existing, run, loop, eventID)
          return { outcome: "already_active" as const, attempt: toWorkerLaunchAttemptHandle(existing), eventID }
        }

        if (input.holdReason) return yield* blockHeldLaunchRequest(tx, input, trigger, ids.event(), run, loop)
        const skipReason = launchSkipReason(run, worker, packet)
        if (skipReason) return yield* insertSkippedEvent(tx, input, trigger, ids.event(), skipReason, run.id, loop.id, loop.goal_id)

        const attempt = {
          id: ids.launchAttempt(),
          account_id: input.accountID,
          run_id: run.id,
          worker_id: input.workerID,
          task_packet_id: input.taskPacketID,
          active_key: isActiveWorkerLaunchStatus(status) ? activeKey(input.accountID, input.taskPacketID) : null,
          status,
          trigger,
          summary: input.summary ?? defaultSummary(status),
          cwd: input.cwd,
          worktree_id: input.worktreeID ?? null,
          command: input.command,
          profile_id: input.profileID ?? null,
          session_id: input.sessionID ?? null,
          process_id: input.processID ?? null,
          heartbeat_uri: input.heartbeatURI ?? null,
          log_uri: input.logURI ?? null,
          report_uri: input.reportURI ?? null,
          failure_reason: input.failureReason ?? null,
          metadata: launchMetadata(input),
          time_created: input.now,
          time_updated: input.now,
        } satisfies typeof LightbulbWorkerLaunchAttemptTable.$inferSelect
        const inserted = yield* tx.insert(LightbulbWorkerLaunchAttemptTable).values(attempt).onConflictDoNothing().returning().get()
        if (!inserted) {
          const active = yield* tx
            .select()
            .from(LightbulbWorkerLaunchAttemptTable)
            .where(
              and(
                eq(LightbulbWorkerLaunchAttemptTable.account_id, input.accountID),
                eq(LightbulbWorkerLaunchAttemptTable.active_key, activeKey(input.accountID, input.taskPacketID)),
              ),
            )
            .get()
          if (active) {
            if (canRefreshWorkerLaunch(active.status, status)) {
              const refreshed = yield* tx
                .update(LightbulbWorkerLaunchAttemptTable)
                .set({
                  active_key: isActiveWorkerLaunchStatus(status) ? activeKey(input.accountID, input.taskPacketID) : null,
                  status,
                  trigger,
                  summary: input.summary ?? defaultSummary(status),
                  cwd: input.cwd,
                  worktree_id: input.worktreeID ?? active.worktree_id,
                  command: input.command,
                  profile_id: input.profileID ?? active.profile_id,
                  session_id: input.sessionID ?? active.session_id,
                  process_id: input.processID ?? active.process_id,
                  heartbeat_uri: input.heartbeatURI ?? active.heartbeat_uri,
                  log_uri: input.logURI ?? active.log_uri,
                  report_uri: input.reportURI ?? active.report_uri,
                  failure_reason: input.failureReason ?? active.failure_reason,
                  metadata: mergeLaunchMetadata(active.metadata, input),
                  time_updated: input.now,
                })
                .where(and(eq(LightbulbWorkerLaunchAttemptTable.account_id, input.accountID), eq(LightbulbWorkerLaunchAttemptTable.id, active.id)))
                .returning()
                .get()
              yield* updateLaunchReadModel(tx, input, run, status, refreshed.summary)
              const eventID = ids.event()
              yield* insertLaunchEvent(tx, launchEventType(status), input, trigger, refreshed, run, loop, eventID)
              return { outcome: "launched" as const, attempt: toWorkerLaunchAttemptHandle(refreshed), eventID }
            }
            const eventID = ids.event()
            yield* insertLaunchEvent(tx, "lightbulb.worker_launch.already_active", input, trigger, active, run, loop, eventID)
            return { outcome: "already_active" as const, attempt: toWorkerLaunchAttemptHandle(active), eventID }
          }
          return yield* insertSkippedEvent(tx, input, trigger, ids.event(), "launch_insert_conflict", run.id, loop.id, loop.goal_id)
        }

        yield* updateLaunchReadModel(tx, input, run, status, attempt.summary)

        const eventID = ids.event()
        yield* insertLaunchEvent(tx, launchEventType(status), input, trigger, inserted, run, loop, eventID)
        return { outcome: "launched" as const, attempt: toWorkerLaunchAttemptHandle(inserted), eventID }
      }),
    )
    .pipe(Effect.orDie)
}

export function toWorkerLaunchAttemptHandle(
  row: typeof LightbulbWorkerLaunchAttemptTable.$inferSelect,
): WorkerLaunchAttemptHandle {
  return {
    id: row.id,
    accountID: row.account_id,
    runID: row.run_id,
    workerID: row.worker_id,
    taskPacketID: row.task_packet_id,
    status: row.status,
    trigger: row.trigger,
    summary: row.summary,
    cwd: row.cwd,
    worktreeID: row.worktree_id,
    command: row.command,
    profileID: row.profile_id,
    sessionID: row.session_id,
    processID: row.process_id,
    heartbeatURI: row.heartbeat_uri,
    logURI: row.log_uri,
    reportURI: row.report_uri,
    failureReason: row.failure_reason,
    metadata: row.metadata ?? null,
    timeCreated: row.time_created,
    timeUpdated: row.time_updated,
  }
}

function blockHeldLaunchRequest(
  tx: LightbulbTransaction,
  input: WorkerLaunchInput,
  trigger: Lightbulb.WorkerLaunchTrigger,
  eventID: Lightbulb.EventID,
  run: typeof LightbulbRunTable.$inferSelect,
  loop: typeof LightbulbLoopTable.$inferSelect,
) {
  return Effect.gen(function* () {
    const summary = input.summary ?? defaultHoldSummary(input.holdReason)
    yield* tx
      .update(LightbulbRunTable)
      .set({ status: "blocked", gate_status: "blocked", summary, time_updated: input.now })
      .where(and(eq(LightbulbRunTable.account_id, input.accountID), eq(LightbulbRunTable.id, run.id)))
      .run()
    yield* tx
      .update(LightbulbWorkerTable)
      .set({ status: "blocked", summary, time_updated: input.now })
      .where(and(eq(LightbulbWorkerTable.account_id, input.accountID), eq(LightbulbWorkerTable.id, input.workerID)))
      .run()
    yield* tx
      .update(LightbulbTaskPacketTable)
      .set({ status: "blocked", time_updated: input.now })
      .where(and(eq(LightbulbTaskPacketTable.account_id, input.accountID), eq(LightbulbTaskPacketTable.id, input.taskPacketID)))
      .run()
    return yield* insertSkippedEvent(tx, input, trigger, eventID, input.holdReason ?? "launch_held", run.id, loop.id, loop.goal_id)
  })
}

function insertSkippedEvent(
  tx: LightbulbTransaction,
  input: WorkerLaunchInput,
  trigger: Lightbulb.WorkerLaunchTrigger,
  eventID: Lightbulb.EventID,
  reason: string,
  runID?: Lightbulb.RunID,
  loopID?: Lightbulb.LoopID,
  goalID?: Lightbulb.GoalID,
) {
  return Effect.gen(function* () {
    yield* tx
      .insert(LightbulbEventTable)
      .values({
        id: eventID,
        account_id: input.accountID,
        aggregate_type: runID ? "run" : "account",
        aggregate_id: runID ?? input.accountID,
        type: "lightbulb.worker_launch.skipped",
        summary: "Skipped Lightbulb worker launch: " + reason + ".",
        data: {
          ...eventData(input, trigger, runID, loopID, goalID),
          reason,
          hold_reason: input.holdReason ?? null,
        },
        time_created: input.now,
      })
      .run()
    return { outcome: "skipped" as const, reason, eventID }
  })
}

function insertLaunchEvent(
  tx: LightbulbTransaction,
  type: string,
  input: WorkerLaunchInput,
  trigger: Lightbulb.WorkerLaunchTrigger,
  attempt: typeof LightbulbWorkerLaunchAttemptTable.$inferSelect,
  run: typeof LightbulbRunTable.$inferSelect,
  loop: typeof LightbulbLoopTable.$inferSelect,
  eventID: Lightbulb.EventID,
) {
  return tx
    .insert(LightbulbEventTable)
    .values({
      id: eventID,
      account_id: input.accountID,
      aggregate_type: "worker_launch_attempt",
      aggregate_id: attempt.id,
      type,
      summary: launchEventSummary(type, attempt),
      data: {
        ...eventData(input, trigger, run.id, loop.id, loop.goal_id),
        attempt_id: attempt.id,
        status: attempt.status,
        cwd: attempt.cwd,
        worktree_id: attempt.worktree_id,
        command: attempt.command,
        profile_id: attempt.profile_id,
        session_id: attempt.session_id,
        process_id: attempt.process_id,
        heartbeat_uri: attempt.heartbeat_uri,
        log_uri: attempt.log_uri,
        report_uri: attempt.report_uri,
        failure_reason: attempt.failure_reason,
      },
      time_created: input.now,
    })
    .run()
}

function eventData(
  input: WorkerLaunchInput,
  trigger: Lightbulb.WorkerLaunchTrigger,
  runID?: Lightbulb.RunID,
  loopID?: Lightbulb.LoopID,
  goalID?: Lightbulb.GoalID,
) {
  return {
    account_id: input.accountID,
    goal_id: goalID ?? null,
    loop_id: loopID ?? null,
    run_id: runID ?? null,
    worker_id: input.workerID,
    task_packet_id: input.taskPacketID,
    issue_ref: input.issueRef ?? null,
    work_item_ref: input.workItemRef ?? null,
    environment_summary: input.environmentSummary ?? null,
    trigger,
  }
}

function launchMetadata(input: WorkerLaunchInput) {
  return {
    ...(input.metadata ?? {}),
    launch_hold_reason: input.holdReason ?? null,
    issue_ref: input.issueRef ?? null,
    work_item_ref: input.workItemRef ?? null,
    environment_summary: input.environmentSummary ?? null,
  }
}

function mergeLaunchMetadata(existing: Record<string, unknown> | null, input: WorkerLaunchInput) {
  return {
    ...(existing ?? {}),
    ...(input.metadata ?? {}),
    launch_hold_reason: input.holdReason ?? existing?.launch_hold_reason ?? null,
    issue_ref: input.issueRef ?? existing?.issue_ref ?? null,
    work_item_ref: input.workItemRef ?? existing?.work_item_ref ?? null,
    environment_summary: input.environmentSummary ?? existing?.environment_summary ?? null,
  }
}

function updateLaunchReadModel(
  tx: LightbulbTransaction,
  input: WorkerLaunchInput,
  run: typeof LightbulbRunTable.$inferSelect,
  status: Lightbulb.WorkerLaunchStatus,
  summary: string,
) {
  return Effect.gen(function* () {
    yield* tx
      .update(LightbulbRunTable)
      .set({
        status: runStatusForLaunch(run.status, status),
        gate_status: gateStatusForLaunch(run.gate_status, status),
        summary: runSummaryForLaunch(run.summary, status, summary),
        time_updated: input.now,
      })
      .where(and(eq(LightbulbRunTable.account_id, input.accountID), eq(LightbulbRunTable.id, run.id)))
      .run()
    yield* tx
      .update(LightbulbWorkerTable)
      .set({ status: workerStatusForLaunch(status), time_updated: input.now })
      .where(and(eq(LightbulbWorkerTable.account_id, input.accountID), eq(LightbulbWorkerTable.id, input.workerID)))
      .run()
    yield* tx
      .update(LightbulbTaskPacketTable)
      .set({ status: taskPacketStatusForLaunch(status), time_updated: input.now })
      .where(and(eq(LightbulbTaskPacketTable.account_id, input.accountID), eq(LightbulbTaskPacketTable.id, input.taskPacketID)))
      .run()
  })
}

function launchSkipReason(
  run: typeof LightbulbRunTable.$inferSelect,
  worker: typeof LightbulbWorkerTable.$inferSelect,
  packet: typeof LightbulbTaskPacketTable.$inferSelect,
) {
  const holdReason = heldLaunchReason(run, worker, packet)
  if (holdReason) return holdReason
  if (run.status !== "queued" && run.status !== "running") return "run_not_runnable"
  if (worker.status !== "queued") return "worker_not_queued"
  if (packet.status !== "ready") return "task_packet_not_ready"
  return null
}

function activeKey(accountID: Lightbulb.AccountID, taskPacketID: Lightbulb.TaskPacketID) {
  return accountID + ":" + taskPacketID
}

function isActiveWorkerLaunchStatus(status: Lightbulb.WorkerLaunchStatus) {
  return status === "requested" || status === "launching" || status === "running"
}

function canRefreshWorkerLaunch(current: Lightbulb.WorkerLaunchStatus, next: Lightbulb.WorkerLaunchStatus) {
  if (!isActiveWorkerLaunchStatus(current)) return false
  return launchStatusRank(next) > launchStatusRank(current)
}

function launchStatusRank(status: Lightbulb.WorkerLaunchStatus) {
  if (status === "requested") return 0
  if (status === "launching") return 1
  if (status === "running") return 2
  return 3
}

function defaultSummary(status: Lightbulb.WorkerLaunchStatus) {
  if (status === "launch_failed") return "Worker launch failed before a runnable process was established."
  if (status === "blocked") return "Worker launch request is blocked before child process execution."
  if (status === "cancelled") return "Worker launch was cancelled before completion."
  if (status === "complete") return "Worker launch completed and returned control to Lightbulb."
  if (status === "requested") return "Worker launch request was recorded before process start."
  if (status === "launching") return "Worker launch adapter is preparing an isolated process handle."
  return "Worker launch adapter returned an active process handle."
}

function defaultHoldSummary(reason: Lightbulb.WorkerLaunchHoldReason | undefined) {
  if (reason === "dependency_held") return "Worker launch is held for an unresolved dependency."
  if (reason === "human_review_held") return "Worker launch is held for human review."
  if (reason === "budget_held") return "Worker launch is held by the budget policy."
  if (reason === "context_policy_held") return "Worker launch is held by context policy."
  return "Worker launch is held before process execution."
}

function launchEventType(status: Lightbulb.WorkerLaunchStatus) {
  if (status === "launch_failed") return "lightbulb.worker_launch.failed"
  if (status === "blocked") return "lightbulb.worker_launch.blocked"
  if (status === "cancelled") return "lightbulb.worker_launch.cancelled"
  if (status === "complete") return "lightbulb.worker_launch.completed"
  if (status === "requested") return "lightbulb.worker_launch.requested"
  if (status === "launching") return "lightbulb.worker_launch.launching"
  return "lightbulb.worker_launch.running"
}

function launchEventSummary(type: string, attempt: typeof LightbulbWorkerLaunchAttemptTable.$inferSelect) {
  if (type === "lightbulb.worker_launch.already_active") return "Worker launch request reused active attempt " + attempt.id + "."
  if (type === "lightbulb.worker_launch.failed") return "Worker launch attempt failed for task packet " + attempt.task_packet_id + "."
  if (type === "lightbulb.worker_launch.blocked") return "Worker launch request is blocked for task packet " + attempt.task_packet_id + "."
  if (type === "lightbulb.worker_launch.cancelled") return "Worker launch attempt was cancelled for task packet " + attempt.task_packet_id + "."
  if (type === "lightbulb.worker_launch.completed") return "Worker launch attempt completed for task packet " + attempt.task_packet_id + "."
  if (type === "lightbulb.worker_launch.requested") return "Worker launch request was recorded for task packet " + attempt.task_packet_id + "."
  if (type === "lightbulb.worker_launch.launching") return "Worker launch attempt is preparing task packet " + attempt.task_packet_id + "."
  return "Worker launch attempt is running for task packet " + attempt.task_packet_id + "."
}

function workerStatusForLaunch(status: Lightbulb.WorkerLaunchStatus): Lightbulb.WorkerStatus {
  if (status === "complete") return "complete"
  if (status === "launch_failed") return "failed"
  if (status === "blocked" || status === "cancelled") return "blocked"
  return "running"
}

function runStatusForLaunch(current: Lightbulb.RunStatus, status: Lightbulb.WorkerLaunchStatus): Lightbulb.RunStatus {
  if (status === "complete") return "complete"
  if (status === "launch_failed") return "failed"
  if (status === "blocked" || status === "cancelled") return "blocked"
  if (current === "queued") return "running"
  return current
}

function gateStatusForLaunch(current: Lightbulb.GateStatus, status: Lightbulb.WorkerLaunchStatus): Lightbulb.GateStatus {
  if (status === "launch_failed") return "failed"
  if (status === "blocked" || status === "cancelled") return "blocked"
  return current
}

function runSummaryForLaunch(current: string, status: Lightbulb.WorkerLaunchStatus, summary: string) {
  if (status === "launch_failed" || status === "blocked" || status === "cancelled" || status === "complete") return summary
  return current
}

function taskPacketStatusForLaunch(status: Lightbulb.WorkerLaunchStatus): Lightbulb.TaskPacketStatus {
  if (status === "complete") return "complete"
  if (status === "launch_failed" || status === "blocked" || status === "cancelled") return "blocked"
  return "claimed"
}

function heldLaunchReason(
  run: typeof LightbulbRunTable.$inferSelect,
  worker: typeof LightbulbWorkerTable.$inferSelect,
  packet: typeof LightbulbTaskPacketTable.$inferSelect,
) {
  if (run.status !== "blocked" && worker.status !== "blocked" && packet.status !== "blocked") return null
  return metadataHoldReason(packet.metadata) ?? metadataHoldReason(worker.metadata) ?? metadataHoldReason(run.metadata)
}

function metadataHoldReason(metadata: Record<string, unknown> | null | undefined) {
  if (!metadata) return null
  if (typeof metadata.launch_hold_reason === "string") return metadata.launch_hold_reason
  if (typeof metadata.blocked_reason === "string") return metadata.blocked_reason
  if (isRecord(metadata.launch_hold) && typeof metadata.launch_hold.reason === "string") return metadata.launch_hold.reason
  return null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
