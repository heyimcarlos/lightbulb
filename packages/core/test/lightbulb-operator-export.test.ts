import path from "path"
import { describe, expect } from "bun:test"
import { Effect, Layer } from "effect"
import { Database } from "@opencode-ai/core/database/database"
import { Lightbulb } from "@opencode-ai/core/lightbulb"
import {
  LightbulbDiscoveryCandidateTable,
  LightbulbTaskPacketTable,
  LightbulbWorkerTable,
} from "@opencode-ai/core/lightbulb/sql"
import { tmpdir } from "./fixture/tmpdir"
import { it } from "./lib/effect"

const now = Date.UTC(2026, 5, 24, 12)
const secret = "SECRET_WORKER_TRANSCRIPT_DO_NOT_EXPORT"
const defaultPolicy = {
  schedule: { enabled: true, cadenceMs: 1_000 },
  budget: { status: "open", maxRunsPerDay: 2, maxTokens: 1_000, maxCostUsd: 5, maxContextTokens: 5_000 },
} satisfies Lightbulb.LoopProfileDefaultPolicy

function layer(directory: string) {
  const database = Database.layerFromPath(path.join(directory, "lightbulb-operator-export.db")).pipe(Layer.fresh)
  return Layer.mergeAll(database, Lightbulb.layer.pipe(Layer.provide(database)))
}

describe("Lightbulb operator exports", () => {
  it.live("exports deterministic state, budget, and run-log read models without raw transcripts", () =>
    Effect.acquireRelease(
      Effect.promise(() => tmpdir()),
      (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
    ).pipe(
      Effect.flatMap((tmp) =>
        Effect.gen(function* () {
          const lightbulb = yield* Lightbulb.Service
          const database = yield* Database.Service
          const prepared = yield* prepareOperatorExportGraph(lightbulb, database)

          const first = yield* lightbulb.readOperatorExport({ accountID: prepared.accountID, now: now + 10_000 })
          const second = yield* lightbulb.readOperatorExport({ accountID: prepared.accountID, now: now + 10_000 })
          if (!first || !second) return yield* Effect.die("expected operator export")

          expect(second).toEqual(first)
          expect(first.access.state).toBe("lightbulb operator-export --account " + prepared.accountID + " --section state")
          expect(first.state.highPriorityActive.map((item) => item.issueRef)).toContain("#75")
          expect(first.state.watch.map((item) => item.issueRef)).toEqual(["#76"])
          expect(first.state.humanInbox.some((item) => item.kind === "review")).toBe(true)
          expect(first.state.recentNoiseIgnored.map((item) => item.issueRef)).toEqual(["#404", "#75-duplicate"])
          expect(first.state.resolvedRecent.map((item) => item.issueRef)).toContain("#27")
          expect(first.budget.killSwitch).toEqual({
            active: false,
            status: "active",
            reason: null,
          })
          expect(first.budget.totals).toMatchObject({
            loops: 1,
            exhausted: 0,
            maxRunsPerDay: 2,
            maxTokenUnits: 1_000,
            maxCostUnits: 5,
            maxContextUnits: 5_000,
            maxWorkerSpawnsPerRun: null,
            remainingRunsToday: 1,
            remainingTokenUnits: 900,
            remainingCostUnits: 4.75,
            remainingContextUnits: 4_500,
            remainingWorkerSpawnsForActiveRun: null,
          })
          expect(first.budget.loops[0]).toMatchObject({
            loopID: prepared.loopID,
            profileID: "operator-export",
            state: "open",
            workerSpawnPolicy: {
              status: "not_configured",
              reason: "worker_spawn_budget_not_configured",
            },
          })
          expect(first.runLog.entries[0]).toMatchObject({
            runID: prepared.runID,
            loopID: prepared.loopID,
            profileID: "operator-export",
            durationMs: 3_000,
            usageEstimate: {
              costUnits: 0.25,
              tokenUnits: 100,
              contextUnits: 500,
              approvalCount: 0,
            },
          })
          expect(first.runLog.entries[0]?.itemsFound.map((item) => item.issueRef)).toEqual(["#75"])
          expect(first.runLog.entries[0]?.handles.reportURIs).toEqual([".lightbulb/runs/operator-export.md"])
          expect(JSON.stringify(first)).not.toContain(secret)
          expect(JSON.stringify(first)).not.toContain("Full issue body")
        }).pipe(Effect.provide(layer(tmp.path))),
      ),
    ),
  )
})

function prepareOperatorExportGraph(lightbulb: Lightbulb.Interface, database: Database.Interface) {
  return Effect.gen(function* () {
    const created = yield* lightbulb.createOrAdoptGoal({
      accountName: "Operator Export Account",
      title: "Operator export goal",
      objective: "Expose loop state, budget, and run logs for operators.",
    })
    const loopID = Lightbulb.loopIDForProfile(created.goal.id, "operator-export")
    yield* lightbulb.bootstrapLoopProfiles({
      accountID: created.goal.account_id,
      goalID: created.goal.id,
      profiles: [
        {
          profileID: "operator-export",
          kind: "implementation",
          summary: "Export operator state.",
          registry: {
            name: "Operator export loop",
            goal: "Expose operator read models.",
            cadence: "manual",
            risk: "low",
            skills: ["lightbulb-maintainer-orchestrator"],
            state: "active",
            readModel: "operator-export",
            phases: [{ id: "export", goal: "Build compact exports." }],
            humanGates: ["review"],
            readinessMode: "human_gate",
            tokenCostTier: "low",
            dailyCap: 2,
            earlyExitRequirement: "Stop when export evidence is complete.",
          },
        },
      ],
      defaultPolicy,
      now,
    })
    const admitted = yield* lightbulb.admitLoopRun({
      accountID: created.goal.account_id,
      loopID,
      trigger: "manual",
      source: { issue_ref: "#75" },
      now: now + 2_000,
    })
    if (admitted.outcome !== "admitted") return yield* Effect.die("expected admitted run")

    const workerID = Lightbulb.WorkerID.create()
    const taskPacketID = Lightbulb.TaskPacketID.create()
    yield* database.db
      .insert(LightbulbWorkerTable)
      .values({
        id: workerID,
        account_id: created.goal.account_id,
        run_id: admitted.runID,
        role: "bounded implementation worker",
        status: "queued",
        summary: "Worker should export bounded operator state.",
        metadata: { rawTranscript: secret },
      })
      .run()
      .pipe(Effect.orDie)
    yield* database.db
      .insert(LightbulbTaskPacketTable)
      .values({
        id: taskPacketID,
        account_id: created.goal.account_id,
        worker_id: workerID,
        title: "Export loop state budget and run logs",
        status: "ready",
        instructions: "Full issue body and " + secret,
      })
      .run()
      .pipe(Effect.orDie)
    yield* lightbulb.launchWorker({
      accountID: created.goal.account_id,
      workerID,
      taskPacketID,
      trigger: "manual",
      issueRef: "#75",
      workItemRef: "github:issue:75",
      status: "running",
      cwd: ".",
      worktreeID: "operator-exports",
      command: "lightbulb worker run --task-packet " + taskPacketID,
      profileID: "opencode-native:bounded-implementation",
      sessionID: "operator-export-session",
      heartbeatURI: ".lightbulb/runs/operator-export.heartbeat.json",
      logURI: ".lightbulb/runs/operator-export.log",
      reportURI: ".lightbulb/runs/operator-export.md",
      metadata: { rawTranscript: secret },
      now: now + 2_500,
    })
    const ingested = yield* lightbulb.ingestWorkerReport({
      accountID: created.goal.account_id,
      runID: admitted.runID,
      workerID,
      taskPacketID,
      status: "complete",
      summary: "Worker exported loop state budget and run logs.",
      artifacts: [
        {
          uri: ".lightbulb/runs/operator-export.md",
          summary: "Operator export worker report.",
        },
      ],
      verification: {
        commands: ["cd packages/core && bun test test/lightbulb-operator-export.test.ts"],
        summary: "Operator export fixture covered state, budget, and run log sections.",
      },
      usage: {
        totalTokens: 100,
        costUsd: 0.25,
        contextTokens: 500,
      },
      now: now + 5_000,
    })
    yield* lightbulb.openReviewGate({
      accountID: created.goal.account_id,
      target: { kind: "artifact", artifactID: ingested.artifactHandles[0].id },
      owner: "parent-orchestrator",
      reviewer: "maintainer",
      reason: "Operator export needs parent review.",
      now: now + 6_000,
    })
    yield* insertDiscoveryCandidates(database, created.goal.account_id)
    return {
      accountID: created.goal.account_id,
      loopID,
      runID: admitted.runID,
    }
  })
}

function insertDiscoveryCandidates(database: Database.Interface, accountID: Lightbulb.AccountID) {
  const candidates = [
    ["#75", "top_actionable", "open", 100, "Export loop state budget and run logs.", "create_pickup_packet"],
    ["#76", "watch", "open", 80, "Wait for operator exports before readiness audit.", "watch_dependency"],
    ["#404", "noise", "ignored", 1, "Out of scope issue.", "ignore"],
    ["#75-duplicate", "possible_duplicates", "held", 20, "Duplicate operator export issue.", "dedupe"],
    ["#27", "recent_resolved", "resolved", 60, "Budget ledger dependency closed.", "close_dependency"],
  ] as const
  return database.db
    .insert(LightbulbDiscoveryCandidateTable)
    .values(
      candidates.map((candidate) => ({
        id: Lightbulb.DiscoveryCandidateID.create(),
        account_id: accountID,
        source_kind: "issue" as const,
        source_id: "github:issue:" + candidate[0].replace("#", ""),
        title: candidate[3] > 90 ? "Operator export slice" : "Related stable-v0 slice",
        url: "https://github.com/heyimcarlos/lightbulb/issues/" + candidate[0].replace("#", ""),
        status: candidate[2],
        section: candidate[1],
        score: candidate[3],
        reason: candidate[4],
        suggested_action: candidate[5],
        source_handles: {
          sourceRef: "github:issue:" + candidate[0].replace("#", ""),
          issueRef: candidate[0],
          issueHandle: "github:issue:" + candidate[0].replace("#", ""),
          promptHandle: "github:issue:" + candidate[0].replace("#", "") + ":prompt",
          instructionHandle: "github:issue:" + candidate[0].replace("#", "") + ":body",
          url: "https://github.com/heyimcarlos/lightbulb/issues/" + candidate[0].replace("#", ""),
        },
        duplicate_refs: candidate[1] === "possible_duplicates" ? ["#75"] : [],
        labels: ["ready-for-agent"],
        last_seen_at: now + 7_000,
        last_projected_at: now + 7_000,
      })),
    )
    .run()
    .pipe(Effect.orDie)
}
