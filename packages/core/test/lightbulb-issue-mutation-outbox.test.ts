import path from "path"
import { describe, expect } from "bun:test"
import { eq } from "drizzle-orm"
import { Effect, Layer } from "effect"
import { Database } from "@opencode-ai/core/database/database"
import { Lightbulb } from "@opencode-ai/core/lightbulb"
import {
  LightbulbEventTable,
  LightbulbIssueMutationOutboxTable,
} from "@opencode-ai/core/lightbulb/sql"
import { tmpdir } from "./fixture/tmpdir"
import { it } from "./lib/effect"

const now = Date.UTC(2026, 5, 24, 12)

function layer(directory: string) {
  const database = Database.layerFromPath(path.join(directory, "lightbulb-issue-mutation-outbox.db")).pipe(Layer.fresh)
  return Layer.mergeAll(database, Lightbulb.layer.pipe(Layer.provide(database)))
}

describe("Lightbulb issue mutation outbox", () => {
  it.live("stores a create issue proposal as a renderable parent mutation", () =>
    withLightbulb((lightbulb) =>
      Effect.gen(function* () {
        const seeded = yield* lightbulb.seedTracerBullet()
        const result = yield* lightbulb.proposeIssueMutation({
          accountID: seeded.accountID,
          repository: "heyimcarlos/lightbulb",
          action: "create_issue",
          title: "Slice 27: compact issue proposal rendering",
          body: "Create a compact issue from a planner artifact.",
          labels: ["ready-for-agent", "enhancement"],
          source: source(seeded),
          applySummary: "Create follow-up issue from planner artifact.",
          now,
        })
        const outbox = yield* lightbulb.readIssueMutationOutbox({ accountID: seeded.accountID, status: "ready" })

        expect(result.created).toBe(true)
        expect(result.eventID).toBeTruthy()
        expect(result.item.status).toBe("ready")
        expect(result.item.idempotencyKey).toStartWith("issue-mutation:")
        expect(result.item.source).toEqual(source(seeded))
        expect(result.item.targetIssue).toBeNull()
        expect(result.item.renderedMutation).toMatchObject({
          action: "create_issue",
          repository: "heyimcarlos/lightbulb",
          title: "Slice 27: compact issue proposal rendering",
          body: "Create a compact issue from a planner artifact.",
          labels: ["enhancement", "ready-for-agent"],
        })
        expect(outbox.map((item) => item.id)).toEqual([result.item.id])
      }),
    ),
  )

  it.live("stores an issue body edit with target issue and snapshot precondition handles", () =>
    withLightbulb((lightbulb) =>
      Effect.gen(function* () {
        const seeded = yield* lightbulb.seedTracerBullet()
        const result = yield* lightbulb.proposeIssueMutation({
          accountID: seeded.accountID,
          repository: "heyimcarlos/lightbulb",
          action: "edit_issue",
          targetIssue: target(38, { snapshotUpdatedAt: now, labels: ["ready-for-agent"] }),
          body: "Updated bounded body section.",
          precondition: { expectedSnapshotUpdatedAt: now },
          source: source(seeded),
          now,
        })

        expect(result.item.status).toBe("ready")
        expect(result.item.targetIssue).toMatchObject({
          issueNumber: 38,
          issueRef: "#38",
          issueHandle: "github:issue:38",
          issueURL: "https://github.com/heyimcarlos/lightbulb/issues/38",
          snapshotUpdatedAt: now,
        })
        expect(result.item.renderedMutation).toMatchObject({
          action: "edit_issue",
          body: "Updated bounded body section.",
          precondition: { expectedSnapshotUpdatedAt: now },
        })
      }),
    ),
  )

  it.live("stores safe label add and remove proposals", () =>
    withLightbulb((lightbulb) =>
      Effect.gen(function* () {
        const seeded = yield* lightbulb.seedTracerBullet()
        const add = yield* lightbulb.proposeIssueMutation({
          accountID: seeded.accountID,
          repository: "heyimcarlos/lightbulb",
          action: "add_label",
          targetIssue: target(29, { labels: ["ready-for-agent"] }),
          addLabels: ["enhancement"],
          source: source(seeded),
          now,
        })
        const remove = yield* lightbulb.proposeIssueMutation({
          accountID: seeded.accountID,
          repository: "heyimcarlos/lightbulb",
          action: "remove_label",
          targetIssue: target(29, { labels: ["blocked-by-dependency", "ready-for-agent"] }),
          removeLabels: ["blocked-by-dependency"],
          source: source(seeded),
          now: now + 1,
        })

        expect(add.item.status).toBe("ready")
        expect(add.item.desiredLabels).toEqual(["enhancement"])
        expect(add.item.renderedMutation?.addLabels).toEqual(["enhancement"])
        expect(remove.item.status).toBe("ready")
        expect(remove.item.desiredLabels).toEqual(["blocked-by-dependency"])
        expect(remove.item.renderedMutation?.removeLabels).toEqual(["blocked-by-dependency"])
      }),
    ),
  )

  it.live("stores a comment proposal without issue history", () =>
    withLightbulb((lightbulb) =>
      Effect.gen(function* () {
        const seeded = yield* lightbulb.seedTracerBullet()
        const result = yield* lightbulb.proposeIssueMutation({
          accountID: seeded.accountID,
          repository: "heyimcarlos/lightbulb",
          action: "add_comment",
          targetIssue: target(38),
          comment: {
            marker: "lightbulb:issue-outbox:38",
            bodyHandle: "artifact:planner-comment-body",
            summary: "Attach compact planner outcome.",
            body: "Lightbulb proposes this compact mutation from artifact:planner-report.",
          },
          source: source(seeded),
          now,
        })

        expect(result.item.status).toBe("ready")
        expect(result.item.renderedMutation?.comment).toEqual({
          marker: "lightbulb:issue-outbox:38",
          bodyHandle: "artifact:planner-comment-body",
          summary: "Attach compact planner outcome.",
          body: "Lightbulb proposes this compact mutation from artifact:planner-report.",
        })
      }),
    ),
  )

  it.live("reuses the existing outbox row and event on idempotent retry", () =>
    withLightbulb((lightbulb, database) =>
      Effect.gen(function* () {
        const seeded = yield* lightbulb.seedTracerBullet()
        const input = {
          accountID: seeded.accountID,
          repository: "heyimcarlos/lightbulb",
          action: "add_comment",
          targetIssue: target(38),
          comment: {
            marker: "lightbulb:idempotent:38",
            summary: "Retry-safe comment.",
            body: "Retry-safe body.",
          },
          source: source(seeded),
          now,
        } satisfies Lightbulb.IssueMutationProposalInput
        const first = yield* lightbulb.proposeIssueMutation(input)
        const second = yield* lightbulb.proposeIssueMutation(input)
        const rows = yield* database.db.select().from(LightbulbIssueMutationOutboxTable).all().pipe(Effect.orDie)
        const events = yield* issueMutationEvents(database)

        expect(first.created).toBe(true)
        expect(second.created).toBe(false)
        expect(second.eventID).toBeNull()
        expect(second.item.id).toBe(first.item.id)
        expect(rows).toHaveLength(1)
        expect(events).toHaveLength(1)
      }),
    ),
  )

  it.live("keeps idempotency stable across source and snapshot refreshes", () =>
    withLightbulb((lightbulb, database) =>
      Effect.gen(function* () {
        const seeded = yield* lightbulb.seedTracerBullet()
        const first = yield* lightbulb.proposeIssueMutation({
          accountID: seeded.accountID,
          repository: "heyimcarlos/lightbulb",
          action: "add_comment",
          targetIssue: target(38, { snapshotUpdatedAt: now, labels: ["ready-for-agent"] }),
          comment: {
            marker: "lightbulb:stable-idempotency:38",
            summary: "Retry-safe comment.",
            body: "Retry-safe body.",
          },
          source: source(seeded),
          precondition: { expectedSnapshotUpdatedAt: now },
          now,
        })
        const second = yield* lightbulb.proposeIssueMutation({
          accountID: seeded.accountID,
          repository: "heyimcarlos/lightbulb",
          action: "add_comment",
          targetIssue: target(38, { snapshotUpdatedAt: now + 1_000, labels: ["ready-for-agent", "enhancement"] }),
          comment: {
            marker: "lightbulb:stable-idempotency:38",
            summary: "Retry-safe comment.",
            body: "Retry-safe body.",
          },
          source: {
            ...source(seeded),
            runID: Lightbulb.RunID.create(),
            artifactHandles: ["artifact:later-planner-report"],
          },
          precondition: { expectedSnapshotUpdatedAt: now + 1_000 },
          now: now + 1,
        })
        const rows = yield* database.db.select().from(LightbulbIssueMutationOutboxTable).all().pipe(Effect.orDie)

        expect(second.created).toBe(false)
        expect(second.item.id).toBe(first.item.id)
        expect(rows).toHaveLength(1)
      }),
    ),
  )

  it.live("holds missing create fields and conflicting state-label proposals with bounded reasons", () =>
    withLightbulb((lightbulb) =>
      Effect.gen(function* () {
        const seeded = yield* lightbulb.seedTracerBullet()
        const result = yield* lightbulb.proposeIssueMutation({
          accountID: seeded.accountID,
          repository: "heyimcarlos/lightbulb",
          action: "create_issue",
          title: " ",
          labels: ["ready-for-agent"],
          state: "closed",
          source: source(seeded),
          now,
        })

        expect(result.item.status).toBe("held")
        expect(result.item.renderedMutation).toBeNull()
        expect(result.item.holdReasons).toEqual([
          "missing_create_title",
          "missing_create_body",
          "conflicting_state_label",
        ])

        const existingConflict = yield* lightbulb.proposeIssueMutation({
          accountID: seeded.accountID,
          repository: "heyimcarlos/lightbulb",
          action: "add_label",
          targetIssue: target(29, { labels: ["blocked-by-dependency"] }),
          addLabels: ["ready-for-agent"],
          source: source(seeded),
          now: now + 1,
        })

        expect(existingConflict.item.status).toBe("held")
        expect(existingConflict.item.holdReasons).toEqual(["conflicting_state_label"])

        const stateConflict = yield* lightbulb.proposeIssueMutation({
          accountID: seeded.accountID,
          repository: "heyimcarlos/lightbulb",
          action: "edit_issue",
          targetIssue: target(38, { labels: ["ready-for-agent"] }),
          state: "closed",
          source: source(seeded),
          now: now + 2,
        })

        expect(stateConflict.item.status).toBe("held")
        expect(stateConflict.item.holdReasons).toEqual(["conflicting_state_label"])
      }),
    ),
  )

  it.live("holds unsafe label removal and stale snapshot proposals", () =>
    withLightbulb((lightbulb) =>
      Effect.gen(function* () {
        const seeded = yield* lightbulb.seedTracerBullet()
        const unsafe = yield* lightbulb.proposeIssueMutation({
          accountID: seeded.accountID,
          repository: "heyimcarlos/lightbulb",
          action: "remove_label",
          targetIssue: target(73, { labels: ["needs-info"] }),
          removeLabels: ["needs-info"],
          source: source(seeded),
          now,
        })
        const stale = yield* lightbulb.proposeIssueMutation({
          accountID: seeded.accountID,
          repository: "heyimcarlos/lightbulb",
          action: "edit_issue",
          targetIssue: target(38, { snapshotUpdatedAt: now + 1_000 }),
          body: "Stale edit should not be apply-ready.",
          precondition: { expectedSnapshotUpdatedAt: now },
          source: source(seeded),
          now: now + 1,
        })

        expect(unsafe.item.status).toBe("held")
        expect(unsafe.item.holdReasons).toEqual(["unsafe_label_removal"])
        expect(stale.item.status).toBe("held")
        expect(stale.item.holdReasons).toEqual(["stale_snapshot_precondition"])
      }),
    ),
  )

  it.live("records fake apply results for applied, skipped, failed, and superseded proposals", () =>
    withLightbulb((lightbulb, database) =>
      Effect.gen(function* () {
        const seeded = yield* lightbulb.seedTracerBullet()
        const proposals = yield* Effect.all(
          (["applied", "skipped", "failed", "superseded"] satisfies Lightbulb.IssueMutationApplyStatus[]).map(
            (status, index) =>
              lightbulb.proposeIssueMutation({
                accountID: seeded.accountID,
                repository: "heyimcarlos/lightbulb",
                action: "add_comment",
                targetIssue: target(38),
                comment: {
                  marker: "lightbulb:apply-result:" + status,
                  summary: "Record " + status + " result.",
                  body: "Record " + status + " result.",
                },
                source: source(seeded),
                now: now + index,
              }),
          ),
        )
        const results = yield* Effect.all(
          proposals.map((proposal, index) =>
            lightbulb.recordIssueMutationApplyResult({
              mutationID: proposal.item.id,
              status: (["applied", "skipped", "failed", "superseded"] satisfies Lightbulb.IssueMutationApplyStatus[])[index],
              summary: "Fake apply adapter recorded " + proposal.item.applySummary,
              issueURL: index === 0 ? "https://github.com/heyimcarlos/lightbulb/issues/127" : undefined,
              resultHandle: index === 0 ? "github:issue:127" : "lightbulb:issue-mutation:" + proposal.item.id,
              errorHandle: index === 2 ? "artifact:error-handle" : undefined,
              appliedAt: now + 10 + index,
            }),
          ),
        )
        const events = yield* issueMutationEvents(database)

        expect(results.map((result) => result.item.status)).toEqual(["applied", "skipped", "failed", "superseded"])
        expect(results[0]?.item.applyResult).toMatchObject({
          status: "applied",
          issueURL: "https://github.com/heyimcarlos/lightbulb/issues/127",
          resultHandle: "github:issue:127",
        })
        expect(results[2]?.item.applyResult).toMatchObject({
          status: "failed",
          errorHandle: "artifact:error-handle",
        })
        expect(results[0]?.item.source).toEqual(source(seeded))
        expect(events.filter((event) => event.type === "lightbulb.issue_mutation.apply_recorded")).toHaveLength(4)
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

function issueMutationEvents(database: Database.Interface) {
  return database.db
    .select()
    .from(LightbulbEventTable)
    .where(eq(LightbulbEventTable.aggregate_type, "issue_mutation_outbox"))
    .all()
    .pipe(Effect.orDie)
}
