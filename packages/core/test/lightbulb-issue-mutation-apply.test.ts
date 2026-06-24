import path from "path"
import { describe, expect } from "bun:test"
import { asc, eq } from "drizzle-orm"
import { Effect, Layer } from "effect"
import { Database } from "@opencode-ai/core/database/database"
import {
  Lightbulb,
  type IssueMutationApplyAction,
  type IssueMutationApplyAdapter,
  type IssueMutationApplyAdapterResult,
} from "@opencode-ai/core/lightbulb"
import {
  LightbulbEventTable,
  LightbulbIssueMutationOutboxTable,
} from "@opencode-ai/core/lightbulb/sql"
import { tmpdir } from "./fixture/tmpdir"
import { it } from "./lib/effect"

const now = Date.UTC(2026, 5, 24, 14)

function layer(directory: string) {
  const database = Database.layerFromPath(path.join(directory, "lightbulb-issue-mutation-apply.db")).pipe(Layer.fresh)
  return Layer.mergeAll(database, Lightbulb.layer.pipe(Layer.provide(database)))
}

describe("Lightbulb issue mutation apply pass", () => {
  it.live("renders dry-run actions without writing apply results", () =>
    withLightbulb((lightbulb, database) =>
      Effect.gen(function* () {
        const seeded = yield* lightbulb.seedTracerBullet()
        yield* seedReadyActions(lightbulb, seeded)
        const fake = fakeAdapter(() => ({
          status: "applied",
          summary: "Unexpected dry-run apply.",
        }))
        const result = yield* lightbulb.runIssueMutationApplyPass({
          accountID: seeded.accountID,
          mode: "dry_run",
          adapter: fake.adapter,
          now,
        })
        const rows = yield* database.db.select().from(LightbulbIssueMutationOutboxTable).all().pipe(Effect.orDie)
        const events = yield* issueMutationEvents(database)

        expect(result.counts).toMatchObject({
          pending: 5,
          dryRun: 5,
          applied: 0,
          held: 0,
          failed: 0,
        })
        expect(result.groups).toHaveLength(1)
        expect(result.groups[0]?.actions.map((action) => action.action)).toEqual([
          "create_issue",
          "edit_issue",
          "add_label",
          "remove_label",
          "add_comment",
        ])
        expect(result.outcomes.every((outcome) => outcome.status === "dry_run")).toBe(true)
        expect(fake.calls).toHaveLength(0)
        expect(rows.map((row) => row.status)).toEqual(["ready", "ready", "ready", "ready", "ready"])
        expect(events.filter((event) => event.type === "lightbulb.issue_mutation.apply_recorded")).toHaveLength(0)
      }),
    ),
  )

  it.live("applies create issue once after operator approval", () =>
    withLightbulb((lightbulb, database) =>
      Effect.gen(function* () {
        const seeded = yield* lightbulb.seedTracerBullet()
        yield* lightbulb.proposeIssueMutation({
          accountID: seeded.accountID,
          repository: "heyimcarlos/lightbulb",
          action: "create_issue",
          title: "Slice 52: approved create",
          body: "Create an approved issue from the mutation apply pass.",
          labels: ["enhancement", "ready-for-agent"],
          source: source(seeded),
          now,
        })
        const fake = fakeAdapter((action) => ({
          status: "applied",
          summary: "Created " + action.title + ".",
          issueURL: "https://github.com/heyimcarlos/lightbulb/issues/152",
          resultHandle: "github:issue:152",
        }))
        const first = yield* lightbulb.runIssueMutationApplyPass({
          accountID: seeded.accountID,
          mode: "apply",
          approval: approved(),
          adapter: fake.adapter,
          now: now + 1,
        })
        const second = yield* lightbulb.runIssueMutationApplyPass({
          accountID: seeded.accountID,
          mode: "apply",
          approval: approved(),
          adapter: fake.adapter,
          now: now + 2,
        })
        const rows = yield* database.db.select().from(LightbulbIssueMutationOutboxTable).all().pipe(Effect.orDie)

        expect(first.counts.applied).toBe(1)
        expect(second.counts.pending).toBe(0)
        expect(fake.calls).toHaveLength(1)
        expect(rows[0]?.status).toBe("applied")
        expect(rows[0]?.apply_result?.issueURL).toBe("https://github.com/heyimcarlos/lightbulb/issues/152")
      }),
    ),
  )

  it.live("applies edit label and comment actions through the fake adapter", () =>
    withLightbulb((lightbulb, database) =>
      Effect.gen(function* () {
        const seeded = yield* lightbulb.seedTracerBullet()
        yield* seedReadyActions(lightbulb, seeded)
        const fake = fakeAdapter((action) => ({
          status: "applied",
          summary: "Applied " + action.action + ".",
          resultHandle: "github:mutation:" + action.action + ":" + action.mutationID,
        }))
        const result = yield* lightbulb.runIssueMutationApplyPass({
          accountID: seeded.accountID,
          mode: "apply",
          approval: approved(),
          adapter: fake.adapter,
          now: now + 10,
        })
        const rows = yield* database.db
          .select()
          .from(LightbulbIssueMutationOutboxTable)
          .orderBy(asc(LightbulbIssueMutationOutboxTable.time_created))
          .all()
          .pipe(Effect.orDie)

        expect(result.counts.applied).toBe(5)
        expect(fake.calls.map((action) => action.action)).toEqual([
          "create_issue",
          "edit_issue",
          "add_label",
          "remove_label",
          "add_comment",
        ])
        expect(rows.map((row) => row.status)).toEqual(["applied", "applied", "applied", "applied", "applied"])
        expect(rows.map((row) => row.apply_result?.resultHandle).every(Boolean)).toBe(true)
      }),
    ),
  )

  it.live("holds missing approval dependency unsupported capability and stale snapshot proposals", () =>
    withLightbulb((lightbulb, database) =>
      Effect.gen(function* () {
        const seeded = yield* lightbulb.seedTracerBullet()
        const missingApproval = yield* lightbulb.proposeIssueMutation({
          accountID: seeded.accountID,
          repository: "heyimcarlos/lightbulb",
          action: "add_comment",
          targetIssue: target(52),
          comment: comment("missing-approval"),
          source: source(seeded),
          now,
        })
        const fake = fakeAdapter(() => ({
          status: "applied",
          summary: "Should not apply held proposal.",
        }))
        const first = yield* lightbulb.runIssueMutationApplyPass({
          accountID: seeded.accountID,
          mode: "apply",
          adapter: fake.adapter,
          now: now + 1,
        })

        const dependencyHeld = yield* lightbulb.proposeIssueMutation({
          accountID: seeded.accountID,
          repository: "heyimcarlos/lightbulb",
          action: "add_comment",
          targetIssue: target(53),
          comment: comment("dependency-held"),
          source: source(seeded),
          now: now + 2,
        })
        const unsupported = yield* lightbulb.proposeIssueMutation({
          accountID: seeded.accountID,
          repository: "heyimcarlos/lightbulb",
          action: "add_label",
          targetIssue: target(54, { labels: ["ready-for-human"] }),
          addLabels: ["enhancement"],
          source: source(seeded),
          now: now + 3,
        })
        const stale = yield* lightbulb.proposeIssueMutation({
          accountID: seeded.accountID,
          repository: "heyimcarlos/lightbulb",
          action: "edit_issue",
          targetIssue: target(55, { snapshotUpdatedAt: now }),
          body: "Update a stale issue body.",
          precondition: { expectedSnapshotUpdatedAt: now },
          source: source(seeded),
          now: now + 4,
        })
        const conflict = yield* lightbulb.proposeIssueMutation({
          accountID: seeded.accountID,
          repository: "heyimcarlos/lightbulb",
          action: "edit_issue",
          targetIssue: target(56, { labels: [] }),
          state: "closed",
          source: source(seeded),
          now: now + 5,
        })
        const limited = fakeAdapter(() => ({
          status: "applied",
          summary: "Should not apply held proposal.",
        }), ["add_comment", "edit_issue"])
        const second = yield* lightbulb.runIssueMutationApplyPass({
          accountID: seeded.accountID,
          mode: "apply",
          approval: approved(),
          adapter: limited.adapter,
          issueSnapshots: [
            {
              repository: "heyimcarlos/lightbulb",
              issueNumber: 55,
              snapshotUpdatedAt: now + 1,
              labels: [],
              state: "open",
            },
            {
              repository: "heyimcarlos/lightbulb",
              issueNumber: 56,
              snapshotUpdatedAt: now,
              labels: ["ready-for-agent"],
              state: "open",
            },
          ],
          dependencyHolds: [{ mutationID: dependencyHeld.item.id }],
          now: now + 6,
        })
        const rows = yield* database.db
          .select()
          .from(LightbulbIssueMutationOutboxTable)
          .orderBy(asc(LightbulbIssueMutationOutboxTable.time_created))
          .all()
          .pipe(Effect.orDie)

        expect(first.outcomes).toHaveLength(1)
        expect(first.outcomes[0]?.mutationID).toBe(missingApproval.item.id)
        expect(first.outcomes[0]?.holdReasons).toContain("missing_operator_approval")
        expect(second.outcomes.map((outcome) => outcome.mutationID)).toEqual([
          dependencyHeld.item.id,
          unsupported.item.id,
          stale.item.id,
          conflict.item.id,
        ])
        expect(second.outcomes.map((outcome) => outcome.status)).toEqual(["held", "held", "held", "held"])
        expect(second.outcomes[0]?.holdReasons).toEqual(["dependency_held"])
        expect(second.outcomes[1]?.holdReasons).toEqual(["unsupported_adapter_capability"])
        expect(second.outcomes[2]?.holdReasons).toEqual(["stale_snapshot_precondition"])
        expect(second.outcomes[3]?.holdReasons).toEqual(["conflicting_state_label"])
        expect(fake.calls).toHaveLength(0)
        expect(limited.calls).toHaveLength(0)
        expect(rows.map((row) => row.status)).toEqual(["held", "held", "held", "held", "held"])
      }),
    ),
  )

  it.live("retries failed proposals without repeating successful mutations", () =>
    withLightbulb((lightbulb, database) =>
      Effect.gen(function* () {
        const seeded = yield* lightbulb.seedTracerBullet()
        yield* lightbulb.proposeIssueMutation({
          accountID: seeded.accountID,
          repository: "heyimcarlos/lightbulb",
          action: "add_comment",
          targetIssue: target(60),
          comment: comment("success-once"),
          source: source(seeded),
          now,
        })
        yield* lightbulb.proposeIssueMutation({
          accountID: seeded.accountID,
          repository: "heyimcarlos/lightbulb",
          action: "add_comment",
          targetIssue: target(61),
          comment: comment("fail-once"),
          source: source(seeded),
          now: now + 1,
        })
        const failedMarkers = new Set<string>()
        const fake = fakeAdapter((action) => {
          const marker = action.comment?.marker ?? ""
          if (marker === "fail-once" && !failedMarkers.has(marker)) {
            failedMarkers.add(marker)
            return {
              status: "failed",
              summary: "Temporary adapter failure.",
              errorHandle: "lightbulb:issue-mutation:" + action.mutationID + ":temporary-error",
            }
          }
          return {
            status: "applied",
            summary: "Applied " + marker + ".",
            resultHandle: "github:comment:" + marker,
          }
        })
        const first = yield* lightbulb.runIssueMutationApplyPass({
          accountID: seeded.accountID,
          mode: "apply",
          approval: approved(),
          adapter: fake.adapter,
          now: now + 2,
        })
        const second = yield* lightbulb.runIssueMutationApplyPass({
          accountID: seeded.accountID,
          mode: "apply",
          approval: approved(),
          adapter: fake.adapter,
          retryFailed: true,
          now: now + 3,
        })
        const rows = yield* database.db
          .select()
          .from(LightbulbIssueMutationOutboxTable)
          .orderBy(asc(LightbulbIssueMutationOutboxTable.time_created))
          .all()
          .pipe(Effect.orDie)

        expect(first.counts).toMatchObject({ applied: 1, failed: 1 })
        expect(second.counts).toMatchObject({ pending: 1, applied: 1, failed: 0 })
        expect(fake.calls.map((action) => action.comment?.marker)).toEqual(["success-once", "fail-once", "fail-once"])
        expect(rows.map((row) => row.status)).toEqual(["applied", "applied"])
      }),
    ),
  )
})

function withLightbulb(
  run: (
    lightbulb: Lightbulb.Interface,
    database: Database.Interface,
  ) => Effect.Effect<void, never, never>,
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

function seedReadyActions(lightbulb: Lightbulb.Interface, seeded: Lightbulb.SeededGraph) {
  return Effect.all([
    lightbulb.proposeIssueMutation({
      accountID: seeded.accountID,
      repository: "heyimcarlos/lightbulb",
      action: "create_issue",
      title: "Slice 52: create from dry run",
      body: "Create from a dry-run action.",
      labels: ["enhancement", "ready-for-agent"],
      source: source(seeded),
      now,
    }),
    lightbulb.proposeIssueMutation({
      accountID: seeded.accountID,
      repository: "heyimcarlos/lightbulb",
      action: "edit_issue",
      targetIssue: target(52, { snapshotUpdatedAt: now, labels: ["ready-for-agent"] }),
      body: "Edit compact body.",
      precondition: { expectedSnapshotUpdatedAt: now },
      source: source(seeded),
      now: now + 1,
    }),
    lightbulb.proposeIssueMutation({
      accountID: seeded.accountID,
      repository: "heyimcarlos/lightbulb",
      action: "add_label",
      targetIssue: target(52, { labels: ["ready-for-human"] }),
      addLabels: ["enhancement"],
      source: source(seeded),
      now: now + 2,
    }),
    lightbulb.proposeIssueMutation({
      accountID: seeded.accountID,
      repository: "heyimcarlos/lightbulb",
      action: "remove_label",
      targetIssue: target(52, { labels: ["enhancement", "ready-for-human"] }),
      removeLabels: ["enhancement"],
      source: source(seeded),
      now: now + 3,
    }),
    lightbulb.proposeIssueMutation({
      accountID: seeded.accountID,
      repository: "heyimcarlos/lightbulb",
      action: "add_comment",
      targetIssue: target(52),
      comment: comment("dry-run-comment"),
      source: source(seeded),
      now: now + 4,
    }),
  ])
}

function fakeAdapter(
  result: (action: IssueMutationApplyAction) => IssueMutationApplyAdapterResult,
  capabilities: readonly Lightbulb.IssueMutationAction[] = ["create_issue", "edit_issue", "add_label", "remove_label", "add_comment"],
) {
  const calls: IssueMutationApplyAction[] = []
  return {
    calls,
    adapter: {
      capabilities,
      apply: (action) =>
        Effect.sync(() => {
          calls.push(action)
          return result(action)
        }),
    } satisfies IssueMutationApplyAdapter,
  }
}

function approved() {
  return {
    approved: true,
    approvedBy: "operator",
    approvalHandle: "lightbulb:approval:issue-apply",
  }
}

function source(seeded: Lightbulb.SeededGraph): Lightbulb.IssueMutationSource {
  return {
    goalID: seeded.goalID,
    loopID: seeded.loopID,
    runID: seeded.runID,
    artifactIDs: [seeded.artifactID],
    artifactHandles: [".lightbulb/runs/schema-tracer-bullet.md"],
    plannerArtifactHandle: "artifact:planner-report",
  }
}

function target(
  number: number,
  options?: {
    readonly snapshotUpdatedAt?: number
    readonly labels?: readonly string[]
  },
): Lightbulb.IssueMutationTargetIssue {
  return {
    number,
    url: "https://github.com/heyimcarlos/lightbulb/issues/" + number,
    snapshotUpdatedAt: options?.snapshotUpdatedAt,
    labels: options?.labels,
    state: "open",
  }
}

function comment(marker: string): Lightbulb.IssueMutationCommentProposal {
  return {
    marker,
    summary: "Apply " + marker + ".",
    body: "Apply compact comment " + marker + ".",
  }
}

function issueMutationEvents(database: Database.Interface) {
  return database.db
    .select()
    .from(LightbulbEventTable)
    .where(eq(LightbulbEventTable.aggregate_type, "issue_mutation_outbox"))
    .all()
    .pipe(Effect.orDie)
}
