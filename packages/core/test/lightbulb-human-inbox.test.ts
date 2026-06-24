import path from "path"
import { describe, expect } from "bun:test"
import { eq } from "drizzle-orm"
import { Effect, Layer } from "effect"
import { Database } from "@opencode-ai/core/database/database"
import {
  Lightbulb,
  type IssueMutationApplyAdapter,
} from "@opencode-ai/core/lightbulb"
import {
  LightbulbEventTable,
  LightbulbGateTable,
  LightbulbHumanInboxItemTable,
  LightbulbLoopTable,
  LightbulbRouteTable,
} from "@opencode-ai/core/lightbulb/sql"
import { tmpdir } from "./fixture/tmpdir"
import { it } from "./lib/effect"

const now = Date.UTC(2026, 5, 24, 15)

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
  const database = Database.layerFromPath(path.join(directory, "lightbulb-human-inbox.db")).pipe(Layer.fresh)
  return Layer.mergeAll(database, Lightbulb.layer.pipe(Layer.provide(database)))
}

describe("Lightbulb human inbox", () => {
  it.live("projects grouped human decisions without raw transcripts and retries idempotently", () =>
    withLightbulb((lightbulb, database) =>
      Effect.gen(function* () {
        const seeded = yield* lightbulb.seedTracerBullet()
        yield* addHumanHeldDiscovery(lightbulb, seeded.accountID)
        yield* addHeldIssueMutations(lightbulb, seeded)
        yield* addStaleWorker(database, seeded.loopID)
        yield* addBudgetHold(lightbulb, seeded)
        yield* addPRReviewMaxAttempt(lightbulb, seeded.accountID)
        yield* addRerouteProposal(lightbulb, database, seeded.goalID)
        yield* addOwnershipCollision(database, seeded)

        const projected = yield* lightbulb.projectHumanInbox({ accountID: seeded.accountID, now, maxAttempts: 2 })
        const retry = yield* lightbulb.projectHumanInbox({ accountID: seeded.accountID, now, maxAttempts: 2 })
        const dashboard = yield* lightbulb.readDashboard(seeded.accountID)
        const operatorExport = yield* lightbulb.readOperatorExport({ accountID: seeded.accountID, now })
        const snapshot = yield* lightbulb.publishOperationsSnapshot({ accountID: seeded.accountID, now })
        const rows = yield* database.db.select().from(LightbulbHumanInboxItemTable).all().pipe(Effect.orDie)
        const projectedEvents = yield* database.db
          .select()
          .from(LightbulbEventTable)
          .where(eq(LightbulbEventTable.type, "lightbulb.human_inbox.projected"))
          .all()
          .pipe(Effect.orDie)

        expect(projected.changed).toBe(true)
        expect(projected.eventID).toBeTruthy()
        expect(retry.changed).toBe(false)
        expect(retry.eventID).toBeNull()
        expect(projectedEvents).toHaveLength(2)
        expect(new Set(projected.digest.actionRequired.map((item) => item.type))).toEqual(
          new Set([
            "approval_needed",
            "needs_info",
            "conflict",
            "stale_worker",
            "budget_kill_switch",
            "max_attempts",
            "reroute_proposal",
          ] satisfies Lightbulb.HumanInboxDecisionType[]),
        )
        expect(projected.digest.byType.approval_needed.some((item) => item.source.gateID === seeded.gateID)).toBe(true)
        expect(projected.digest.byType.needs_info[0]?.source.issueRef).toBe("#81")
        expect(projected.digest.byType.budget_kill_switch[0]?.reason).toBe("approval_budget_exhausted")
        expect(projected.digest.byType.max_attempts[0]?.reason).toContain("2/2 attempts")
        expect(projected.digest.actionRequired.every((item) => item.ageMs >= 0)).toBe(true)
        expect(JSON.stringify(projected.digest)).not.toContain("rawTranscript")
        expect(dashboard?.inbox.humanInbox.counts.actionRequired).toBe(projected.digest.counts.actionRequired)
        expect(operatorExport?.state.humanInbox).toHaveLength(projected.digest.counts.actionRequired)
        expect(new Set(operatorExport?.state.humanInbox.map((item) => item.kind))).toEqual(
          new Set(projected.digest.actionRequired.map((item) => item.type)),
        )
        expect(snapshot.snapshot.counts.humanInbox.actionRequired).toBe(projected.digest.counts.actionRequired)
        expect(snapshot.snapshot.handles.humanActions).toHaveLength(Math.min(8, projected.digest.counts.actionRequired))
        expect(rows.filter((row) => row.status === "open")).toHaveLength(projected.digest.counts.actionRequired)
      }),
    ),
  )

  it.live("prunes resolved decisions while retaining a suppressed record", () =>
    withLightbulb((lightbulb, database) =>
      Effect.gen(function* () {
        const seeded = yield* lightbulb.seedTracerBullet()
        const first = yield* lightbulb.projectHumanInbox({ accountID: seeded.accountID, now })
        yield* database.db
          .update(LightbulbGateTable)
          .set({ status: "passed", time_updated: now + 1_000 })
          .where(eq(LightbulbGateTable.id, seeded.gateID))
          .run()
          .pipe(Effect.orDie)
        const second = yield* lightbulb.projectHumanInbox({ accountID: seeded.accountID, now: now + 1_000 })

        expect(first.digest.actionRequired.some((item) => item.source.gateID === seeded.gateID)).toBe(true)
        expect(second.digest.actionRequired.some((item) => item.source.gateID === seeded.gateID)).toBe(false)
        expect(second.digest.suppressed.some((item) => item.source.gateID === seeded.gateID && item.status === "resolved")).toBe(true)
      }),
    ),
  )

  it.live("keeps single-reason stale worker projection idempotent", () =>
    withLightbulb((lightbulb, database) =>
      Effect.gen(function* () {
        const seeded = yield* lightbulb.seedTracerBullet()
        yield* addSingleReasonStaleWorker(database, seeded.loopID)

        const first = yield* lightbulb.projectHumanInbox({ accountID: seeded.accountID, now })
        const retry = yield* lightbulb.projectHumanInbox({ accountID: seeded.accountID, now })
        const projectedEvents = yield* database.db
          .select()
          .from(LightbulbEventTable)
          .where(eq(LightbulbEventTable.type, "lightbulb.human_inbox.projected"))
          .all()
          .pipe(Effect.orDie)

        expect(first.changed).toBe(true)
        expect(first.digest.byType.stale_worker[0]?.metadata).toEqual({ staleWorkerReason: "heartbeat_missing" })
        expect(retry.changed).toBe(false)
        expect(projectedEvents).toHaveLength(2)
      }),
    ),
  )
})

function withLightbulb(
  run: (lightbulb: Lightbulb.Interface, database: Database.Interface) => Effect.Effect<void>,
) {
  return Effect.acquireRelease(
    Effect.promise(() => tmpdir()),
    (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
  ).pipe(
    Effect.flatMap((tmp) =>
      Effect.gen(function* () {
        const lightbulb = yield* Lightbulb.Service
        const database = yield* Database.Service
        yield* run(lightbulb, database)
      }).pipe(Effect.provide(layer(tmp.path))),
    ),
  )
}

function addHumanHeldDiscovery(lightbulb: Lightbulb.Interface, accountID: Lightbulb.AccountID) {
  return lightbulb.projectDiscoveryInbox({
    accountID,
    projectedAt: now,
    source: { test: "human-inbox" },
    issues: [
      {
        accountID,
        number: 81,
        title: "Add human inbox and escalation digest",
        url: "https://github.com/heyimcarlos/lightbulb/issues/81",
        labels: ["ready-for-human"],
        updatedAt: now,
        bodyHandle: "github:issue:81:body",
        bodySummary: "Needs a bounded human decision digest.",
      },
    ],
  })
}

function addHeldIssueMutations(lightbulb: Lightbulb.Interface, seeded: Lightbulb.SeededGraph) {
  return Effect.gen(function* () {
    yield* lightbulb.proposeIssueMutation({
      accountID: seeded.accountID,
      repository: "heyimcarlos/lightbulb",
      action: "add_comment",
      targetIssue: targetIssue(80),
      comment: {
        body: "Request approval for a safe-write mutation.",
        summary: "Request approval.",
      },
      source: source(seeded),
      now,
    })
    yield* lightbulb.runIssueMutationApplyPass({
      accountID: seeded.accountID,
      mode: "apply",
      adapter: fakeAdapter(["add_comment", "remove_label"]),
      now: now + 1,
    })
    yield* lightbulb.proposeIssueMutation({
      accountID: seeded.accountID,
      repository: "heyimcarlos/lightbulb",
      action: "remove_label",
      targetIssue: targetIssue(82, { labels: ["ready-for-agent"] }),
      removeLabels: ["ready-for-agent"],
      source: source(seeded),
      now: now + 2,
    })
    yield* lightbulb.runIssueMutationApplyPass({
      accountID: seeded.accountID,
      mode: "apply",
      approval: {
        approved: true,
        approvedBy: "test",
        approvalHandle: "lightbulb:test:approval",
      },
      adapter: fakeAdapter(["add_comment", "remove_label"]),
      now: now + 3,
    })
  })
}

function addStaleWorker(database: Database.Interface, loopID: Lightbulb.LoopID) {
  return database.db
    .update(LightbulbLoopTable)
    .set({
      metadata: {
        supervisor: {
          stale_worker_reason: "heartbeat_missing",
          recovery_required_reason: "worker_exit_unknown",
        },
      },
      time_updated: now,
    })
    .where(eq(LightbulbLoopTable.id, loopID))
    .run()
    .pipe(Effect.orDie)
}

function addSingleReasonStaleWorker(database: Database.Interface, loopID: Lightbulb.LoopID) {
  return database.db
    .update(LightbulbLoopTable)
    .set({
      metadata: {
        supervisor: {
          stale_worker_reason: "heartbeat_missing",
        },
      },
      time_updated: now,
    })
    .where(eq(LightbulbLoopTable.id, loopID))
    .run()
    .pipe(Effect.orDie)
}

function addBudgetHold(lightbulb: Lightbulb.Interface, seeded: Lightbulb.SeededGraph) {
  return lightbulb.bootstrapLoopProfiles({
    accountID: seeded.accountID,
    goalID: seeded.goalID,
    profiles: [
      {
        profileID: "human-inbox-budget",
        kind: "debug",
        summary: "Budget-held debug loop.",
        budget: {
          status: "held",
          holdReason: "approval_budget_exhausted",
        },
      },
    ],
    defaultPolicy,
    now,
  })
}

function addPRReviewMaxAttempt(lightbulb: Lightbulb.Interface, accountID: Lightbulb.AccountID) {
  return Effect.gen(function* () {
    const candidates = yield* lightbulb.discoverPRReviewCandidates({
      accountID,
      repository: "heyimcarlos/lightbulb",
      scannedAt: now,
      pulls: [
        {
          number: 124,
          title: "Review human inbox route",
          url: "https://github.com/heyimcarlos/lightbulb/pull/124",
          state: "open",
          baseRef: "lightbulb",
          headRef: "human-inbox",
          headSha: "124".repeat(14).slice(0, 40),
        },
      ],
    })
    const admission = yield* lightbulb.admitPRReviewRoute({
      accountID,
      candidateID: candidates.candidates[0]!.id,
      now: now + 10,
    })
    yield* lightbulb.recordPRReviewRouteWake({
      routeID: admission.route!.id,
      source: "worker_report",
      summary: "Review worker returned compact findings.",
      now: now + 11,
      nextWakeSource: "review_evidence",
      data: { rawTranscript: "must not appear" },
    })
    yield* lightbulb.recordPRReviewRouteWake({
      routeID: admission.route!.id,
      source: "review_evidence",
      summary: "Reviewer requested changes.",
      now: now + 12,
      blockedReason: "changes_requested",
      nextWakeSource: "human_steering",
      data: { humanDecision: "needs_rework", rawTranscript: "must not appear" },
    })
  })
}

function addRerouteProposal(
  lightbulb: Lightbulb.Interface,
  database: Database.Interface,
  goalID: Lightbulb.GoalID,
) {
  return Effect.gen(function* () {
    const route = yield* lightbulb.planGoalRoute({
      goalID,
      destination: "Stable loop v0 visual route",
      summary: "Route needs human reroute selection.",
      stops: [
        {
          kind: "decision",
          title: "Choose route",
          objective: "Pick the next stable-v0 route stop.",
          evidence: "Human steering decision.",
        },
      ],
    })
    yield* lightbulb.steerGoalRoute({
      routeID: route.id,
      reason: "new_evidence",
      summary: "New evidence suggests changing the route stop.",
      instruction: "Ask the operator to accept or adjust the reroute.",
    })
    yield* database.db
      .update(LightbulbRouteTable)
      .set({ status: "rerouting", time_updated: now })
      .where(eq(LightbulbRouteTable.id, route.id))
      .run()
      .pipe(Effect.orDie)
  })
}

function addOwnershipCollision(database: Database.Interface, seeded: Lightbulb.SeededGraph) {
  return database.db
    .insert(LightbulbEventTable)
    .values({
      id: Lightbulb.EventID.create(),
      account_id: seeded.accountID,
      aggregate_type: "worker_launch_attempt",
      aggregate_id: seeded.launchAttemptID,
      type: "lightbulb.worker_launch.skipped",
      summary: "Worker launch skipped due to active ownership collision.",
      data: {
        reason: "ownership_collision",
        run_id: seeded.runID,
        worker_id: seeded.workerID,
        task_packet_id: seeded.taskPacketID,
        attempt_id: seeded.launchAttemptID,
      },
      time_created: now,
    })
    .run()
    .pipe(Effect.orDie)
}

function fakeAdapter(capabilities: readonly Lightbulb.IssueMutationAction[]): IssueMutationApplyAdapter {
  return {
    capabilities,
    apply: () =>
      Effect.succeed({
        status: "applied",
        summary: "Applied fake issue mutation.",
      }),
  }
}

function targetIssue(
  number: number,
  options?: {
    readonly labels?: readonly string[]
  },
): Lightbulb.IssueMutationTargetIssue {
  return {
    number,
    ref: "#" + number,
    handle: "github:issue:" + number,
    url: "https://github.com/heyimcarlos/lightbulb/issues/" + number,
    labels: options?.labels ?? [],
    state: "open",
  }
}

function source(seeded: Lightbulb.SeededGraph): Lightbulb.IssueMutationSource {
  return {
    goalID: seeded.goalID,
    loopID: seeded.loopID,
    runID: seeded.runID,
    artifactIDs: [seeded.artifactID],
  }
}
