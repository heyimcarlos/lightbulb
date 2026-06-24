import path from "path"
import { describe, expect } from "bun:test"
import { and, eq } from "drizzle-orm"
import { Effect, Layer } from "effect"
import { Database } from "@opencode-ai/core/database/database"
import { Lightbulb } from "@opencode-ai/core/lightbulb"
import {
  LightbulbLoopTable,
  LightbulbTaskPacketTable,
  LightbulbWorkerTable,
} from "@opencode-ai/core/lightbulb/sql"
import { tmpdir } from "./fixture/tmpdir"
import { it } from "./lib/effect"

const now = Date.UTC(2026, 5, 24, 13)
const secret = "SECRET_WORKER_TRANSCRIPT_DO_NOT_EXPORT"
const defaultPolicy = {
  schedule: { enabled: true, cadenceMs: 1_000 },
  budget: { status: "open", maxRunsPerDay: 2, maxTokens: 1_000, maxCostUsd: 5, maxContextTokens: 5_000 },
} satisfies Lightbulb.LoopProfileDefaultPolicy

function layer(directory: string) {
  const database = Database.layerFromPath(path.join(directory, "lightbulb-loop-readiness.db")).pipe(Layer.fresh)
  return Layer.mergeAll(database, Lightbulb.layer.pipe(Layer.provide(database)))
}

describe("Lightbulb loop readiness audit", () => {
  it.live("classifies durable loop profiles without raw transcripts", () =>
    Effect.acquireRelease(
      Effect.promise(() => tmpdir()),
      (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
    ).pipe(
      Effect.flatMap((tmp) =>
        Effect.gen(function* () {
          const lightbulb = yield* Lightbulb.Service
          const database = yield* Database.Service
          const prepared = yield* prepareReadinessGraph(lightbulb, database)

          const first = yield* lightbulb.readLoopReadiness({ accountID: prepared.accountID, now: now + 20_000 })
          const second = yield* lightbulb.readLoopReadiness({ accountID: prepared.accountID, now: now + 20_000 })
          if (!first || !second) return yield* Effect.die("expected readiness audit")

          expect(second).toEqual(first)
          expect(first.level).toBe("draft")
          expect(first.totals).toMatchObject({
            profiles: 5,
            draft: 1,
            reportOnly: 1,
            assisted: 2,
            unattendedReady: 1,
          })
          expect(profile(first, prepared.draftLoopID)).toMatchObject({
            level: "draft",
            missingReasons: expect.arrayContaining(["missing_profile_metadata", "missing_state_read_model"]),
          })
          expect(profile(first, prepared.reportLoopID)).toMatchObject({
            level: "report-only",
            missingReasons: expect.arrayContaining(["missing_pickup_packet", "missing_verifier_lane"]),
          })
          expect(profile(first, prepared.assistedLoopID)).toMatchObject({
            level: "assisted",
            missingReasons: expect.arrayContaining([
              "missing_connector_capability",
              "missing_worktree_policy",
              "missing_safe_write_policy",
            ]),
          })
          expect(profile(first, prepared.blockedL3LoopID)).toMatchObject({
            level: "assisted",
            missingReasons: ["missing_safe_write_policy"],
            canRunUnattended: false,
          })
          expect(profile(first, prepared.unattendedLoopID)).toMatchObject({
            level: "unattended-ready",
            missingReasons: [],
            canRunUnattended: true,
          })
          expect(JSON.stringify(first)).not.toContain(secret)
          expect(JSON.stringify(first)).not.toContain("Full raw worker transcript")
        }).pipe(Effect.provide(layer(tmp.path))),
      ),
    ),
  )
})

function profile(readiness: Lightbulb.LoopReadinessAudit, loopID: Lightbulb.LoopID) {
  const audit = readiness.profiles.find((item) => item.loopID === loopID)
  if (!audit) throw new Error("missing readiness profile for " + loopID)
  return audit
}

function prepareReadinessGraph(lightbulb: Lightbulb.Interface, database: Database.Interface) {
  return Effect.gen(function* () {
    const created = yield* lightbulb.createOrAdoptGoal({
      accountName: "Readiness Audit Account",
      title: "Loop readiness goal",
      objective: "Classify stable-v0 loop readiness.",
    })
    const draftLoopID = Lightbulb.LoopID.create()
    yield* database.db
      .insert(LightbulbLoopTable)
      .values({
        id: draftLoopID,
        account_id: created.goal.account_id,
        goal_id: created.goal.id,
        kind: "implementation",
        status: "active",
        summary: "Draft loop without durable profile metadata.",
        metadata: { rawTranscript: secret },
      })
      .run()
      .pipe(Effect.orDie)

    yield* lightbulb.bootstrapLoopProfiles({
      accountID: created.goal.account_id,
      goalID: created.goal.id,
      profiles: [
        profileDefinition("report-only", "Report-only readiness fixture."),
        profileDefinition("assisted", "Assisted readiness fixture."),
        profileDefinition("blocked-l3", "Blocked L3 readiness fixture."),
        profileDefinition("unattended", "Unattended readiness fixture."),
      ],
      defaultPolicy,
      now,
    })

    const assistedLoopID = Lightbulb.loopIDForProfile(created.goal.id, "assisted")
    const blockedL3LoopID = Lightbulb.loopIDForProfile(created.goal.id, "blocked-l3")
    const unattendedLoopID = Lightbulb.loopIDForProfile(created.goal.id, "unattended")
    yield* createWorkerEvidence(lightbulb, database, created.goal.account_id, assistedLoopID, {
      gateOnly: true,
      safeWrite: false,
      issueRef: "#76",
    })
    yield* createWorkerEvidence(lightbulb, database, created.goal.account_id, blockedL3LoopID, {
      gateOnly: false,
      safeWrite: false,
      issueRef: "#76-l3",
    })
    yield* createWorkerEvidence(lightbulb, database, created.goal.account_id, unattendedLoopID, {
      gateOnly: false,
      safeWrite: true,
      issueRef: "#76-ready",
    })

    return {
      accountID: created.goal.account_id,
      draftLoopID,
      reportLoopID: Lightbulb.loopIDForProfile(created.goal.id, "report-only"),
      assistedLoopID,
      blockedL3LoopID,
      unattendedLoopID,
    }
  })
}

function profileDefinition(profileID: string, summary: string): Lightbulb.LoopProfileDefinition {
  return {
    profileID,
    kind: "implementation",
    summary,
    registry: {
      name: "Readiness " + profileID,
      goal: "Classify " + profileID + " readiness.",
      cadence: "manual",
      risk: profileID === "unattended" ? "low" : "medium",
      skills: ["lightbulb-maintainer-orchestrator"],
      state: "durable",
      readModel: "loop-readiness",
      phases: [{ id: "audit", goal: "Evaluate loop readiness." }],
      humanGates: ["review"],
      readinessMode: profileID === "unattended" ? "automatic" : "human_gate",
      tokenCostTier: "low",
      dailyCap: 2,
      earlyExitRequirement: "Stop after bounded readiness evidence is recorded.",
    },
  }
}

function createWorkerEvidence(
  lightbulb: Lightbulb.Interface,
  database: Database.Interface,
  accountID: Lightbulb.AccountID,
  loopID: Lightbulb.LoopID,
  input: {
    readonly gateOnly: boolean
    readonly safeWrite: boolean
    readonly issueRef: string
  },
) {
  return Effect.gen(function* () {
    const admitted = yield* lightbulb.admitLoopRun({
      accountID,
      loopID,
      trigger: "manual",
      source: { issue_ref: input.issueRef },
      now: now + 1_000,
    })
    if (admitted.outcome !== "admitted") return yield* Effect.die("expected admitted readiness run")

    const workerID = Lightbulb.WorkerID.create()
    const taskPacketID = Lightbulb.TaskPacketID.create()
    yield* database.db
      .insert(LightbulbWorkerTable)
      .values({
        id: workerID,
        account_id: accountID,
        run_id: admitted.runID,
        role: "bounded implementation worker",
        status: "queued",
        summary: "Worker owns readiness evidence.",
        metadata: { rawTranscript: secret },
      })
      .run()
      .pipe(Effect.orDie)
    yield* database.db
      .insert(LightbulbTaskPacketTable)
      .values({
        id: taskPacketID,
        account_id: accountID,
        worker_id: workerID,
        title: "Collect readiness evidence",
        status: "ready",
        instructions: "Full raw worker transcript " + secret,
      })
      .run()
      .pipe(Effect.orDie)
    yield* lightbulb.openReviewGate({
      accountID,
      target: { kind: "run", runID: admitted.runID },
      owner: "parent-orchestrator",
      reviewer: "maintainer",
      reason: "Readiness evidence needs parent review.",
      now: now + 2_000,
    })

    if (input.gateOnly) return

    yield* lightbulb.launchWorker({
      accountID,
      workerID,
      taskPacketID,
      trigger: "manual",
      issueRef: input.issueRef,
      workItemRef: "github:issue:" + input.issueRef.replace("#", ""),
      status: "running",
      cwd: ".",
      worktreeID: "readiness-audit",
      command: "lightbulb worker run --task-packet " + taskPacketID,
      profileID: "opencode-native:bounded-implementation",
      sessionID: "readiness-" + input.issueRef.replace("#", ""),
      heartbeatURI: ".lightbulb/runs/readiness.heartbeat.json",
      logURI: ".lightbulb/runs/readiness.log",
      reportURI: ".lightbulb/runs/readiness.md",
      metadata: { rawTranscript: secret },
      now: now + 3_000,
    })
    yield* lightbulb.ingestWorkerReport({
      accountID,
      runID: admitted.runID,
      workerID,
      taskPacketID,
      status: "complete",
      summary: "Worker returned readiness evidence.",
      artifacts: [
        {
          uri: ".lightbulb/runs/readiness.md",
          summary: "Readiness worker report.",
        },
      ],
      verification: {
        commands: ["cd packages/core && bun test test/lightbulb-loop-readiness.test.ts"],
        summary: "Readiness fixture covered loop levels.",
      },
      usage: {
        totalTokens: 100,
        costUsd: 0.25,
        contextTokens: 500,
      },
      now: now + 4_000,
    })
    if (input.safeWrite) yield* attachSafeWritePolicy(database, accountID, loopID)
  })
}

function attachSafeWritePolicy(database: Database.Interface, accountID: Lightbulb.AccountID, loopID: Lightbulb.LoopID) {
  return Effect.gen(function* () {
    const loop = yield* database.db
      .select()
      .from(LightbulbLoopTable)
      .where(and(eq(LightbulbLoopTable.account_id, accountID), eq(LightbulbLoopTable.id, loopID)))
      .get()
      .pipe(Effect.orDie)
    if (!loop) return yield* Effect.die("expected loop for safe-write policy")
    yield* database.db
      .update(LightbulbLoopTable)
      .set({
        metadata: {
          ...(loop.metadata ?? {}),
          safe_write_policy: {
            mode: "least_privilege",
            external_writes: "human_gated",
          },
        },
      })
      .where(and(eq(LightbulbLoopTable.account_id, accountID), eq(LightbulbLoopTable.id, loopID)))
      .run()
      .pipe(Effect.orDie)
  })
}
