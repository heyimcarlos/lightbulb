import path from "path"
import { describe, expect } from "bun:test"
import { asc, eq } from "drizzle-orm"
import { Effect, Layer } from "effect"
import { Database } from "@opencode-ai/core/database/database"
import { Lightbulb } from "@opencode-ai/core/lightbulb"
import { LightbulbEventTable } from "@opencode-ai/core/lightbulb/sql"
import { tmpdir } from "./fixture/tmpdir"
import { it } from "./lib/effect"

const now = Date.UTC(2026, 5, 23, 13)

function layer(directory: string) {
  const database = Database.layerFromPath(path.join(directory, "lightbulb-review-gate.db")).pipe(Layer.fresh)
  return Layer.mergeAll(database, Lightbulb.layer.pipe(Layer.provide(database)))
}

describe("Lightbulb review gates", () => {
  it.live("opens review gates for artifact, run, and worker targets in the human inbox", () =>
    Effect.acquireRelease(
      Effect.promise(() => tmpdir()),
      (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
    ).pipe(
      Effect.flatMap((tmp) =>
        Effect.gen(function* () {
          const lightbulb = yield* Lightbulb.Service
          const seeded = yield* lightbulb.seedTracerBullet()
          const artifactGate = yield* lightbulb.openReviewGate({
            accountID: seeded.accountID,
            target: { kind: "artifact", artifactID: seeded.artifactID },
            owner: "parent-orchestrator",
            reviewer: "maintainer",
            reason: "Worker report needs parent review before integration.",
            now,
          })
          const runGate = yield* lightbulb.openReviewGate({
            target: { kind: "run", runID: seeded.runID },
            owner: "review-loop",
            reason: "Run result needs integration review.",
            now: now + 1,
          })
          const workerGate = yield* lightbulb.openReviewGate({
            target: { kind: "worker", workerID: seeded.workerID },
            owner: "worker-supervisor",
            reason: "Worker output needs maker/checker review.",
            now: now + 2,
          })
          const summary = yield* lightbulb.parentSummary(seeded.runID)
          const dashboard = yield* lightbulb.readDashboard(seeded.accountID)

          expect(artifactGate).toMatchObject({
            gateStatus: "pending",
            reviewStatus: "opened",
            targetKind: "artifact",
            targetArtifactID: seeded.artifactID,
            targetRunID: seeded.runID,
            targetWorkerID: seeded.workerID,
            owner: "parent-orchestrator",
            reviewer: "maintainer",
            decisionTimestamp: null,
          })
          expect(runGate).toMatchObject({
            reviewStatus: "opened",
            targetKind: "run",
            targetRunID: seeded.runID,
            targetWorkerID: null,
            targetArtifactID: null,
          })
          expect(workerGate).toMatchObject({
            reviewStatus: "opened",
            targetKind: "worker",
            targetRunID: seeded.runID,
            targetWorkerID: seeded.workerID,
            targetArtifactID: null,
          })
          expect(summary?.gates).toContainEqual(
            expect.objectContaining({
              id: artifactGate.id,
              reviewGate: expect.objectContaining({
                status: "opened",
                targetKind: "artifact",
                reviewer: "maintainer",
              }),
            }),
          )
          expect(dashboard?.inbox.gates).toContainEqual(
            expect.objectContaining({
              id: artifactGate.id,
              reviewGate: expect.objectContaining({
                status: "opened",
                targetKind: "artifact",
              }),
            }),
          )
        }).pipe(Effect.provide(layer(tmp.path))),
      ),
    ),
  )

  it.live("transitions review gates through approval, rejection, and needs-rework without model execution", () =>
    Effect.acquireRelease(
      Effect.promise(() => tmpdir()),
      (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
    ).pipe(
      Effect.flatMap((tmp) =>
        Effect.gen(function* () {
          const lightbulb = yield* Lightbulb.Service
          const database = yield* Database.Service
          const seeded = yield* lightbulb.seedTracerBullet()
          const approvedGate = yield* lightbulb.openReviewGate({
            target: { kind: "artifact", artifactID: seeded.artifactID },
            reason: "Approve the report artifact.",
            now,
          })
          const rejectedGate = yield* lightbulb.openReviewGate({
            target: { kind: "run", runID: seeded.runID },
            reason: "Reject the run result.",
            now: now + 1,
          })
          const needsReworkGate = yield* lightbulb.openReviewGate({
            target: { kind: "worker", workerID: seeded.workerID },
            reason: "Request worker rework.",
            now: now + 2,
          })

          const approved = yield* lightbulb.transitionReviewGate({
            gateID: approvedGate.id,
            status: "approved",
            reviewer: "maintainer",
            reason: "Verification evidence is sufficient.",
            now: now + 10,
          })
          const rejected = yield* lightbulb.transitionReviewGate({
            gateID: rejectedGate.id,
            status: "rejected",
            reviewer: "maintainer",
            reason: "Scope does not match the route stop.",
            now: now + 11,
          })
          const needsRework = yield* lightbulb.transitionReviewGate({
            gateID: needsReworkGate.id,
            status: "needs-rework",
            reviewer: "maintainer",
            reason: "Add missing verification artifact handles.",
            now: now + 12,
          })
          const graph = yield* lightbulb.readAccountGraph(seeded.accountID)
          const events = yield* database.db
            .select()
            .from(LightbulbEventTable)
            .where(eq(LightbulbEventTable.aggregate_type, "gate"))
            .orderBy(asc(LightbulbEventTable.time_created))
            .all()
            .pipe(Effect.orDie)

          expect(approved).toMatchObject({
            gateStatus: "passed",
            reviewStatus: "approved",
            reviewer: "maintainer",
            reason: "Verification evidence is sufficient.",
            decisionTimestamp: now + 10,
          })
          expect(rejected).toMatchObject({
            gateStatus: "failed",
            reviewStatus: "rejected",
            decisionTimestamp: now + 11,
          })
          expect(needsRework).toMatchObject({
            gateStatus: "blocked",
            reviewStatus: "needs-rework",
            decisionTimestamp: now + 12,
          })
          expect(graph?.runs.map((run) => [run.id, run.review_status, run.gate_status])).toContainEqual([
            seeded.runID,
            "changes_requested",
            "blocked",
          ])
          expect(events.map((event) => event.type)).toEqual([
            "lightbulb.review_gate.opened",
            "lightbulb.review_gate.opened",
            "lightbulb.review_gate.opened",
            "lightbulb.review_gate.approved",
            "lightbulb.review_gate.rejected",
            "lightbulb.review_gate.needs-rework",
          ])
        }).pipe(Effect.provide(layer(tmp.path))),
      ),
    ),
  )

  it.live("keeps AFK-ready issues separate from human-held review work", () =>
    Effect.acquireRelease(
      Effect.promise(() => tmpdir()),
      (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
    ).pipe(
      Effect.flatMap((tmp) =>
        Effect.gen(function* () {
          const lightbulb = yield* Lightbulb.Service
          const seeded = yield* lightbulb.seedTracerBullet()
          const intake = yield* lightbulb.ingestIssueQueueSnapshots({
            snapshots: [
              {
                accountID: seeded.accountID,
                number: 74,
                title: "Ready pickup packet",
                url: "https://github.com/heyimcarlos/lightbulb/issues/74",
                labels: ["ready-for-agent"],
                updatedAt: now,
              },
              {
                accountID: seeded.accountID,
                number: 10,
                title: "Review gate decision",
                url: "https://github.com/heyimcarlos/lightbulb/issues/10",
                labels: ["ready-for-human"],
                updatedAt: now,
              },
            ],
          })

          expect(intake.classifications.map((classification) => [classification.issueRef, classification.status])).toEqual([
            ["#74", "ready"],
            ["#10", "human_held"],
          ])
          expect(intake.taskPacketRequests.map((request) => request.issueRef)).toEqual(["#74"])
          expect(intake.skipped.map((skipped) => [skipped.issueRef, skipped.reason, skipped.blockerRefs])).toEqual([
            ["#10", "human_held", ["label:ready-for-human"]],
          ])
        }).pipe(Effect.provide(layer(tmp.path))),
      ),
    ),
  )
})
