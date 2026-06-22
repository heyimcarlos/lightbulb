import path from "path"
import { describe, expect } from "bun:test"
import { eq } from "drizzle-orm"
import { Effect, Fiber, Layer } from "effect"
import { Database } from "@opencode-ai/core/database/database"
import { Lightbulb, superviseScheduledLoops, type SchedulerSupervisorStorage } from "@opencode-ai/core/lightbulb"
import {
  LightbulbEventTable,
  LightbulbLoopTable,
  LightbulbRunTable,
  LightbulbSchedulerSupervisorPassTable,
  LightbulbWorkerTable,
} from "@opencode-ai/core/lightbulb/sql"
import { tmpdir } from "./fixture/tmpdir"
import { it } from "./lib/effect"

const now = Date.UTC(2026, 0, 1)

const defaultPolicy = {
  schedule: {
    enabled: true,
    cadenceMs: 60_000,
  },
  budget: {
    status: "open",
    maxRunsPerDay: 3,
    maxTokens: 120_000,
    maxCostUsd: 12,
    maxContextTokens: 480_000,
  },
} satisfies Lightbulb.LoopProfileDefaultPolicy

function layer(directory: string) {
  const database = Database.layerFromPath(path.join(directory, "lightbulb-scheduler-supervisor.db")).pipe(Layer.fresh)
  return Layer.mergeAll(database, Lightbulb.layer.pipe(Layer.provide(database)))
}

describe("Lightbulb scheduler supervisor", () => {
  it.effect("plans one selected loop through fakeable storage adapters", () =>
    Effect.gen(function* () {
      const accountID = Lightbulb.AccountID.create()
      const goalID = Lightbulb.GoalID.create()
      const dueLoopID = Lightbulb.LoopID.create()
      const dependencyLoopID = Lightbulb.LoopID.create()
      const runID = Lightbulb.RunID.create()
      const eventID = Lightbulb.EventID.create()
      const passEvents: Lightbulb.EventID[] = []
      const admittedLoops: Lightbulb.LoopID[] = []
      const storage = {
        readExistingPass: () => Effect.succeed(null),
        readExistingAdmission: () => Effect.succeed(null),
        readLoopStates: () =>
          Effect.succeed([
            {
              schedule: {
                accountID,
                goalID,
                loopID: dueLoopID,
                profileID: "due",
                kind: "implementation",
                loopStatus: "active",
                summary: "Due fake loop.",
                schedule: { enabled: true, cadenceMs: 1_000, nextDueAt: now - 1 },
                budget: {
                  status: "open",
                  maxRunsPerDay: 3,
                  maxTokens: 120_000,
                  maxCostUsd: 12,
                  maxContextTokens: 480_000,
                  holdReason: null,
                  runsStartedToday: 0,
                  remainingRunsToday: 3,
                  resetsAt: now + 86_400_000,
                },
                classification: "due",
                reason: null,
              },
              activeRun: null,
              dependencyHoldReason: null,
              recoveryRequiredReason: null,
              staleWorkerReason: null,
            },
            {
              schedule: {
                accountID,
                goalID,
                loopID: dependencyLoopID,
                profileID: "dependency",
                kind: "review",
                loopStatus: "active",
                summary: "Dependency-held fake loop.",
                schedule: { enabled: true, cadenceMs: 1_000, nextDueAt: now - 1 },
                budget: {
                  status: "open",
                  maxRunsPerDay: 3,
                  maxTokens: 120_000,
                  maxCostUsd: 12,
                  maxContextTokens: 480_000,
                  holdReason: null,
                  runsStartedToday: 0,
                  remainingRunsToday: 3,
                  resetsAt: now + 86_400_000,
                },
                classification: "due",
                reason: null,
              },
              activeRun: null,
              dependencyHoldReason: "waiting_for_gate",
              recoveryRequiredReason: null,
              staleWorkerReason: null,
            },
          ]),
        admitLoopRun: (input) =>
          Effect.sync(() => {
            admittedLoops.push(input.loopID)
            return {
              outcome: "admitted",
              runID,
              eventID,
              schedule: {
                accountID,
                goalID,
                loopID: input.loopID,
                profileID: "due",
                kind: "implementation",
                loopStatus: "active",
                summary: "Due fake loop.",
                schedule: { enabled: true, cadenceMs: 1_000, nextDueAt: now - 1 },
                budget: null,
                classification: "due",
                reason: null,
              },
            }
          }),
        recordPass: (result) =>
          Effect.sync(() => {
            passEvents.push(eventID)
            return { ...result, eventID }
          }),
      } satisfies SchedulerSupervisorStorage

      const pass = yield* superviseScheduledLoops({
        accountID,
        now,
        passID: "fake-pass",
        storage,
      })

      expect(admittedLoops).toEqual([dueLoopID])
      expect(passEvents).toEqual([eventID])
      expect(pass).toMatchObject({
        selectedLoopID: dueLoopID,
        selectedRunID: runID,
        ownershipClaim: { loopID: dueLoopID, runID, claimedAt: now },
        outcomes: [
          expect.objectContaining({ loopID: dueLoopID, reason: "selected" }),
          expect.objectContaining({ loopID: dependencyLoopID, reason: "dependency_held", operatorReason: "waiting_for_gate" }),
        ],
      })
    }),
  )

  it.effect("adopts a competing same-pass admission before recording a conflicting pass", () =>
    Effect.gen(function* () {
      const accountID = Lightbulb.AccountID.create()
      const goalID = Lightbulb.GoalID.create()
      const loopID = Lightbulb.LoopID.create()
      const runID = Lightbulb.RunID.create()
      const admissionEventID = Lightbulb.EventID.create()
      const supervisorEventID = Lightbulb.EventID.create()
      const passRecords: string[] = []
      let readAdmissionCount = 0
      const schedule = {
        accountID,
        goalID,
        loopID,
        profileID: "due",
        kind: "implementation",
        loopStatus: "active",
        summary: "Due fake loop.",
        schedule: { enabled: true, cadenceMs: 1_000, nextDueAt: now - 1 },
        budget: {
          status: "open",
          maxRunsPerDay: 3,
          maxTokens: 120_000,
          maxCostUsd: 12,
          maxContextTokens: 480_000,
          holdReason: null,
          runsStartedToday: 0,
          remainingRunsToday: 3,
          resetsAt: now + 86_400_000,
        },
        classification: "due",
        reason: null,
      } satisfies Lightbulb.LoopScheduleReadModel
      const storage = {
        readExistingPass: () => Effect.succeed(null),
        readExistingAdmission: () =>
          Effect.sync(() => {
            readAdmissionCount++
            if (readAdmissionCount === 1) return null
            return {
              loopID,
              runID,
              admissionEventID,
              claimedAt: now,
            }
          }),
        readLoopStates: () =>
          Effect.succeed([
            {
              schedule,
              activeRun: null,
              dependencyHoldReason: null,
              recoveryRequiredReason: null,
              staleWorkerReason: null,
            },
          ]),
        admitLoopRun: () =>
          Effect.succeed({
            outcome: "skipped" as const,
            eventID: admissionEventID,
            schedule,
            reason: "admission_claim_lost",
          }),
        recordPass: (result) =>
          Effect.sync(() => {
            passRecords.push(result.selectedRunID ?? "no-selected")
            return { ...result, eventID: supervisorEventID }
          }),
      } satisfies SchedulerSupervisorStorage

      const pass = yield* superviseScheduledLoops({
        accountID,
        now,
        passID: "overlap-pass",
        storage,
      })

      expect(pass).toMatchObject({
        selectedLoopID: loopID,
        selectedRunID: runID,
        ownershipClaim: { loopID, runID, claimedAt: now },
        outcomes: [expect.objectContaining({ loopID, reason: "selected", runID, eventID: admissionEventID })],
      })
      expect(passRecords).toEqual([runID])
    }),
  )

  it.live("admits at most one due loop and replays the same pass without another run", () =>
    Effect.acquireRelease(
      Effect.promise(() => tmpdir()),
      (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
    ).pipe(
      Effect.flatMap((tmp) =>
        Effect.gen(function* () {
          const lightbulb = yield* Lightbulb.Service
          const database = yield* Database.Service
          const created = yield* lightbulb.createOrAdoptGoal({
            accountName: "Supervisor Account",
            title: "One loop per supervisor pass",
            objective: "Select one due loop and keep retry idempotency.",
          })
          const firstLoopID = Lightbulb.loopIDForProfile(created.goal.id, "first")
          const secondLoopID = Lightbulb.loopIDForProfile(created.goal.id, "second")
          yield* lightbulb.bootstrapLoopProfiles({
            accountID: created.goal.account_id,
            goalID: created.goal.id,
            profiles: [
              {
                profileID: "first",
                kind: "discovery",
                summary: "First due loop.",
                schedule: { cadenceMs: 1_000 },
              },
              {
                profileID: "second",
                kind: "implementation",
                summary: "Second due loop.",
                schedule: { cadenceMs: 1_000 },
              },
            ],
            defaultPolicy,
            now,
          })

          const pass = yield* lightbulb.superviseScheduledLoops({
            accountID: created.goal.account_id,
            now: now + 2_000,
            passID: "supervisor-pass-1",
            source: { scheduler_id: "unit" },
          })
          const replay = yield* lightbulb.superviseScheduledLoops({
            accountID: created.goal.account_id,
            now: now + 2_000,
            passID: "supervisor-pass-1",
            source: { scheduler_id: "unit-retry" },
          })
          const runs = yield* database.db
            .select()
            .from(LightbulbRunTable)
            .where(eq(LightbulbRunTable.account_id, created.goal.account_id))
            .all()
            .pipe(Effect.orDie)
          const events = yield* database.db
            .select()
            .from(LightbulbEventTable)
            .where(eq(LightbulbEventTable.type, "lightbulb.scheduler_supervisor.completed"))
            .all()
            .pipe(Effect.orDie)

          expect(pass).toMatchObject({
            passID: "supervisor-pass-1",
            replayed: false,
            selectedLoopID: firstLoopID,
            selectedRunID: expect.any(String),
            ownershipClaim: expect.objectContaining({ loopID: firstLoopID, claimedAt: now + 2_000 }),
            nextWakeAt: now + 2_000,
            outcomes: [
              expect.objectContaining({
                loopID: firstLoopID,
                reason: "selected",
                selected: true,
                runID: expect.any(String),
                eventID: expect.any(String),
              }),
              expect.objectContaining({
                loopID: secondLoopID,
                reason: "one_loop_per_pass",
                selected: false,
              }),
            ],
          })
          expect(replay).toMatchObject({
            passID: "supervisor-pass-1",
            replayed: true,
            selectedLoopID: firstLoopID,
            selectedRunID: pass.selectedRunID,
          })
          expect(runs).toHaveLength(1)
          expect(runs[0]?.metadata).toEqual({
            admission: expect.objectContaining({
              source: expect.objectContaining({ scheduler_id: "unit", supervisor_pass_id: "supervisor-pass-1" }),
            }),
          })
          expect(events).toHaveLength(1)
          expect(events[0]).toMatchObject({
            aggregate_type: "scheduler_supervisor_pass",
            aggregate_id: "supervisor-pass-1",
            data: expect.objectContaining({
              selected_loop_id: firstLoopID,
              selected_run_id: pass.selectedRunID,
              ownership_claim: expect.objectContaining({ loopID: firstLoopID, claimedAt: now + 2_000 }),
              next_wake_at: now + 2_000,
            }),
          })
        }).pipe(Effect.provide(layer(tmp.path))),
      ),
    ),
  )

  it.live("scopes pass replay by account and replays empty no-loop outcomes", () =>
    Effect.acquireRelease(
      Effect.promise(() => tmpdir()),
      (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
    ).pipe(
      Effect.flatMap((tmp) =>
        Effect.gen(function* () {
          const lightbulb = yield* Lightbulb.Service
          const database = yield* Database.Service
          const first = yield* lightbulb.createOrAdoptGoal({
            accountName: "First Replay Account",
            title: "First account pass",
            objective: "Own the first pass ID without leaking it to another account.",
          })
          const firstLoopID = Lightbulb.loopIDForProfile(first.goal.id, "first")
          yield* lightbulb.bootstrapLoopProfiles({
            accountID: first.goal.account_id,
            goalID: first.goal.id,
            profiles: [{ profileID: "first", kind: "discovery", summary: "First account due loop.", schedule: { cadenceMs: 1_000 } }],
            defaultPolicy,
            now,
          })
          const firstPass = yield* lightbulb.superviseScheduledLoops({
            accountID: first.goal.account_id,
            now: now + 2_000,
            passID: "shared-pass-id",
          })
          const second = yield* lightbulb.createOrAdoptGoal({
            accountName: "Second Replay Account",
            title: "Second account pass",
            objective: "Replay only this account's empty supervisor pass.",
          })

          const secondPass = yield* lightbulb.superviseScheduledLoops({
            accountID: second.goal.account_id,
            now: now + 2_000,
            passID: "shared-pass-id",
          })
          const secondReplay = yield* lightbulb.superviseScheduledLoops({
            accountID: second.goal.account_id,
            now: now + 2_000,
            passID: "shared-pass-id",
          })
          const events = yield* database.db
            .select()
            .from(LightbulbEventTable)
            .where(eq(LightbulbEventTable.type, "lightbulb.scheduler_supervisor.completed"))
            .all()
            .pipe(Effect.orDie)

          expect(firstPass).toMatchObject({
            accountID: first.goal.account_id,
            selectedLoopID: firstLoopID,
            selectedRunID: expect.any(String),
          })
          expect(secondPass).toMatchObject({
            accountID: second.goal.account_id,
            replayed: false,
            selectedLoopID: null,
            selectedRunID: null,
            outcomes: [expect.objectContaining({ loopID: null, reason: "no_loops" })],
          })
          expect(secondReplay).toMatchObject({
            accountID: second.goal.account_id,
            replayed: true,
            selectedLoopID: null,
            selectedRunID: null,
            outcomes: [expect.objectContaining({ loopID: null, reason: "no_loops" })],
          })
          expect(events.map((event) => [event.account_id, event.aggregate_id])).toEqual([
            [first.goal.account_id, "shared-pass-id"],
            [second.goal.account_id, "shared-pass-id"],
          ])
        }).pipe(Effect.provide(layer(tmp.path))),
      ),
    ),
  )

  it.live("records one canonical event for concurrent no-loop same-pass callers", () =>
    Effect.acquireRelease(
      Effect.promise(() => tmpdir()),
      (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
    ).pipe(
      Effect.flatMap((tmp) =>
        Effect.gen(function* () {
          const lightbulb = yield* Lightbulb.Service
          const database = yield* Database.Service
          const created = yield* lightbulb.createOrAdoptGoal({
            accountName: "Concurrent Empty Pass Account",
            title: "Concurrent empty supervisor pass",
            objective: "Serialize no-op supervisor passes with a durable claim.",
          })
          const first = yield* lightbulb
            .superviseScheduledLoops({
              accountID: created.goal.account_id,
              now: now + 2_000,
              passID: "concurrent-empty-pass",
            })
            .pipe(Effect.forkChild)
          const second = yield* lightbulb
            .superviseScheduledLoops({
              accountID: created.goal.account_id,
              now: now + 2_000,
              passID: "concurrent-empty-pass",
            })
            .pipe(Effect.forkChild)
          const firstPass = yield* Fiber.join(first)
          const secondPass = yield* Fiber.join(second)
          const events = yield* database.db
            .select()
            .from(LightbulbEventTable)
            .where(eq(LightbulbEventTable.type, "lightbulb.scheduler_supervisor.completed"))
            .all()
            .pipe(Effect.orDie)
          const claims = yield* database.db
            .select()
            .from(LightbulbSchedulerSupervisorPassTable)
            .where(eq(LightbulbSchedulerSupervisorPassTable.pass_id, "concurrent-empty-pass"))
            .all()
            .pipe(Effect.orDie)

          expect(firstPass.eventID).toBe(secondPass.eventID)
          expect(firstPass.outcomes).toEqual([expect.objectContaining({ loopID: null, reason: "no_loops" })])
          expect(secondPass.outcomes).toEqual([expect.objectContaining({ loopID: null, reason: "no_loops" })])
          expect(events).toHaveLength(1)
          expect(claims).toEqual([
            expect.objectContaining({
              account_id: created.goal.account_id,
              pass_id: "concurrent-empty-pass",
              event_id: firstPass.eventID,
            }),
          ])
        }).pipe(Effect.provide(layer(tmp.path))),
      ),
    ),
  )

  it.live("adopts a run admitted before the supervisor pass event was recorded", () =>
    Effect.acquireRelease(
      Effect.promise(() => tmpdir()),
      (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
    ).pipe(
      Effect.flatMap((tmp) =>
        Effect.gen(function* () {
          const lightbulb = yield* Lightbulb.Service
          const database = yield* Database.Service
          const created = yield* lightbulb.createOrAdoptGoal({
            accountName: "Crash Adoption Account",
            title: "Adopt crash-admitted run",
            objective: "Retry the same supervisor pass after admission but before pass event recording.",
          })
          const loopID = Lightbulb.loopIDForProfile(created.goal.id, "crash")
          yield* lightbulb.bootstrapLoopProfiles({
            accountID: created.goal.account_id,
            goalID: created.goal.id,
            profiles: [{ profileID: "crash", kind: "implementation", summary: "Crash-adopted implementation loop.", schedule: { cadenceMs: 1_000 } }],
            defaultPolicy,
            now,
          })
          const admitted = yield* lightbulb.admitLoopRun({
            accountID: created.goal.account_id,
            loopID,
            now: now + 2_000,
            source: { supervisor_pass_id: "crash-pass" },
          })
          const pass = yield* lightbulb.superviseScheduledLoops({
            accountID: created.goal.account_id,
            now: now + 2_000,
            passID: "crash-pass",
          })
          const replay = yield* lightbulb.superviseScheduledLoops({
            accountID: created.goal.account_id,
            now: now + 2_000,
            passID: "crash-pass",
          })
          const runs = yield* database.db
            .select()
            .from(LightbulbRunTable)
            .where(eq(LightbulbRunTable.loop_id, loopID))
            .all()
            .pipe(Effect.orDie)
          const events = yield* database.db
            .select()
            .from(LightbulbEventTable)
            .where(eq(LightbulbEventTable.type, "lightbulb.scheduler_supervisor.completed"))
            .all()
            .pipe(Effect.orDie)

          expect(admitted).toMatchObject({ outcome: "admitted", runID: expect.any(String), eventID: expect.any(String) })
          expect(pass).toMatchObject({
            replayed: false,
            selectedLoopID: loopID,
            selectedRunID: admitted.outcome === "admitted" ? admitted.runID : null,
            ownershipClaim: expect.objectContaining({ loopID, claimedAt: now + 2_000 }),
            outcomes: [
              expect.objectContaining({
                loopID,
                reason: "selected",
                runID: admitted.outcome === "admitted" ? admitted.runID : null,
                eventID: admitted.outcome === "admitted" ? admitted.eventID : null,
              }),
            ],
          })
          expect(replay).toMatchObject({
            replayed: true,
            selectedLoopID: loopID,
            selectedRunID: pass.selectedRunID,
          })
          expect(runs).toHaveLength(1)
          expect(events).toHaveLength(1)
        }).pipe(Effect.provide(layer(tmp.path))),
      ),
    ),
  )

  it.live("records a deterministic no-op when no loop is due", () =>
    Effect.acquireRelease(
      Effect.promise(() => tmpdir()),
      (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
    ).pipe(
      Effect.flatMap((tmp) =>
        Effect.gen(function* () {
          const lightbulb = yield* Lightbulb.Service
          const database = yield* Database.Service
          const created = yield* lightbulb.createOrAdoptGoal({
            accountName: "No Due Supervisor Account",
            title: "No due supervisor pass",
            objective: "Trace scheduler passes that launch nothing.",
          })
          const loopID = Lightbulb.loopIDForProfile(created.goal.id, "future")
          yield* lightbulb.bootstrapLoopProfiles({
            accountID: created.goal.account_id,
            goalID: created.goal.id,
            profiles: [{ profileID: "future", kind: "status", summary: "Future status loop." }],
            defaultPolicy,
            now,
          })

          const pass = yield* lightbulb.superviseScheduledLoops({
            accountID: created.goal.account_id,
            now: now + 500,
            passID: "supervisor-no-due",
          })
          const runs = yield* database.db
            .select()
            .from(LightbulbRunTable)
            .where(eq(LightbulbRunTable.account_id, created.goal.account_id))
            .all()
            .pipe(Effect.orDie)

          expect(pass).toMatchObject({
            selectedLoopID: null,
            selectedRunID: null,
            nextWakeAt: now + 60_000,
            outcomes: [
              expect.objectContaining({
                loopID,
                reason: "no_due_loops",
                operatorReason: "next_due_at_in_future",
              }),
            ],
          })
          expect(runs).toHaveLength(0)
        }).pipe(Effect.provide(layer(tmp.path))),
      ),
    ),
  )

  it.live("records budget-held and disabled operator reasons without admitting runs", () =>
    Effect.acquireRelease(
      Effect.promise(() => tmpdir()),
      (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
    ).pipe(
      Effect.flatMap((tmp) =>
        Effect.gen(function* () {
          const lightbulb = yield* Lightbulb.Service
          const database = yield* Database.Service
          const created = yield* lightbulb.createOrAdoptGoal({
            accountName: "Held Supervisor Account",
            title: "Held supervisor pass",
            objective: "Keep operator reasons bounded.",
          })
          yield* lightbulb.bootstrapLoopProfiles({
            accountID: created.goal.account_id,
            goalID: created.goal.id,
            profiles: [
              {
                profileID: "budget",
                kind: "debug",
                summary: "Budget-held loop.",
                schedule: { cadenceMs: 1_000 },
                budget: { status: "held", holdReason: "daily_cost_budget_exhausted" },
              },
              {
                profileID: "disabled",
                kind: "review",
                summary: "Disabled loop.",
                schedule: { enabled: false },
              },
            ],
            defaultPolicy,
            now,
          })

          const pass = yield* lightbulb.superviseScheduledLoops({
            accountID: created.goal.account_id,
            now: now + 2_000,
            passID: "supervisor-held",
          })
          const runs = yield* database.db
            .select()
            .from(LightbulbRunTable)
            .where(eq(LightbulbRunTable.account_id, created.goal.account_id))
            .all()
            .pipe(Effect.orDie)

          expect(pass.outcomes.map((outcome) => [outcome.profileID, outcome.reason, outcome.operatorReason])).toEqual([
            ["budget", "budget_held", "daily_cost_budget_exhausted"],
            ["disabled", "disabled", "loop_disabled"],
          ])
          expect(pass.selectedRunID).toBe(null)
          expect(runs).toHaveLength(0)
        }).pipe(Effect.provide(layer(tmp.path))),
      ),
    ),
  )

  it.live("holds already-active ownership and includes compact run handles", () =>
    Effect.acquireRelease(
      Effect.promise(() => tmpdir()),
      (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
    ).pipe(
      Effect.flatMap((tmp) =>
        Effect.gen(function* () {
          const lightbulb = yield* Lightbulb.Service
          const database = yield* Database.Service
          const created = yield* lightbulb.createOrAdoptGoal({
            accountName: "Active Supervisor Account",
            title: "Already active supervisor pass",
            objective: "Do not duplicate active loop ownership.",
          })
          const loopID = Lightbulb.loopIDForProfile(created.goal.id, "active")
          const runID = Lightbulb.RunID.create()
          yield* lightbulb.bootstrapLoopProfiles({
            accountID: created.goal.account_id,
            goalID: created.goal.id,
            profiles: [{ profileID: "active", kind: "implementation", summary: "Active implementation loop.", schedule: { cadenceMs: 1_000 } }],
            defaultPolicy,
            now,
          })
          yield* database.db
            .insert(LightbulbRunTable)
            .values({
              id: runID,
              account_id: created.goal.account_id,
              loop_id: loopID,
              status: "running",
              review_status: "not_requested",
              debug_status: "not_started",
              gate_status: "pending",
              summary: "Existing active run.",
              started_at: now + 500,
              time_created: now + 500,
              time_updated: now + 500,
            })
            .run()
            .pipe(Effect.orDie)

          const pass = yield* lightbulb.superviseScheduledLoops({
            accountID: created.goal.account_id,
            now: now + 2_000,
            passID: "supervisor-active",
          })
          const runs = yield* database.db
            .select()
            .from(LightbulbRunTable)
            .where(eq(LightbulbRunTable.loop_id, loopID))
            .all()
            .pipe(Effect.orDie)

          expect(pass).toMatchObject({
            selectedRunID: null,
            outcomes: [
              expect.objectContaining({
                loopID,
                reason: "already_active",
                activeRun: expect.objectContaining({ runID, status: "running" }),
              }),
            ],
          })
          expect(runs).toHaveLength(1)
        }).pipe(Effect.provide(layer(tmp.path))),
      ),
    ),
  )

  it.live("holds loops for dependency and recovery metadata reasons", () =>
    Effect.acquireRelease(
      Effect.promise(() => tmpdir()),
      (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
    ).pipe(
      Effect.flatMap((tmp) =>
        Effect.gen(function* () {
          const lightbulb = yield* Lightbulb.Service
          const database = yield* Database.Service
          const created = yield* lightbulb.createOrAdoptGoal({
            accountName: "Dependency Supervisor Account",
            title: "Dependency and recovery holds",
            objective: "Expose durable hold reasons from loop metadata.",
          })
          const dependencyLoopID = Lightbulb.loopIDForProfile(created.goal.id, "dependency")
          const recoveryLoopID = Lightbulb.loopIDForProfile(created.goal.id, "recovery")
          yield* lightbulb.bootstrapLoopProfiles({
            accountID: created.goal.account_id,
            goalID: created.goal.id,
            profiles: [
              { profileID: "dependency", kind: "implementation", summary: "Dependency-held loop.", schedule: { cadenceMs: 1_000 } },
              { profileID: "recovery", kind: "debug", summary: "Recovery-required loop.", schedule: { cadenceMs: 1_000 } },
            ],
            defaultPolicy,
            now,
          })
          const dependencyLoop = yield* database.db
            .select()
            .from(LightbulbLoopTable)
            .where(eq(LightbulbLoopTable.id, dependencyLoopID))
            .get()
            .pipe(Effect.orDie)
          const recoveryLoop = yield* database.db
            .select()
            .from(LightbulbLoopTable)
            .where(eq(LightbulbLoopTable.id, recoveryLoopID))
            .get()
            .pipe(Effect.orDie)
          yield* database.db
            .update(LightbulbLoopTable)
            .set({ metadata: { ...(dependencyLoop?.metadata ?? {}), supervisor: { dependency_hold_reason: "waiting_for_review_gate" } } })
            .where(eq(LightbulbLoopTable.id, dependencyLoopID))
            .run()
            .pipe(Effect.orDie)
          yield* database.db
            .update(LightbulbLoopTable)
            .set({ metadata: { ...(recoveryLoop?.metadata ?? {}), supervisor: { recovery_required_reason: "previous_worker_exit_unknown" } } })
            .where(eq(LightbulbLoopTable.id, recoveryLoopID))
            .run()
            .pipe(Effect.orDie)

          const pass = yield* lightbulb.superviseScheduledLoops({
            accountID: created.goal.account_id,
            now: now + 2_000,
            passID: "supervisor-dependency",
          })

          expect(pass.outcomes.map((outcome) => [outcome.loopID, outcome.reason, outcome.operatorReason])).toEqual([
            [dependencyLoopID, "dependency_held", "waiting_for_review_gate"],
            [recoveryLoopID, "recovery_required", "previous_worker_exit_unknown"],
          ])
          expect(pass.selectedRunID).toBe(null)
        }).pipe(Effect.provide(layer(tmp.path))),
      ),
    ),
  )

  it.live("holds stale workers for recovery instead of admitting another run", () =>
    Effect.acquireRelease(
      Effect.promise(() => tmpdir()),
      (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
    ).pipe(
      Effect.flatMap((tmp) =>
        Effect.gen(function* () {
          const lightbulb = yield* Lightbulb.Service
          const database = yield* Database.Service
          const created = yield* lightbulb.createOrAdoptGoal({
            accountName: "Stale Worker Supervisor Account",
            title: "Stale worker supervisor pass",
            objective: "Require recovery before duplicate worker dispatch.",
          })
          const loopID = Lightbulb.loopIDForProfile(created.goal.id, "stale")
          const runID = Lightbulb.RunID.create()
          const workerID = Lightbulb.WorkerID.create()
          yield* lightbulb.bootstrapLoopProfiles({
            accountID: created.goal.account_id,
            goalID: created.goal.id,
            profiles: [{ profileID: "stale", kind: "debug", summary: "Stale worker loop.", schedule: { cadenceMs: 1_000 } }],
            defaultPolicy,
            now,
          })
          yield* database.db
            .insert(LightbulbRunTable)
            .values({
              id: runID,
              account_id: created.goal.account_id,
              loop_id: loopID,
              status: "running",
              review_status: "not_requested",
              debug_status: "reproducing",
              gate_status: "pending",
              summary: "Run with stale worker heartbeat.",
              started_at: now + 500,
              time_created: now + 500,
              time_updated: now + 500,
            })
            .run()
            .pipe(Effect.orDie)
          yield* database.db
            .insert(LightbulbWorkerTable)
            .values({
              id: workerID,
              account_id: created.goal.account_id,
              run_id: runID,
              role: "debug worker",
              status: "running",
              summary: "Worker heartbeat is stale.",
              metadata: { supervisor: { last_heartbeat_at: now } },
              time_created: now + 500,
              time_updated: now + 500,
            })
            .run()
            .pipe(Effect.orDie)

          const pass = yield* lightbulb.superviseScheduledLoops({
            accountID: created.goal.account_id,
            now: now + 2_000,
            passID: "supervisor-stale",
            staleWorkerMs: 1_000,
          })
          const runs = yield* database.db
            .select()
            .from(LightbulbRunTable)
            .where(eq(LightbulbRunTable.loop_id, loopID))
            .all()
            .pipe(Effect.orDie)

          expect(pass).toMatchObject({
            selectedRunID: null,
            outcomes: [
              expect.objectContaining({
                loopID,
                reason: "stale_worker",
                operatorReason: "stale_worker",
                activeRun: expect.objectContaining({ runID, workerIDs: [workerID] }),
              }),
            ],
          })
          expect(runs).toHaveLength(1)
        }).pipe(Effect.provide(layer(tmp.path))),
      ),
    ),
  )
})
