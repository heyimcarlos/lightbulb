import { and, asc, desc, eq, inArray } from "drizzle-orm"
import { Effect } from "effect"
import type { Database } from "../database/database"
import type { Lightbulb } from "../lightbulb"
import { admitLoopRunInDb, type LoopRunAdmissionResult, type LoopRunAdmissionSourceValue, type LoopRunTrigger } from "./run-ledger"
import { readLoopSchedulesInDb, type LoopScheduleReadModel } from "./scheduler"
import {
  LightbulbArtifactTable,
  LightbulbEventTable,
  LightbulbLoopTable,
  LightbulbRunTable,
  LightbulbSchedulerSupervisorPassTable,
  LightbulbWorkerTable,
} from "./sql"

export type SchedulerSupervisorReason =
  | "selected"
  | "no_due_loops"
  | "disabled"
  | "budget_held"
  | "already_active"
  | "dependency_held"
  | "stale_worker"
  | "recovery_required"
  | "admission_skipped"
  | "no_loops"
  | "one_loop_per_pass"

export type SchedulerSupervisorRunHandle = {
  readonly runID: Lightbulb.RunID
  readonly status: Lightbulb.RunStatus
  readonly workerIDs: readonly Lightbulb.WorkerID[]
  readonly artifactIDs: readonly Lightbulb.ArtifactID[]
}

export type SchedulerSupervisorLoopState = {
  readonly schedule: LoopScheduleReadModel
  readonly activeRun: SchedulerSupervisorRunHandle | null
  readonly dependencyHoldReason: string | null
  readonly recoveryRequiredReason: string | null
  readonly staleWorkerReason: string | null
}

export type SchedulerSupervisorExistingAdmission = {
  readonly loopID: Lightbulb.LoopID
  readonly runID: Lightbulb.RunID
  readonly admissionEventID: Lightbulb.EventID | null
  readonly claimedAt: number
}

export type SchedulerSupervisorOutcome = {
  readonly loopID: Lightbulb.LoopID | null
  readonly profileID: string | null
  readonly kind: Lightbulb.LoopKind
  readonly reason: SchedulerSupervisorReason
  readonly operatorReason: string
  readonly selected: boolean
  readonly runID: Lightbulb.RunID | null
  readonly eventID: Lightbulb.EventID | null
  readonly activeRun: SchedulerSupervisorRunHandle | null
  readonly classification: LoopScheduleReadModel["classification"]
  readonly scheduleReason: string | null
  readonly nextDueAt: number | null
}

export type SchedulerSupervisorOwnershipClaim = {
  readonly loopID: Lightbulb.LoopID
  readonly runID: Lightbulb.RunID
  readonly claimedAt: number
}

export type SchedulerSupervisorResult = {
  readonly accountID: Lightbulb.AccountID
  readonly passID: string
  readonly now: number
  readonly trigger: LoopRunTrigger
  readonly replayed: boolean
  readonly eventID: Lightbulb.EventID | null
  readonly selectedLoopID: Lightbulb.LoopID | null
  readonly selectedRunID: Lightbulb.RunID | null
  readonly ownershipClaim: SchedulerSupervisorOwnershipClaim | null
  readonly nextWakeAt: number | null
  readonly outcomes: readonly SchedulerSupervisorOutcome[]
}

export type SchedulerSupervisorInput = {
  readonly accountID: Lightbulb.AccountID
  readonly now: number
  readonly trigger?: LoopRunTrigger
  readonly passID?: string
  readonly source?: Record<string, LoopRunAdmissionSourceValue>
  readonly staleWorkerMs?: number
}

export type SchedulerSupervisorServiceInput = Omit<SchedulerSupervisorInput, "now"> & {
  readonly now?: number
}

export type SchedulerSupervisorStorage = {
  readonly readExistingPass: (input: {
    readonly accountID: Lightbulb.AccountID
    readonly passID: string
  }) => Effect.Effect<SchedulerSupervisorResult | null>
  readonly readExistingAdmission: (input: {
    readonly accountID: Lightbulb.AccountID
    readonly passID: string
  }) => Effect.Effect<SchedulerSupervisorExistingAdmission | null>
  readonly readLoopStates: (input: SchedulerSupervisorInput) => Effect.Effect<readonly SchedulerSupervisorLoopState[]>
  readonly admitLoopRun: (
    input: SchedulerSupervisorInput & {
      readonly loopID: Lightbulb.LoopID
      readonly passID: string
      readonly trigger: LoopRunTrigger
    },
  ) => Effect.Effect<LoopRunAdmissionResult>
  readonly recordPass: (result: SchedulerSupervisorResult) => Effect.Effect<SchedulerSupervisorResult>
}

type ResolvedSchedulerSupervisorInput = SchedulerSupervisorInput & {
  readonly storage: SchedulerSupervisorStorage
  readonly passID: string
  readonly trigger: LoopRunTrigger
}

export function superviseScheduledLoops(input: SchedulerSupervisorInput & { readonly storage: SchedulerSupervisorStorage }) {
  return Effect.gen(function* () {
    const trigger = input.trigger ?? "schedule"
    const passID = input.passID ?? defaultPassID(input, trigger)
    const existing = yield* input.storage.readExistingPass({ accountID: input.accountID, passID })
    if (existing) return { ...existing, replayed: true }
    const existingAdmission = yield* input.storage.readExistingAdmission({ accountID: input.accountID, passID })
    if (existingAdmission) return yield* adoptExistingAdmission({ ...input, trigger, passID }, existingAdmission)

    const states = yield* input.storage.readLoopStates(input)
    const plannedOutcomes = states.map(toOutcome)
    const selected = plannedOutcomes.find(
      (outcome): outcome is SchedulerSupervisorOutcome & { readonly loopID: Lightbulb.LoopID } =>
        outcome.reason === "selected" && outcome.loopID !== null,
    )
    const initialOutcomes = selected
      ? plannedOutcomes.map((outcome) =>
          outcome.loopID === selected.loopID || outcome.reason !== "selected"
            ? outcome
            : {
                ...outcome,
                reason: "one_loop_per_pass" as const,
                operatorReason: "one_loop_per_pass",
                selected: false,
                nextDueAt: input.now,
              },
        )
      : plannedOutcomes
    const admitted = selected
      ? yield* input.storage.admitLoopRun({ ...input, trigger, passID, loopID: selected.loopID })
      : null
    const outcomes = selected && admitted ? initialOutcomes.map((outcome) => applyAdmission(outcome, selected, admitted, input.now)) : initialOutcomes
    const plannedResult = {
      accountID: input.accountID,
      passID,
      now: input.now,
      trigger,
      replayed: false,
      eventID: null,
      selectedLoopID: selected && admitted?.outcome === "admitted" ? selected.loopID : null,
      selectedRunID: admitted?.outcome === "admitted" ? admitted.runID : null,
      ownershipClaim:
        selected && admitted?.outcome === "admitted"
          ? {
              loopID: selected.loopID,
              runID: admitted.runID,
              claimedAt: input.now,
            }
          : null,
      nextWakeAt: nextWakeAt(outcomes),
      outcomes: outcomes.length === 0 ? [emptyOutcome(input.accountID)] : outcomes,
    }
    const competingAdmission = yield* input.storage.readExistingAdmission({ accountID: input.accountID, passID })
    if (competingAdmission && competingAdmission.runID !== plannedResult.selectedRunID) {
      return yield* adoptExistingAdmission({ ...input, trigger, passID }, competingAdmission)
    }
    return yield* input.storage.recordPass(plannedResult)
  })
}

export function superviseScheduledLoopsInDb(
  db: Database.Interface["db"],
  input: SchedulerSupervisorInput,
  ids: { readonly run: () => Lightbulb.RunID; readonly event: () => Lightbulb.EventID },
): Effect.Effect<SchedulerSupervisorResult> {
  return superviseScheduledLoops({
    ...input,
    storage: databaseSchedulerSupervisorStorage(db, ids),
  }).pipe(Effect.orDie)
}

function databaseSchedulerSupervisorStorage(
  db: Database.Interface["db"],
  ids: { readonly run: () => Lightbulb.RunID; readonly event: () => Lightbulb.EventID },
): SchedulerSupervisorStorage {
  return {
    readExistingPass: (lookup) =>
      db
        .select()
        .from(LightbulbEventTable)
        .where(
          and(
            eq(LightbulbEventTable.account_id, lookup.accountID),
            eq(LightbulbEventTable.type, "lightbulb.scheduler_supervisor.completed"),
            eq(LightbulbEventTable.aggregate_type, "scheduler_supervisor_pass"),
            eq(LightbulbEventTable.aggregate_id, lookup.passID),
          ),
        )
        .orderBy(desc(LightbulbEventTable.time_created))
        .get()
        .pipe(
          Effect.orDie,
          Effect.map((event) => (event ? resultFromEventData(event.data, event.id, lookup.accountID) : null)),
        ),
    readExistingAdmission: (lookup) => readExistingAdmissionInDb(db, lookup),
    readLoopStates: (loopInput) => readLoopStatesInDb(db, loopInput),
    admitLoopRun: (loopInput) =>
      admitLoopRunInDb(
        db,
        {
          accountID: loopInput.accountID,
          loopID: loopInput.loopID,
          now: loopInput.now,
          trigger: loopInput.trigger,
          source: {
            ...loopInput.source,
            supervisor_pass_id: loopInput.passID,
          },
        },
        ids,
      ),
    recordPass: (result) => recordPassInDb(db, result, ids.event),
  }
}

function adoptExistingAdmission(
  supervisorInput: ResolvedSchedulerSupervisorInput,
  admission: SchedulerSupervisorExistingAdmission,
) {
  return Effect.gen(function* () {
    const states = yield* supervisorInput.storage.readLoopStates(supervisorInput)
    const outcomes = states.map((state) => {
      if (state.schedule.loopID === admission.loopID) return adoptedOutcome(state, admission)
      const planned = toOutcome(state)
      if (planned.reason !== "selected") return planned
      return {
        ...planned,
        reason: "one_loop_per_pass" as const,
        operatorReason: "one_loop_per_pass",
        selected: false,
        nextDueAt: supervisorInput.now,
      }
    })
    const result = {
      accountID: supervisorInput.accountID,
      passID: supervisorInput.passID,
      now: supervisorInput.now,
      trigger: supervisorInput.trigger,
      replayed: false,
      eventID: null,
      selectedLoopID: admission.loopID,
      selectedRunID: admission.runID,
      ownershipClaim: {
        loopID: admission.loopID,
        runID: admission.runID,
        claimedAt: admission.claimedAt,
      },
      nextWakeAt: nextWakeAt(outcomes),
      outcomes,
    }
    return yield* supervisorInput.storage.recordPass(result)
  })
}

function recordPassInDb(
  db: Database.Interface["db"],
  result: SchedulerSupervisorResult,
  eventID: () => Lightbulb.EventID,
) {
  return db
    .transaction((tx) =>
      Effect.gen(function* () {
        const claimed = yield* tx
          .insert(LightbulbSchedulerSupervisorPassTable)
          .values({
            account_id: result.accountID,
            pass_id: result.passID,
            metadata: { trigger: result.trigger },
            time_created: result.now,
            time_updated: result.now,
          })
          .onConflictDoNothing()
          .returning({ pass_id: LightbulbSchedulerSupervisorPassTable.pass_id })
          .get()
        if (!claimed) {
          const existing = yield* readClaimedPass(tx, result)
          if (existing) return { ...existing, replayed: true }
          return yield* Effect.die(new Error("Lightbulb scheduler supervisor pass claim has no completed event"))
        }

        const existingResult = yield* readClaimedPass(tx, result)
        if (existingResult) return { ...existingResult, replayed: true }

        const id = eventID()
        yield* tx
          .insert(LightbulbEventTable)
          .values({
            id,
            account_id: result.accountID,
            aggregate_type: "scheduler_supervisor_pass",
            aggregate_id: result.passID,
            type: "lightbulb.scheduler_supervisor.completed",
            summary: supervisorSummary(result),
            data: resultData(result, id),
            time_created: result.now,
          })
          .run()
        yield* tx
          .update(LightbulbSchedulerSupervisorPassTable)
          .set({
            event_id: id,
            metadata: { trigger: result.trigger, selected_run_id: result.selectedRunID },
            time_updated: result.now,
          })
          .where(
            and(
              eq(LightbulbSchedulerSupervisorPassTable.account_id, result.accountID),
              eq(LightbulbSchedulerSupervisorPassTable.pass_id, result.passID),
            ),
          )
          .run()
        return { ...result, eventID: id }
      }),
    )
    .pipe(Effect.orDie)
}

function readClaimedPass(
  tx: Parameters<Parameters<Database.Interface["db"]["transaction"]>[0]>[0],
  result: SchedulerSupervisorResult,
) {
  return Effect.gen(function* () {
    const claim = yield* tx
      .select()
      .from(LightbulbSchedulerSupervisorPassTable)
      .where(
        and(
          eq(LightbulbSchedulerSupervisorPassTable.account_id, result.accountID),
          eq(LightbulbSchedulerSupervisorPassTable.pass_id, result.passID),
        ),
      )
      .get()
    if (!claim?.event_id) return null
    const event = yield* tx
      .select()
      .from(LightbulbEventTable)
      .where(
        and(
          eq(LightbulbEventTable.account_id, result.accountID),
          eq(LightbulbEventTable.id, claim.event_id),
          eq(LightbulbEventTable.type, "lightbulb.scheduler_supervisor.completed"),
        ),
      )
      .get()
    return event ? resultFromEventData(event.data, event.id, result.accountID) : null
  })
}

function readExistingAdmissionInDb(
  db: Database.Interface["db"],
  lookup: { readonly accountID: Lightbulb.AccountID; readonly passID: string },
) {
  return Effect.gen(function* () {
    const runs = yield* db
      .select({
        id: LightbulbRunTable.id,
        loop_id: LightbulbRunTable.loop_id,
        started_at: LightbulbRunTable.started_at,
        metadata: LightbulbRunTable.metadata,
      })
      .from(LightbulbRunTable)
      .where(eq(LightbulbRunTable.account_id, lookup.accountID))
      .orderBy(desc(LightbulbRunTable.time_created))
      .all()
      .pipe(Effect.orDie)
    const run = runs.find((item) => readSupervisorPassID(item.metadata) === lookup.passID)
    if (!run) return null
    const event = yield* db
      .select()
      .from(LightbulbEventTable)
      .where(
        and(
          eq(LightbulbEventTable.account_id, lookup.accountID),
          eq(LightbulbEventTable.aggregate_type, "run"),
          eq(LightbulbEventTable.aggregate_id, run.id),
          eq(LightbulbEventTable.type, "lightbulb.loop_run.admitted"),
        ),
      )
      .orderBy(desc(LightbulbEventTable.time_created))
      .get()
      .pipe(Effect.orDie)
    return {
      loopID: run.loop_id,
      runID: run.id,
      admissionEventID: event?.id ?? null,
      claimedAt: run.started_at,
    }
  })
}

function readLoopStatesInDb(db: Database.Interface["db"], input: SchedulerSupervisorInput) {
  return Effect.gen(function* () {
    const schedules = yield* readLoopSchedulesInDb(db, input)
    const loopIDs = schedules.map((schedule) => schedule.loopID)
    if (loopIDs.length === 0) return []
    const loops = yield* db
      .select({
        id: LightbulbLoopTable.id,
        metadata: LightbulbLoopTable.metadata,
      })
      .from(LightbulbLoopTable)
      .where(and(eq(LightbulbLoopTable.account_id, input.accountID), inArray(LightbulbLoopTable.id, loopIDs)))
      .orderBy(asc(LightbulbLoopTable.time_created))
      .all()
      .pipe(Effect.orDie)
    const activeRuns = yield* db
      .select({
        id: LightbulbRunTable.id,
        loop_id: LightbulbRunTable.loop_id,
        status: LightbulbRunTable.status,
      })
      .from(LightbulbRunTable)
      .where(
        and(
          eq(LightbulbRunTable.account_id, input.accountID),
          inArray(LightbulbRunTable.loop_id, loopIDs),
          inArray(LightbulbRunTable.status, ["queued", "running"]),
        ),
      )
      .orderBy(desc(LightbulbRunTable.time_created))
      .all()
      .pipe(Effect.orDie)
    const activeRunIDs = activeRuns.map((run) => run.id)
    const workers =
      activeRunIDs.length === 0
        ? []
        : yield* db
            .select({
              id: LightbulbWorkerTable.id,
              run_id: LightbulbWorkerTable.run_id,
              status: LightbulbWorkerTable.status,
              metadata: LightbulbWorkerTable.metadata,
            })
            .from(LightbulbWorkerTable)
            .where(and(eq(LightbulbWorkerTable.account_id, input.accountID), inArray(LightbulbWorkerTable.run_id, activeRunIDs)))
            .orderBy(asc(LightbulbWorkerTable.time_created))
            .all()
            .pipe(Effect.orDie)
    const artifacts =
      activeRunIDs.length === 0
        ? []
        : yield* db
            .select({
              id: LightbulbArtifactTable.id,
              producer_run_id: LightbulbArtifactTable.producer_run_id,
            })
            .from(LightbulbArtifactTable)
            .where(
              and(eq(LightbulbArtifactTable.account_id, input.accountID), inArray(LightbulbArtifactTable.producer_run_id, activeRunIDs)),
            )
            .orderBy(asc(LightbulbArtifactTable.time_created))
            .all()
            .pipe(Effect.orDie)

    return schedules.map((schedule) => {
      const loop = loops.find((item) => item.id === schedule.loopID)
      const activeRun = activeRuns.find((run) => run.loop_id === schedule.loopID)
      const activeWorkers = workers.filter((worker) => worker.run_id === activeRun?.id)
      return {
        schedule,
        activeRun: activeRun
          ? {
              runID: activeRun.id,
              status: activeRun.status,
              workerIDs: activeWorkers.map((worker) => worker.id),
              artifactIDs: artifacts.filter((artifact) => artifact.producer_run_id === activeRun.id).map((artifact) => artifact.id),
            }
          : null,
        dependencyHoldReason: readSupervisorReason(loop?.metadata, "dependency_hold_reason"),
        recoveryRequiredReason: readSupervisorReason(loop?.metadata, "recovery_required_reason"),
        staleWorkerReason: readStaleWorkerReason(activeWorkers, input.now, input.staleWorkerMs ?? 10 * 60 * 1000),
      }
    })
  })
}

function toOutcome(state: SchedulerSupervisorLoopState): SchedulerSupervisorOutcome {
  if (state.schedule.classification === "disabled") return outcome(state, "disabled", state.schedule.reason ?? "disabled", false)
  if (state.dependencyHoldReason) return outcome(state, "dependency_held", state.dependencyHoldReason, false)
  if (state.staleWorkerReason) return outcome(state, "stale_worker", state.staleWorkerReason, false)
  if (state.recoveryRequiredReason) return outcome(state, "recovery_required", state.recoveryRequiredReason, false)
  if (state.activeRun) return outcome(state, "already_active", "already_active", false)
  if (state.schedule.classification === "budget_held") {
    return outcome(state, "budget_held", state.schedule.reason ?? "budget_held", false)
  }
  if (state.schedule.classification === "due") return outcome(state, "selected", "selected", true)
  return outcome(state, "no_due_loops", state.schedule.reason ?? "no_due_loops", false)
}

function outcome(
  state: SchedulerSupervisorLoopState,
  reason: SchedulerSupervisorReason,
  operatorReason: string,
  selected: boolean,
): SchedulerSupervisorOutcome {
  return {
    loopID: state.schedule.loopID,
    profileID: state.schedule.profileID,
    kind: state.schedule.kind,
    reason,
    operatorReason,
    selected,
    runID: null,
    eventID: null,
    activeRun: state.activeRun,
    classification: state.schedule.classification,
    scheduleReason: state.schedule.reason,
    nextDueAt: state.schedule.schedule?.nextDueAt ?? null,
  }
}

function applyAdmission(
  outcome: SchedulerSupervisorOutcome,
  selected: SchedulerSupervisorOutcome,
  admitted: LoopRunAdmissionResult,
  now: number,
): SchedulerSupervisorOutcome {
  if (outcome.loopID !== selected.loopID) return outcome
  if (admitted.outcome === "admitted") {
    return {
      ...outcome,
      runID: admitted.runID,
      eventID: admitted.eventID,
      nextDueAt: admitted.schedule.schedule ? now + admitted.schedule.schedule.cadenceMs : outcome.nextDueAt,
    }
  }
  return {
    ...outcome,
    reason: "admission_skipped",
    operatorReason: admitted.reason,
    selected: false,
    eventID: admitted.eventID,
  }
}

function adoptedOutcome(
  state: SchedulerSupervisorLoopState,
  admission: SchedulerSupervisorExistingAdmission,
): SchedulerSupervisorOutcome {
  return {
    ...outcome(state, "selected", "selected", true),
    runID: admission.runID,
    eventID: admission.admissionEventID,
  }
}

function emptyOutcome(accountID: Lightbulb.AccountID): SchedulerSupervisorOutcome {
  return {
    loopID: null,
    profileID: null,
    kind: "status",
    reason: "no_loops",
    operatorReason: "no_loops",
    selected: false,
    runID: null,
    eventID: null,
    activeRun: null,
    classification: "not_due",
    scheduleReason: "no_loops",
    nextDueAt: null,
  }
}

function nextWakeAt(outcomes: readonly SchedulerSupervisorOutcome[]) {
  return outcomes
    .map((outcome) => outcome.nextDueAt)
    .filter((value): value is number => typeof value === "number")
    .sort((left, right) => left - right)[0] ?? null
}

function defaultPassID(input: SchedulerSupervisorInput, trigger: LoopRunTrigger) {
  return [input.accountID, trigger, input.now, input.source?.scheduler_id ?? input.source?.cron_id ?? "manual"].join(":")
}

function resultData(result: SchedulerSupervisorResult, eventID: Lightbulb.EventID) {
  return {
    account_id: result.accountID,
    pass_id: result.passID,
    now: result.now,
    trigger: result.trigger,
    selected_loop_id: result.selectedLoopID,
    selected_run_id: result.selectedRunID,
    ownership_claim: result.ownershipClaim,
    next_wake_at: result.nextWakeAt,
    event_id: eventID,
    outcomes: result.outcomes,
  }
}

function resultFromEventData(
  data: Record<string, unknown>,
  eventID: Lightbulb.EventID,
  accountID: Lightbulb.AccountID,
): SchedulerSupervisorResult | null {
  if (data.account_id !== accountID) return null
  if (typeof data.pass_id !== "string") return null
  if (typeof data.now !== "number") return null
  if (data.trigger !== "schedule" && data.trigger !== "manual" && data.trigger !== "recovery") return null
  if (!Array.isArray(data.outcomes)) return null
  return {
    accountID: data.account_id as Lightbulb.AccountID,
    passID: data.pass_id,
    now: data.now,
    trigger: data.trigger,
    replayed: true,
    eventID,
    selectedLoopID: typeof data.selected_loop_id === "string" ? (data.selected_loop_id as Lightbulb.LoopID) : null,
    selectedRunID: typeof data.selected_run_id === "string" ? (data.selected_run_id as Lightbulb.RunID) : null,
    ownershipClaim: isOwnershipClaim(data.ownership_claim) ? data.ownership_claim : null,
    nextWakeAt: typeof data.next_wake_at === "number" ? data.next_wake_at : null,
    outcomes: data.outcomes.filter(isSupervisorOutcome),
  }
}

function isOwnershipClaim(value: unknown): value is SchedulerSupervisorOwnershipClaim {
  if (!isRecord(value)) return false
  if (typeof value.loopID !== "string") return false
  if (typeof value.runID !== "string") return false
  return typeof value.claimedAt === "number"
}

function isSupervisorOutcome(value: unknown): value is SchedulerSupervisorOutcome {
  if (!isRecord(value)) return false
  if (value.loopID !== null && typeof value.loopID !== "string") return false
  if (typeof value.operatorReason !== "string") return false
  return typeof value.selected === "boolean"
}

function supervisorSummary(result: SchedulerSupervisorResult) {
  if (result.selectedRunID) return "Scheduler supervisor admitted one loop run."
  return "Scheduler supervisor completed without admitting a loop run."
}

function readSupervisorReason(metadata: Record<string, unknown> | null | undefined, key: string) {
  if (!isRecord(metadata?.supervisor)) return null
  const value = metadata.supervisor[key]
  return typeof value === "string" && value.length > 0 ? value : null
}

function readSupervisorPassID(metadata: Record<string, unknown> | null | undefined) {
  if (!isRecord(metadata?.admission)) return null
  if (!isRecord(metadata.admission.source)) return null
  const value = metadata.admission.source.supervisor_pass_id
  return typeof value === "string" && value.length > 0 ? value : null
}

function readStaleWorkerReason(
  workers: readonly {
    readonly status: Lightbulb.WorkerStatus
    readonly metadata: Record<string, unknown> | null
  }[],
  now: number,
  staleWorkerMs: number,
) {
  const stale = workers.find((worker) => {
    if (worker.status !== "running") return false
    if (!isRecord(worker.metadata?.supervisor)) return false
    if (typeof worker.metadata.supervisor.last_heartbeat_at !== "number") return false
    return worker.metadata.supervisor.last_heartbeat_at + staleWorkerMs <= now
  })
  if (!stale) return null
  return "stale_worker"
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
