import path from "path"
import { describe, expect } from "bun:test"
import { asc, eq } from "drizzle-orm"
import { Effect, Layer } from "effect"
import { Database } from "@opencode-ai/core/database/database"
import { Lightbulb } from "@opencode-ai/core/lightbulb"
import {
  LightbulbEventTable,
  LightbulbRunTable,
  LightbulbTaskPacketTable,
  LightbulbWorkerLaunchAttemptTable,
  LightbulbWorkerTable,
} from "@opencode-ai/core/lightbulb/sql"
import { tmpdir } from "./fixture/tmpdir"
import { it } from "./lib/effect"

const now = Date.UTC(2026, 0, 4)

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
  const database = Database.layerFromPath(path.join(directory, "lightbulb-collision-guard.db")).pipe(Layer.fresh)
  return Layer.mergeAll(database, Lightbulb.layer.pipe(Layer.provide(database)))
}

describe("Lightbulb ownership collision guards", () => {
  it.live("holds conflicting worker launches and releases ownership after terminal status", () =>
    Effect.acquireRelease(
      Effect.promise(() => tmpdir()),
      (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
    ).pipe(
      Effect.flatMap((tmp) =>
        Effect.gen(function* () {
          const lightbulb = yield* Lightbulb.Service
          const database = yield* Database.Service
          const account = yield* prepareCollisionAccount(lightbulb)
          const first = yield* prepareLaunchPacket(database, account, "first")
          const second = yield* prepareLaunchPacket(database, account, "second")
          const third = yield* prepareLaunchPacket(database, account, "third")
          const routeID = Lightbulb.RouteID.create()

          const launched = yield* lightbulb.launchWorker({
            accountID: account.accountID,
            workerID: first.workerID,
            taskPacketID: first.taskPacketID,
            trigger: "scheduler",
            now: now + 4_000,
            status: "running",
            issueRef: "#79",
            cwd: "/tmp/lightbulb-collision-a",
            worktreeID: "issue-79-a",
            command: "lightbulb run --agent lightbulb-worker --format json",
            ownership: {
              routeID,
              prRef: "heyimcarlos/lightbulb#113",
              branchRef: "collision-guards",
              pathGroup: "packages/core/src/lightbulb\npackages/opencode/src/cli",
            },
          })
          const blocked = yield* lightbulb.launchWorker({
            accountID: account.accountID,
            workerID: second.workerID,
            taskPacketID: second.taskPacketID,
            trigger: "scheduler",
            now: now + 4_100,
            status: "running",
            issueRef: "#80",
            cwd: "/tmp/lightbulb-collision-b",
            worktreeID: "issue-80-b",
            command: "lightbulb run --agent lightbulb-worker --format json",
            ownership: {
              branchRef: "collision-guards",
              pathGroup: "packages/core/src/lightbulb\npackages/opencode/src/cli",
            },
          })
          const completed = yield* lightbulb.launchWorker({
            accountID: account.accountID,
            workerID: first.workerID,
            taskPacketID: first.taskPacketID,
            trigger: "scheduler",
            now: now + 4_200,
            status: "complete",
            cwd: "/tmp/lightbulb-collision-a",
            command: "lightbulb run --agent lightbulb-worker --format json",
            summary: "Released the active collision-guard owner.",
          })
          const afterRelease = yield* lightbulb.launchWorker({
            accountID: account.accountID,
            workerID: third.workerID,
            taskPacketID: third.taskPacketID,
            trigger: "scheduler",
            now: now + 4_300,
            status: "running",
            issueRef: "#81",
            cwd: "/tmp/lightbulb-collision-c",
            worktreeID: "issue-81-c",
            command: "lightbulb run --agent lightbulb-worker --format json",
            ownership: {
              branchRef: "collision-guards",
              pathGroup: "packages/core/src/lightbulb\npackages/opencode/src/cli",
            },
          })
          const snapshot = yield* lightbulb.publishOperationsSnapshot({ accountID: account.accountID, now: now + 4_400 })
          const attempts = yield* database.db
            .select()
            .from(LightbulbWorkerLaunchAttemptTable)
            .orderBy(asc(LightbulbWorkerLaunchAttemptTable.time_created))
            .all()
            .pipe(Effect.orDie)
          const skippedEvents = yield* database.db
            .select()
            .from(LightbulbEventTable)
            .where(eq(LightbulbEventTable.type, "lightbulb.worker_launch.skipped"))
            .all()
            .pipe(Effect.orDie)
          const blockedRuns = yield* database.db
            .select()
            .from(LightbulbRunTable)
            .where(eq(LightbulbRunTable.id, second.runID))
            .all()
            .pipe(Effect.orDie)
          const blockedWorkers = yield* database.db
            .select()
            .from(LightbulbWorkerTable)
            .where(eq(LightbulbWorkerTable.id, second.workerID))
            .all()
            .pipe(Effect.orDie)
          const blockedPackets = yield* database.db
            .select()
            .from(LightbulbTaskPacketTable)
            .where(eq(LightbulbTaskPacketTable.id, second.taskPacketID))
            .all()
            .pipe(Effect.orDie)

          if (launched.outcome !== "launched" || completed.outcome !== "launched" || afterRelease.outcome !== "launched") {
            throw new Error("expected launch lifecycle to create durable attempts")
          }
          expect(launched.attempt.ownershipKeys.map((key) => key.kind)).toEqual([
            "task_packet",
            "issue",
            "route",
            "pr",
            "branch",
            "worktree",
            "path_group",
          ])
          expect(blocked).toMatchObject({
            outcome: "skipped",
            reason: "ownership_collision",
            collision: {
              key: {
                kind: "branch",
                key: "branch:collision-guards",
              },
              activeAttemptID: launched.attempt.id,
              activeRunID: first.runID,
              activeWorkerID: first.workerID,
              activeTaskPacketID: first.taskPacketID,
            },
          })
          expect(completed.attempt).toMatchObject({
            id: launched.attempt.id,
            status: "complete",
          })
          expect(afterRelease.attempt).toMatchObject({
            status: "running",
            ownershipKeys: expect.arrayContaining([
              expect.objectContaining({
                kind: "branch",
                key: "branch:collision-guards",
              }),
            ]),
          })
          expect(attempts.map((attempt) => [attempt.id, attempt.status, attempt.active_key])).toEqual([
            [launched.attempt.id, "complete", null],
            [afterRelease.attempt.id, "running", account.accountID + ":" + third.taskPacketID],
          ])
          expect(blockedRuns).toEqual([
            expect.objectContaining({
              id: second.runID,
              status: "blocked",
              gate_status: "blocked",
              metadata: expect.objectContaining({
                launch_hold_reason: "ownership_collision",
                blocked_reason: "ownership_collision",
              }),
            }),
          ])
          expect(blockedWorkers[0]?.metadata).toMatchObject({
            profile_id: "second",
            launch_hold_reason: "ownership_collision",
          })
          expect(blockedPackets[0]?.metadata).toMatchObject({
            source_ref: "collision:second",
            launch_hold_reason: "ownership_collision",
          })
          expect(skippedEvents).toEqual([
            expect.objectContaining({
              aggregate_id: second.runID,
              data: expect.objectContaining({
                reason: "ownership_collision",
                collision: expect.any(Object),
              }),
            }),
          ])
          expect(skippedEvents[0]?.data.collision).toMatchObject({
            activeAttemptID: launched.attempt.id,
            activeRunID: first.runID,
            key: {
              kind: "branch",
              key: "branch:collision-guards",
            },
          })
          expect(snapshot.snapshot.counts.launchAttempts).toEqual({
            active: 1,
            failed: 0,
            complete: 1,
            collisionHolds: 1,
          })
          expect(snapshot.snapshot.handles.activeOwnership).toContainEqual(
            expect.objectContaining({
              id: afterRelease.attempt.id,
              kind: "worker_launch",
              status: "running",
              reason: expect.stringContaining("branch collision-guards"),
            }),
          )
        }).pipe(Effect.provide(layer(tmp.path))),
      ),
    ),
  )
})

function prepareCollisionAccount(lightbulb: Lightbulb.Interface) {
  return Effect.gen(function* () {
    const created = yield* lightbulb.createOrAdoptGoal({
      accountName: "Collision Guard Account",
      title: "Multi-loop ownership",
      objective: "Avoid two workers mutating the same branch or path group.",
    })
    yield* lightbulb.bootstrapLoopProfiles({
      accountID: created.goal.account_id,
      goalID: created.goal.id,
      profiles: ["first", "second", "third"].map((profileID) => ({
        profileID,
        kind: "implementation" as const,
        summary: "Collision guard test loop " + profileID + ".",
        schedule: {
          cadenceMs: 1_000,
        },
      })),
      defaultPolicy,
      now,
    })
    return {
      accountID: created.goal.account_id,
      goalID: created.goal.id,
    }
  })
}

function prepareLaunchPacket(
  database: Database.Interface,
  account: {
    readonly accountID: Lightbulb.AccountID
    readonly goalID: Lightbulb.GoalID
  },
  profileID: string,
) {
  return Effect.gen(function* () {
    const admitted = yield* Lightbulb.Service.pipe(
      Effect.flatMap((lightbulb) =>
        lightbulb.admitLoopRun({
          accountID: account.accountID,
          loopID: Lightbulb.loopIDForProfile(account.goalID, profileID),
          trigger: "schedule",
          now: now + 2_000,
        }),
      ),
    )
    if (admitted.outcome !== "admitted") return yield* Effect.die(new Error("expected admitted run"))

    const workerID = Lightbulb.WorkerID.create()
    const taskPacketID = Lightbulb.TaskPacketID.create()
    yield* database.db
      .insert(LightbulbWorkerTable)
      .values({
        id: workerID,
        account_id: account.accountID,
        run_id: admitted.runID,
        role: "bounded implementation worker",
        status: "queued",
        summary: "Collision guard worker " + profileID + ".",
        metadata: {
          profile_id: profileID,
        },
      })
      .run()
      .pipe(Effect.orDie)
    yield* database.db
      .insert(LightbulbTaskPacketTable)
      .values({
        id: taskPacketID,
        account_id: account.accountID,
        worker_id: workerID,
        title: "Implement collision guard " + profileID,
        status: "ready",
        instructions: "Launch only when no active owner holds the same branch or path group.",
        metadata: {
          source_ref: "collision:" + profileID,
        },
      })
      .run()
      .pipe(Effect.orDie)
    return {
      runID: admitted.runID,
      workerID,
      taskPacketID,
    }
  })
}
