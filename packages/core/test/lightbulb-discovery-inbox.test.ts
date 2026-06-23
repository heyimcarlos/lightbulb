import path from "path"
import { describe, expect } from "bun:test"
import { asc, eq } from "drizzle-orm"
import { Effect, Layer } from "effect"
import { Database } from "@opencode-ai/core/database/database"
import { Lightbulb } from "@opencode-ai/core/lightbulb"
import {
  LightbulbAccountTable,
  LightbulbDiscoveryCandidateTable,
  LightbulbEventTable,
  LightbulbGoalTable,
  LightbulbRunTable,
  LightbulbWorkerTable,
} from "@opencode-ai/core/lightbulb/sql"
import { tmpdir } from "./fixture/tmpdir"
import { it } from "./lib/effect"

function layer(directory: string) {
  const database = Database.layerFromPath(path.join(directory, "lightbulb-discovery-inbox.db")).pipe(Layer.fresh)
  return Layer.mergeAll(database, Lightbulb.layer.pipe(Layer.provide(database)))
}

describe("Lightbulb discovery candidate inbox", () => {
  it.live("projects issue intake into a durable grouped candidate inbox", () =>
    Effect.acquireRelease(
      Effect.promise(() => tmpdir()),
      (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
    ).pipe(
      Effect.flatMap((tmp) =>
        Effect.gen(function* () {
          const lightbulb = yield* Lightbulb.Service
          const database = yield* Database.Service
          const accountID = Lightbulb.AccountID.create()
          yield* seedAccount(database, accountID)

          const result = yield* lightbulb.projectDiscoveryInbox({
            accountID,
            projectedAt: 1_000,
            source: { provider: "fixture", mode: "read-only" },
            issues: [
              snapshot(accountID, 12, "GitHub issue queue intake", ["ready-for-agent"], {
                body: "raw issue body must not be persisted",
                bodyHandle: "github:issue:12:body",
                bodySummary: "Add issue intake.",
              }),
              snapshot(accountID, 73, "Loop profile registry", ["ready-for-human"]),
              snapshot(accountID, 74, "Structured pickup packets", ["ready-for-agent"], {
                possibleDuplicateRefs: ["#12"],
              }),
              snapshot(accountID, 29, "Dependency unblock reconciliation", ["ready-for-agent"], {
                dependencyRefs: ["#28"],
              }),
              snapshot(accountID, 26, "Account loop runner tick", ["ready-for-agent", "agent-running"]),
              snapshot(accountID, 8, "Old completed slice", ["ready-for-agent"], { state: "closed" }),
              snapshot(accountID, 6, "Draft supervisor", ["needs-triage"]),
              snapshot(accountID, 5, "Unlabelled idea", []),
            ],
          })
          const dashboard = yield* lightbulb.readDashboard(accountID)
          const rows = yield* database.db
            .select()
            .from(LightbulbDiscoveryCandidateTable)
            .where(eq(LightbulbDiscoveryCandidateTable.account_id, accountID))
            .orderBy(asc(LightbulbDiscoveryCandidateTable.source_id))
            .all()
            .pipe(Effect.orDie)
          const events = yield* database.db
            .select()
            .from(LightbulbEventTable)
            .where(eq(LightbulbEventTable.type, "lightbulb.discovery_inbox.projected"))
            .all()
            .pipe(Effect.orDie)

          expect(result.inbox.topActionable.map((candidate) => candidate.sourceHandles.issueRef)).toEqual(["#12"])
          expect(result.inbox.needsHuman.map((candidate) => candidate.sourceHandles.issueRef)).toEqual(["#6", "#73"])
          expect(result.inbox.possibleDuplicates.map((candidate) => [candidate.sourceHandles.issueRef, candidate.duplicateRefs])).toEqual([
            ["#74", ["#12"]],
          ])
          expect(result.inbox.proposedActions.map((action) => [action.sourceID, action.action])).toContainEqual([
            "github:issue:12",
            "create_pickup_packet",
          ])
          expect(result.inbox.watch.map((candidate) => candidate.sourceHandles.issueRef)).toEqual(["#29", "#26"])
          expect(result.inbox.noise.map((candidate) => candidate.sourceHandles.issueRef)).toEqual(["#5"])
          expect(result.inbox.recentResolved.map((candidate) => candidate.sourceHandles.issueRef)).toEqual(["#8"])
          expect(dashboard?.inbox.discoveryCandidates.topActionable.map((candidate) => candidate.sourceID)).toEqual([
            "github:issue:12",
          ])
          expect(JSON.stringify(rows)).not.toContain("raw issue body")
          expect(events).toHaveLength(1)
          expect(events[0]?.data).toMatchObject({
            candidate_count: 8,
            top_actionable_count: 1,
            needs_human_count: 2,
            possible_duplicate_count: 1,
            watch_count: 2,
            noise_count: 1,
            recent_resolved_count: 1,
            source: { provider: "fixture", mode: "read-only" },
          })
          expect(yield* database.db.select().from(LightbulbGoalTable).all().pipe(Effect.orDie)).toEqual([])
          expect(yield* database.db.select().from(LightbulbRunTable).all().pipe(Effect.orDie)).toEqual([])
          expect(yield* database.db.select().from(LightbulbWorkerTable).all().pipe(Effect.orDie)).toEqual([])
        }).pipe(Effect.provide(layer(tmp.path))),
      ),
    ),
  )

  it.live("adopts candidates by source identity and marks missing items as noise", () =>
    Effect.acquireRelease(
      Effect.promise(() => tmpdir()),
      (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
    ).pipe(
      Effect.flatMap((tmp) =>
        Effect.gen(function* () {
          const lightbulb = yield* Lightbulb.Service
          const database = yield* Database.Service
          const accountID = Lightbulb.AccountID.create()
          yield* seedAccount(database, accountID)

          const first = yield* lightbulb.projectDiscoveryInbox({
            accountID,
            projectedAt: 1_000,
            issues: [
              snapshot(accountID, 12, "GitHub issue queue intake", ["ready-for-agent"]),
              snapshot(accountID, 74, "Structured pickup packets", ["ready-for-agent"]),
            ],
          })
          const second = yield* lightbulb.projectDiscoveryInbox({
            accountID,
            projectedAt: 2_000,
            issues: [snapshot(accountID, 12, "GitHub issue queue intake v2", ["ready-for-agent"])],
          })
          const rows = yield* database.db
            .select()
            .from(LightbulbDiscoveryCandidateTable)
            .where(eq(LightbulbDiscoveryCandidateTable.account_id, accountID))
            .orderBy(asc(LightbulbDiscoveryCandidateTable.source_id))
            .all()
            .pipe(Effect.orDie)

          expect(second.candidates[0]?.id).toBe(first.candidates[0]?.id)
          expect(rows.map((row) => [row.source_id, row.title, row.status, row.section, row.time_created, row.time_updated])).toEqual([
            ["github:issue:12", "GitHub issue queue intake v2", "open", "top_actionable", 1_000, 2_000],
            ["github:issue:74", "Structured pickup packets", "ignored", "noise", 1_000, 2_000],
          ])
          expect(second.staleCandidates.map((candidate) => [candidate.sourceID, candidate.status, candidate.section])).toEqual([
            ["github:issue:74", "ignored", "noise"],
          ])
        }).pipe(Effect.provide(layer(tmp.path))),
      ),
    ),
  )
})

function snapshot(
  accountID: Lightbulb.AccountID,
  number: number,
  title: string,
  labels: readonly string[],
  options?: {
    readonly state?: "open" | "closed"
    readonly body?: string
    readonly bodyHandle?: string
    readonly bodySummary?: string
    readonly dependencyRefs?: readonly string[]
    readonly possibleDuplicateRefs?: readonly string[]
  },
) {
  return {
    accountID,
    number,
    title,
    url: "https://github.com/heyimcarlos/lightbulb/issues/" + number,
    labels,
    updatedAt: Date.UTC(2026, 0, number),
    state: options?.state,
    body: options?.body,
    bodyHandle: options?.bodyHandle,
    bodySummary: options?.bodySummary,
    dependencyRefs: options?.dependencyRefs,
    possibleDuplicateRefs: options?.possibleDuplicateRefs,
  } satisfies Lightbulb.IssueQueueSnapshot
}

function seedAccount(database: Database.Interface, accountID: Lightbulb.AccountID) {
  return database.db
    .insert(LightbulbAccountTable)
    .values({
      id: accountID,
      name: "Lightbulb Test",
      status: "active",
      time_created: 1,
      time_updated: 1,
    })
    .run()
    .pipe(Effect.orDie)
}
