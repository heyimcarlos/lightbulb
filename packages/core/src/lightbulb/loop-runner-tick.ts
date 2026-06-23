import { and, asc, eq } from "drizzle-orm"
import { Effect } from "effect"
import type { Database } from "../database/database"
import type { Lightbulb } from "../lightbulb"
import { planWorkerDispatch, type IssueRoutingInput, type WorkerDispatchPlan } from "./decision-artifact"
import { superviseScheduledLoopsInDb, type SchedulerSupervisorResult } from "./scheduler-supervisor"
import { launchWorkerInDb, type WorkerLaunchMetadataValue, type WorkerLaunchResult } from "./worker-launch"
import { LightbulbEventTable, LightbulbRunTable, LightbulbTaskPacketTable, LightbulbWorkerTable } from "./sql"

export type AccountLoopRunnerTickReason =
  | "launched" | "already_active" | "no_ready_work" | "dependency_held" | "human_review_held" | "context_policy_held"
  | "budget_held" | "disabled" | "no_due_loops" | "already_active_run" | "stale_worker" | "recovery_required"
  | "admission_skipped" | "no_loops" | "launch_skipped" | "launch_failed" | "blocked"

export type AccountLoopRunnerWorkerRequest = {
  readonly runID: Lightbulb.RunID
  readonly workerID: Lightbulb.WorkerID
  readonly taskPacketID: Lightbulb.TaskPacketID
  readonly reused: boolean
}

export type AccountLoopRunnerTickServiceInput = {
  readonly accountID: Lightbulb.AccountID
  readonly now?: number
  readonly trigger?: Lightbulb.LoopRunTrigger
  readonly tickID?: string
  readonly issues: readonly IssueRoutingInput[]
  readonly command?: string
  readonly cwd?: string
  readonly worktreeID?: string
  readonly profileID?: string
  readonly launchStatus?: Extract<Lightbulb.WorkerLaunchStatus, "requested" | "launching" | "running" | "launch_failed" | "blocked">
  readonly launchHoldReason?: Lightbulb.WorkerLaunchHoldReason
  readonly failureReason?: string
  readonly environmentSummary?: Record<string, WorkerLaunchMetadataValue>
  readonly source?: Record<string, string | number | boolean | null>
}

export type AccountLoopRunnerTickInput = Omit<AccountLoopRunnerTickServiceInput, "now"> & {
  readonly now: number
}

export type AccountLoopRunnerTickResult = {
  readonly accountID: Lightbulb.AccountID
  readonly tickID: string
  readonly now: number
  readonly trigger: Lightbulb.LoopRunTrigger
  readonly replayed: boolean
  readonly eventID: Lightbulb.EventID
  readonly outcome: "launched" | "already_active" | "skipped" | "launch_failed" | "blocked"
  readonly reason: AccountLoopRunnerTickReason
  readonly selectedLoopID: Lightbulb.LoopID | null
  readonly selectedRunID: Lightbulb.RunID | null
  readonly issueRef: string | null
  readonly workerID: Lightbulb.WorkerID | null
  readonly taskPacketID: Lightbulb.TaskPacketID | null
  readonly nextWakeAt: number | null
  readonly scheduler: SchedulerSupervisorResult | null
  readonly dispatch: WorkerDispatchPlan
  readonly launch: WorkerLaunchResult | null
  readonly skippedWork: readonly AccountLoopRunnerSkippedWork[]
}

export type AccountLoopRunnerSkippedWork = {
  readonly issueRef: string
  readonly title: string
  readonly reason: AccountLoopRunnerTickReason
  readonly summary: string
}

export type AccountLoopRunnerTickStorage = {
  readonly planDispatch: (input: { readonly issues: readonly IssueRoutingInput[] }) => Effect.Effect<WorkerDispatchPlan>
  readonly supervise: (input: {
    readonly accountID: Lightbulb.AccountID
    readonly now: number
    readonly trigger: Lightbulb.LoopRunTrigger
    readonly tickID: string
    readonly source?: Record<string, string | number | boolean | null>
  }) => Effect.Effect<SchedulerSupervisorResult>
  readonly ensureWorkerRequest: (input: {
    readonly accountID: Lightbulb.AccountID
    readonly runID: Lightbulb.RunID
    readonly tickID: string
    readonly issue: WorkerDispatchPlan["spawnRequests"][number]
    readonly now: number
  }) => Effect.Effect<AccountLoopRunnerWorkerRequest>
  readonly launchWorker: (input: {
    readonly request: AccountLoopRunnerWorkerRequest
    readonly tick: AccountLoopRunnerTickInput
    readonly issue: WorkerDispatchPlan["spawnRequests"][number]
    readonly profileID: string | null
  }) => Effect.Effect<WorkerLaunchResult>
  readonly recordJournal: (result: Omit<AccountLoopRunnerTickResult, "eventID" | "replayed">) => Effect.Effect<AccountLoopRunnerTickResult>
}

export type AccountLoopRunnerTickIDs = {
  readonly run: () => Lightbulb.RunID
  readonly worker: () => Lightbulb.WorkerID
  readonly taskPacket: () => Lightbulb.TaskPacketID
  readonly launchAttempt: () => Lightbulb.WorkerLaunchAttemptID
  readonly event: () => Lightbulb.EventID
}

export function runAccountLoopTick(input: AccountLoopRunnerTickInput & { readonly storage: AccountLoopRunnerTickStorage }) {
  return Effect.gen(function* () {
    const trigger = input.trigger ?? "schedule"
    const tickID = input.tickID ?? defaultTickID(input, trigger)
    const work = classifyWorkItems(input.issues)
    const dispatch = yield* input.storage.planDispatch({ issues: work.dispatchable })
    const selectedIssue = dispatch.spawnRequests[0]
    if (!selectedIssue) {
      return yield* input.storage.recordJournal({
        accountID: input.accountID,
        tickID,
        now: input.now,
        trigger,
        outcome: "skipped",
        reason: skippedDispatchReason(work.skipped, dispatch),
        selectedLoopID: null,
        selectedRunID: null,
        issueRef: null,
        workerID: null,
        taskPacketID: null,
        nextWakeAt: null,
        scheduler: null,
        dispatch,
        launch: null,
        skippedWork: [
          ...work.skipped,
          ...dispatch.skipped.map((skipped) => ({
            issueRef: skipped.issueRef,
            title: skipped.title,
            reason: skipped.reason === "not-ready" ? "no_ready_work" : "human_review_held",
            summary: skipped.summary,
          }) satisfies AccountLoopRunnerSkippedWork),
        ],
      })
    }

    const scheduler = yield* input.storage.supervise({
      accountID: input.accountID,
      now: input.now,
      trigger,
      tickID,
      source: {
        ...input.source,
        runner_tick_id: tickID,
        selected_issue_ref: selectedIssue.issueRef,
      },
    })
    if (!scheduler.selectedRunID || !scheduler.selectedLoopID) {
      return yield* input.storage.recordJournal({
        accountID: input.accountID,
        tickID,
        now: input.now,
        trigger,
        outcome: "skipped",
        reason: schedulerSkipReason(scheduler),
        selectedLoopID: scheduler.selectedLoopID,
        selectedRunID: scheduler.selectedRunID,
        issueRef: selectedIssue.issueRef,
        workerID: null,
        taskPacketID: null,
        nextWakeAt: scheduler.nextWakeAt,
        scheduler,
        dispatch,
        launch: null,
        skippedWork: work.skipped,
      })
    }

    const request = yield* input.storage.ensureWorkerRequest({
      accountID: input.accountID,
      runID: scheduler.selectedRunID,
      tickID,
      issue: selectedIssue,
      now: input.now,
    })
    const launch = yield* input.storage.launchWorker({
      request,
      tick: input,
      issue: selectedIssue,
      profileID: scheduler.outcomes.find((outcome) => outcome.runID === scheduler.selectedRunID)?.profileID ?? input.profileID ?? null,
    })

    return yield* input.storage.recordJournal({
      accountID: input.accountID,
      tickID,
      now: input.now,
      trigger,
      outcome: tickOutcomeForLaunch(launch),
      reason: tickReasonForLaunch(launch),
      selectedLoopID: scheduler.selectedLoopID,
      selectedRunID: scheduler.selectedRunID,
      issueRef: selectedIssue.issueRef,
      workerID: request.workerID,
      taskPacketID: request.taskPacketID,
      nextWakeAt: scheduler.nextWakeAt,
      scheduler,
      dispatch,
      launch,
      skippedWork: work.skipped,
    })
  })
}

export function runAccountLoopTickInDb(
  db: Database.Interface["db"],
  input: AccountLoopRunnerTickInput,
  ids: AccountLoopRunnerTickIDs,
) {
  return runAccountLoopTick({
    ...input,
    storage: databaseAccountLoopRunnerTickStorage(db, ids),
  }).pipe(Effect.orDie)
}

export function databaseAccountLoopRunnerTickStorage(
  db: Database.Interface["db"],
  ids: AccountLoopRunnerTickIDs,
): AccountLoopRunnerTickStorage {
  return {
    planDispatch: (input) => planWorkerDispatch(db, input),
    supervise: (input) =>
      superviseScheduledLoopsInDb(
        db,
        {
          accountID: input.accountID,
          now: input.now,
          trigger: input.trigger,
          passID: input.tickID,
          source: input.source,
        },
        { run: ids.run, event: ids.event },
      ),
    ensureWorkerRequest: (input) => ensureWorkerRequestInDb(db, { ...input, ids }),
    launchWorker: (input) =>
      launchWorkerInDb(
        db,
        {
          accountID: input.tick.accountID,
          workerID: input.request.workerID,
          taskPacketID: input.request.taskPacketID,
          trigger: workerLaunchTrigger(input.tick.trigger ?? "schedule"),
          now: input.tick.now,
          status: input.tick.launchStatus ?? "requested",
          holdReason: input.tick.launchHoldReason,
          issueRef: input.issue.issueRef,
          workItemRef: input.issue.issueRef,
          environmentSummary: input.tick.environmentSummary,
          summary: launchSummary(input.issue, input.tick.launchStatus ?? "requested"),
          cwd: input.tick.cwd ?? "/tmp/lightbulb-worker",
          worktreeID: input.tick.worktreeID,
          command: input.tick.command ?? "lightbulb run --agent lightbulb-worker --format json",
          profileID: input.tick.profileID ?? input.profileID ?? undefined,
          failureReason: input.tick.failureReason,
          metadata: {
            runner_tick_id: input.tick.tickID ?? defaultTickID(input.tick, input.tick.trigger ?? "schedule"),
            runtime_kind: "opencode",
            issue_ref: input.issue.issueRef,
          },
        },
        { launchAttempt: ids.launchAttempt, event: ids.event },
      ),
    recordJournal: (result) => recordJournalInDb(db, result, ids.event),
  }
}

function ensureWorkerRequestInDb(
  db: Database.Interface["db"],
  input: {
    readonly accountID: Lightbulb.AccountID
    readonly runID: Lightbulb.RunID
    readonly tickID: string
    readonly issue: WorkerDispatchPlan["spawnRequests"][number]
    readonly now: number
    readonly ids: AccountLoopRunnerTickIDs
  },
) {
  return db.transaction((tx) =>
    Effect.gen(function* () {
      const existingWorker = yield* tx
        .select()
        .from(LightbulbWorkerTable)
        .where(and(eq(LightbulbWorkerTable.account_id, input.accountID), eq(LightbulbWorkerTable.run_id, input.runID)))
        .orderBy(asc(LightbulbWorkerTable.time_created))
        .all()
        .pipe(
          Effect.orDie,
          Effect.map((workers) =>
            workers.find(
              (worker) =>
                isRecord(worker.metadata) &&
                worker.metadata.runner_tick_id === input.tickID &&
                worker.metadata.issue_ref === input.issue.issueRef,
            ) ?? workers[0],
          ),
        )

      if (existingWorker) {
        const existingPacket = yield* tx
          .select()
          .from(LightbulbTaskPacketTable)
          .where(and(eq(LightbulbTaskPacketTable.account_id, input.accountID), eq(LightbulbTaskPacketTable.worker_id, existingWorker.id)))
          .orderBy(asc(LightbulbTaskPacketTable.time_created))
          .get()
          .pipe(Effect.orDie)
        if (existingPacket) {
          return {
            runID: input.runID,
            workerID: existingWorker.id,
            taskPacketID: existingPacket.id,
            reused: true,
          } satisfies AccountLoopRunnerWorkerRequest
        }
      }

      const workerID = existingWorker?.id ?? input.ids.worker()
      if (!existingWorker) {
        yield* tx
          .insert(LightbulbWorkerTable)
          .values({
            id: workerID,
            account_id: input.accountID,
            run_id: input.runID,
            role: "bounded implementation worker",
            status: "queued",
            summary: "Queued worker for " + input.issue.issueRef + ": " + input.issue.title,
            metadata: {
              runner_tick_id: input.tickID,
              issue_ref: input.issue.issueRef,
              issue_handle: input.issue.issueHandle,
              labels: input.issue.labels,
              prompt_handle: input.issue.promptHandle,
              instruction_handle: input.issue.instructionHandle,
              runtime_kind: "opencode",
            },
            time_created: input.now,
            time_updated: input.now,
          })
          .run()
      }

      const taskPacketID = input.ids.taskPacket()
      yield* tx
        .insert(LightbulbTaskPacketTable)
        .values({
          id: taskPacketID,
          account_id: input.accountID,
          worker_id: workerID,
          title: input.issue.title,
          status: "ready",
          instructions:
            "Implement " +
            input.issue.issueRef +
            " using instruction handle " +
            input.issue.instructionHandle +
            " and return a bounded worker report.",
          metadata: {
            runner_tick_id: input.tickID,
            issue_ref: input.issue.issueRef,
            issue_handle: input.issue.issueHandle,
            prompt_handle: input.issue.promptHandle,
            instruction_handle: input.issue.instructionHandle,
            body_handle: input.issue.bodyHandle,
            body_summary: input.issue.bodySummary,
            source_updated_at: input.issue.updatedAt,
            dependency_refs: input.issue.dependencyRefs,
            context_budget: "bounded",
            expected_artifact_types: ["report", "test_result"],
            delivery_mode: "worker_report",
          },
          time_created: input.now,
          time_updated: input.now,
        })
        .run()

      return {
        runID: input.runID,
        workerID,
        taskPacketID,
        reused: !!existingWorker,
      } satisfies AccountLoopRunnerWorkerRequest
    }),
  ).pipe(Effect.orDie)
}

function recordJournalInDb(
  db: Database.Interface["db"],
  result: Omit<AccountLoopRunnerTickResult, "eventID" | "replayed">,
  eventID: () => Lightbulb.EventID,
) {
  return Effect.gen(function* () {
    const existing = yield* db
      .select()
      .from(LightbulbEventTable)
      .where(
        and(
          eq(LightbulbEventTable.account_id, result.accountID),
          eq(LightbulbEventTable.aggregate_type, "account_loop_runner_tick"),
          eq(LightbulbEventTable.aggregate_id, result.tickID),
        ),
      )
      .orderBy(asc(LightbulbEventTable.time_created))
      .get()
      .pipe(Effect.orDie)

    if (existing) return { ...result, eventID: existing.id, replayed: true } satisfies AccountLoopRunnerTickResult

    const id = eventID()
    const recorded = { ...result, eventID: id, replayed: false } satisfies AccountLoopRunnerTickResult
    yield* db
      .insert(LightbulbEventTable)
      .values({
        id,
        account_id: result.accountID,
        aggregate_type: "account_loop_runner_tick",
        aggregate_id: result.tickID,
        type: "lightbulb.account_loop_runner_tick.completed",
        summary: "Completed account loop runner tick: " + result.reason + ".",
        data: {
          result: recorded,
        },
        time_created: result.now,
      })
      .run()
      .pipe(Effect.orDie)
    return recorded
  })
}

function classifyWorkItems(issues: readonly IssueRoutingInput[]) {
  const skipped = issues.flatMap((issue) => {
    const reason = heldWorkReason(issue.labels ?? [])
    if (!reason) return []
    return [
      {
        issueRef: issue.issueRef,
        title: issue.title,
        reason,
        summary: "Issue is held before worker dispatch: " + reason + ".",
      },
    ] satisfies AccountLoopRunnerSkippedWork[]
  })
  return {
    dispatchable: issues.filter((issue) => !heldWorkReason(issue.labels ?? [])),
    skipped,
  }
}

function heldWorkReason(labels: readonly string[]) {
  const normalized = labels.map((label) => label.toLowerCase())
  if (normalized.includes("blocked-by-dependency")) return "dependency_held"
  if (normalized.includes("ready-for-human") || normalized.includes("needs-info")) return "human_review_held"
  if (normalized.includes("context-policy-held") || normalized.includes("context-held")) return "context_policy_held"
  return null
}

function skippedDispatchReason(skipped: readonly AccountLoopRunnerSkippedWork[], dispatch: WorkerDispatchPlan): AccountLoopRunnerTickReason {
  if (skipped[0]) return skipped[0].reason
  if (dispatch.skipped.some((item) => item.reason === "decision-held" || item.reason === "decision-rejected")) return "human_review_held"
  return "no_ready_work"
}

function schedulerSkipReason(scheduler: SchedulerSupervisorResult): AccountLoopRunnerTickReason {
  const outcome = scheduler.outcomes.find((item) => item.selected) ?? scheduler.outcomes[0]
  if (outcome?.reason === "budget_held") return "budget_held"
  if (outcome?.reason === "disabled") return "disabled"
  if (outcome?.reason === "already_active") return "already_active_run"
  if (outcome?.reason === "stale_worker") return "stale_worker"
  if (outcome?.reason === "recovery_required") return "recovery_required"
  if (outcome?.reason === "admission_skipped") return "admission_skipped"
  if (outcome?.reason === "no_loops") return "no_loops"
  return "no_due_loops"
}

function tickOutcomeForLaunch(launch: WorkerLaunchResult): AccountLoopRunnerTickResult["outcome"] {
  if (launch.outcome === "skipped") return "skipped"
  if (launch.outcome === "already_active") return "already_active"
  if (launch.attempt.status === "launch_failed") return "launch_failed"
  if (launch.attempt.status === "blocked") return "blocked"
  return "launched"
}

function tickReasonForLaunch(launch: WorkerLaunchResult): AccountLoopRunnerTickReason {
  if (launch.outcome === "skipped") return "launch_skipped"
  if (launch.outcome === "already_active") return "already_active"
  if (launch.attempt.status === "launch_failed") return "launch_failed"
  if (launch.attempt.status === "blocked") return "blocked"
  return "launched"
}

function launchSummary(issue: WorkerDispatchPlan["spawnRequests"][number], status: Lightbulb.WorkerLaunchStatus) {
  if (status === "launch_failed") return "Worker launch failed for " + issue.issueRef + "."
  if (status === "blocked") return "Worker launch is blocked for " + issue.issueRef + "."
  return "Worker launch request recorded for " + issue.issueRef + "."
}

function workerLaunchTrigger(trigger: Lightbulb.LoopRunTrigger): Lightbulb.WorkerLaunchTrigger {
  if (trigger === "schedule") return "scheduler"
  return trigger
}

function defaultTickID(input: { readonly accountID: Lightbulb.AccountID; readonly now: number }, trigger: Lightbulb.LoopRunTrigger) {
  return "account-loop-runner:" + input.accountID + ":" + trigger + ":" + input.now
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
