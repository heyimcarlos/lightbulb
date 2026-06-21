import path from "path"
import { describe, expect } from "bun:test"
import { Effect, Layer } from "effect"
import { Lightbulb } from "@opencode-ai/core/lightbulb"
import { Database } from "@opencode-ai/core/database/database"
import { tmpdir } from "./fixture/tmpdir"
import { it } from "./lib/effect"

function layer(directory: string) {
  const database = Database.layerFromPath(path.join(directory, "lightbulb.db")).pipe(Layer.fresh)
  return Layer.mergeAll(database, Lightbulb.layer.pipe(Layer.provide(database)))
}

describe("Lightbulb decision artifact routing", () => {
  it.live("routes an accepted ADR decision artifact as ready AFK work", () =>
    Effect.acquireRelease(
      Effect.promise(() => tmpdir()),
      (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
    ).pipe(
      Effect.flatMap((tmp) =>
        Effect.gen(function* () {
          const lightbulb = yield* Lightbulb.Service
          const seeded = yield* lightbulb.seedTracerBullet()
          yield* Effect.promise(() => Bun.write(path.join(tmp.path, "0005-decision-routing.md"), "accepted ADR body"))

          const draft = yield* lightbulb.registerDecisionArtifact({
            accountID: seeded.accountID,
            type: "adr",
            title: "Route decisions through artifact gates",
            uri: "0005-decision-routing.md",
            summary: "ADR for routing decisions through artifact-backed gates.",
            retentionPolicy: { mode: "keep" },
            baseDirectory: tmp.path,
            source: {
              issueRef: "#24",
              goalID: seeded.goalID,
              runID: seeded.runID,
              gateID: seeded.gateID,
            },
            decision: {
              status: "draft",
              owner: "architecture",
              reviewer: "maintainer",
            },
          })
          const pending = yield* lightbulb.transitionDecisionArtifact({
            artifactID: draft.id,
            decision: {
              status: "pending",
            },
          })
          const rework = yield* lightbulb.transitionDecisionArtifact({
            artifactID: draft.id,
            decision: {
              status: "needs-rework",
              reviewer: "review-board",
            },
          })
          const accepted = yield* lightbulb.transitionDecisionArtifact({
            artifactID: draft.id,
            decision: {
              status: "accepted",
            },
          })
          const classification = yield* lightbulb.classifyIssueRouting({
            accountID: seeded.accountID,
            issueRef: "#24",
            title: "Slice 17",
            labels: ["ready-for-agent"],
            gateID: seeded.gateID,
          })
          const summary = yield* lightbulb.parentSummary(seeded.runID)

          expect(pending.decision.status).toBe("pending")
          expect(rework.decision).toMatchObject({
            status: "needs-rework",
            reviewer: "review-board",
          })
          expect(accepted).toMatchObject({
            id: draft.id,
            type: "adr",
            source: {
              issueRef: "#24",
              gateID: seeded.gateID,
            },
            decision: {
              title: "Route decisions through artifact gates",
              status: "accepted",
              owner: "architecture",
              reviewer: "review-board",
            },
          })
          expect(classification.status).toBe("ready_for_afk")
          expect(classification.decisionHolds).toEqual([])
          expect(classification.decisionArtifacts.map((artifact) => [artifact.id, artifact.decision.status])).toEqual([
            [draft.id, "accepted"],
          ])
          expect(summary?.decisionArtifacts.map((artifact) => [artifact.id, artifact.decision.status])).toEqual([
            [draft.id, "accepted"],
          ])
          expect(JSON.stringify(summary)).not.toContain("accepted ADR body")
        }).pipe(Effect.provide(layer(tmp.path))),
      ),
    ),
  )

  it.live("rejects blank reviewer transitions", () =>
    Effect.acquireRelease(
      Effect.promise(() => tmpdir()),
      (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
    ).pipe(
      Effect.flatMap((tmp) =>
        Effect.gen(function* () {
          const lightbulb = yield* Lightbulb.Service
          const seeded = yield* lightbulb.seedTracerBullet()
          yield* Effect.promise(() => Bun.write(path.join(tmp.path, "blank-reviewer.md"), "decision body"))

          const decision = yield* lightbulb.registerDecisionArtifact({
            accountID: seeded.accountID,
            type: "adr",
            uri: "blank-reviewer.md",
            summary: "Decision with reviewer metadata.",
            retentionPolicy: { mode: "keep" },
            baseDirectory: tmp.path,
            source: {
              issueRef: "#24",
            },
            decision: {
              status: "pending",
              owner: "architecture",
              reviewer: "maintainer",
            },
          })
          const rejected = yield* lightbulb
            .transitionDecisionArtifact({
              artifactID: decision.id,
              decision: {
                status: "accepted",
                reviewer: "",
              },
            })
            .pipe(Effect.flip)

          expect(rejected).toMatchObject({ reason: "decision reviewer is empty" })
        }).pipe(Effect.provide(layer(tmp.path))),
      ),
    ),
  )

  it.live("rejects non-routable replacement artifacts", () =>
    Effect.acquireRelease(
      Effect.promise(() => tmpdir()),
      (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
    ).pipe(
      Effect.flatMap((tmp) =>
        Effect.gen(function* () {
          const lightbulb = yield* Lightbulb.Service
          const seeded = yield* lightbulb.seedTracerBullet()
          yield* Effect.promise(() => Bun.write(path.join(tmp.path, "old-decision.md"), "old decision"))

          const decision = yield* lightbulb.registerDecisionArtifact({
            accountID: seeded.accountID,
            type: "adr",
            uri: "old-decision.md",
            summary: "Decision with a non-routable replacement.",
            retentionPolicy: { mode: "keep" },
            baseDirectory: tmp.path,
            source: {
              issueRef: "#24",
            },
            decision: {
              status: "pending",
              owner: "architecture",
            },
          })
          const replacement = yield* lightbulb.registerHarnessArtifact({
            accountID: seeded.accountID,
            producerKind: "harness",
            type: "report",
            uri: "replacement-report.md",
            summary: "Generic report with decision-shaped metadata.",
            retentionPolicy: { mode: "keep" },
            metadata: {
              decision: {
                status: "accepted",
                owner: "architecture",
              },
            },
          })
          const rejected = yield* lightbulb
            .transitionDecisionArtifact({
              artifactID: decision.id,
              decision: {
                status: "superseded",
                supersededByArtifactID: replacement.id,
              },
            })
            .pipe(Effect.flip)

          expect(rejected).toMatchObject({ reason: "replacement artifact is not a decision artifact" })
        }).pipe(Effect.provide(layer(tmp.path))),
      ),
    ),
  )

  it.live("holds ready issue routing for an unresolved decision gate", () =>
    Effect.acquireRelease(
      Effect.promise(() => tmpdir()),
      (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
    ).pipe(
      Effect.flatMap((tmp) =>
        Effect.gen(function* () {
          const lightbulb = yield* Lightbulb.Service
          const seeded = yield* lightbulb.seedTracerBullet()
          yield* Effect.promise(() => Bun.write(path.join(tmp.path, "review-gate-design.md"), "pending design body"))

          const decision = yield* lightbulb.registerDecisionArtifact({
            accountID: seeded.accountID,
            type: "design_discussion",
            uri: "review-gate-design.md",
            summary: "Design discussion must resolve before dispatch.",
            retentionPolicy: { mode: "keep" },
            baseDirectory: tmp.path,
            source: {
              issueRef: "#25",
              gateID: seeded.gateID,
            },
            decision: {
              status: "pending",
              owner: "product",
              reviewer: "architecture",
            },
          })
          const classification = yield* lightbulb.classifyIssueRouting({
            accountID: seeded.accountID,
            issueRef: "#25",
            title: "Decision-held issue",
            labels: ["ready-for-agent"],
            gateID: seeded.gateID,
          })

          expect(classification.status).toBe("held_for_decision")
          expect(classification.decisionHolds).toEqual([
            {
              issueRef: "#25",
              gateID: seeded.gateID,
              artifactID: decision.id,
              status: "pending",
              summary: "Design discussion must resolve before dispatch.",
            },
          ])
          expect(classification.decisionArtifacts.map((artifact) => [artifact.id, artifact.type, artifact.source.gateID])).toEqual([
            [decision.id, "design_discussion", seeded.gateID],
          ])
        }).pipe(Effect.provide(layer(tmp.path))),
      ),
    ),
  )

  it.live("replaces a superseded decision with an accepted artifact", () =>
    Effect.acquireRelease(
      Effect.promise(() => tmpdir()),
      (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
    ).pipe(
      Effect.flatMap((tmp) =>
        Effect.gen(function* () {
          const lightbulb = yield* Lightbulb.Service
          const seeded = yield* lightbulb.seedTracerBullet()
          yield* Effect.promise(() => Bun.write(path.join(tmp.path, "old-adr.md"), "old decision body"))
          yield* Effect.promise(() => Bun.write(path.join(tmp.path, "new-adr.md"), "new decision body"))

          const oldDecision = yield* lightbulb.registerDecisionArtifact({
            accountID: seeded.accountID,
            type: "adr",
            uri: "old-adr.md",
            summary: "Original ADR awaiting replacement.",
            retentionPolicy: { mode: "keep" },
            baseDirectory: tmp.path,
            source: {
              issueRef: "#26",
            },
            decision: {
              status: "pending",
              owner: "architecture",
              reviewer: "maintainer",
            },
          })
          const replacement = yield* lightbulb.registerDecisionArtifact({
            accountID: seeded.accountID,
            type: "adr",
            uri: "new-adr.md",
            summary: "Accepted replacement ADR.",
            retentionPolicy: { mode: "keep" },
            baseDirectory: tmp.path,
            source: {
              issueRef: "#26",
            },
            decision: {
              status: "accepted",
              owner: "architecture",
              reviewer: "maintainer",
              supersedesArtifactID: oldDecision.id,
            },
          })
          const classification = yield* lightbulb.classifyIssueRouting({
            accountID: seeded.accountID,
            issueRef: "#26",
            title: "Superseded replacement",
            labels: ["ready-for-agent"],
          })

          expect(replacement.decision.supersedesArtifactID).toBe(oldDecision.id)
          expect(classification.status).toBe("ready_for_afk")
          expect(classification.decisionHolds).toEqual([])
          expect(classification.decisionArtifacts.map((artifact) => [artifact.id, artifact.decision.status])).toEqual([
            [oldDecision.id, "superseded"],
            [replacement.id, "accepted"],
          ])
          expect(classification.decisionArtifacts[0]?.decision.supersededByArtifactID).toBe(replacement.id)
          expect(classification.decisionArtifacts[1]?.decision.supersedesArtifactID).toBe(oldDecision.id)
          expect(JSON.stringify(classification)).not.toContain("old decision body")
          expect(JSON.stringify(classification)).not.toContain("new decision body")
        }).pipe(Effect.provide(layer(tmp.path))),
      ),
    ),
  )

  it.live("keeps superseded replacement decisions scoped to the routed issue", () =>
    Effect.acquireRelease(
      Effect.promise(() => tmpdir()),
      (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
    ).pipe(
      Effect.flatMap((tmp) =>
        Effect.gen(function* () {
          const lightbulb = yield* Lightbulb.Service
          const seeded = yield* lightbulb.seedTracerBullet()
          yield* Effect.promise(() => Bun.write(path.join(tmp.path, "issue-a.md"), "issue A decision"))
          yield* Effect.promise(() => Bun.write(path.join(tmp.path, "issue-b.md"), "issue B decision"))

          const oldDecision = yield* lightbulb.registerDecisionArtifact({
            accountID: seeded.accountID,
            type: "adr",
            uri: "issue-a.md",
            summary: "Issue A decision awaiting an in-scope replacement.",
            retentionPolicy: { mode: "keep" },
            baseDirectory: tmp.path,
            source: {
              issueRef: "#28",
            },
            decision: {
              status: "pending",
              owner: "architecture",
              reviewer: "maintainer",
            },
          })
          const replacement = yield* lightbulb.registerDecisionArtifact({
            accountID: seeded.accountID,
            type: "adr",
            uri: "issue-b.md",
            summary: "Accepted replacement attached to a different issue.",
            retentionPolicy: { mode: "keep" },
            baseDirectory: tmp.path,
            source: {
              issueRef: "#29",
            },
            decision: {
              status: "accepted",
              owner: "architecture",
              reviewer: "maintainer",
              supersedesArtifactID: oldDecision.id,
            },
          })
          const classification = yield* lightbulb.classifyIssueRouting({
            accountID: seeded.accountID,
            issueRef: "#28",
            title: "Superseded decision with off-scope replacement",
            labels: ["ready-for-agent"],
          })

          expect(classification.status).toBe("held_for_decision")
          expect(classification.decisionHolds).toEqual([
            {
              issueRef: "#28",
              gateID: null,
              artifactID: oldDecision.id,
              status: "superseded",
              summary: "Issue A decision awaiting an in-scope replacement.",
            },
          ])
          expect(classification.decisionArtifacts.map((artifact) => artifact.id)).toEqual([oldDecision.id])
          expect(classification.decisionArtifacts[0]?.decision.supersededByArtifactID).toBe(replacement.id)
        }).pipe(Effect.provide(layer(tmp.path))),
      ),
    ),
  )

  it.live("holds rejected decision artifacts out of AFK routing", () =>
    Effect.acquireRelease(
      Effect.promise(() => tmpdir()),
      (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
    ).pipe(
      Effect.flatMap((tmp) =>
        Effect.gen(function* () {
          const lightbulb = yield* Lightbulb.Service
          const seeded = yield* lightbulb.seedTracerBullet()
          yield* Effect.promise(() => Bun.write(path.join(tmp.path, "decision.html"), "<main>rejected decision</main>"))

          const rejected = yield* lightbulb.registerDecisionArtifact({
            accountID: seeded.accountID,
            type: "html_decision",
            uri: "decision.html",
            summary: "Rejected HTML decision review.",
            retentionPolicy: { mode: "keep" },
            baseDirectory: tmp.path,
            source: {
              issueRef: "#27",
            },
            decision: {
              status: "rejected",
              owner: "product",
              reviewer: "maintainer",
            },
          })
          const classification = yield* lightbulb.classifyIssueRouting({
            accountID: seeded.accountID,
            issueRef: "#27",
            title: "Rejected decision",
            labels: ["ready-for-agent"],
          })

          expect(classification.status).toBe("decision_rejected")
          expect(classification.decisionHolds).toEqual([
            {
              issueRef: "#27",
              gateID: null,
              artifactID: rejected.id,
              status: "rejected",
              summary: "Rejected HTML decision review.",
            },
          ])
        }).pipe(Effect.provide(layer(tmp.path))),
      ),
    ),
  )

  it.live("skips worker dispatch when a decision gate is held", () =>
    Effect.acquireRelease(
      Effect.promise(() => tmpdir()),
      (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
    ).pipe(
      Effect.flatMap((tmp) =>
        Effect.gen(function* () {
          const lightbulb = yield* Lightbulb.Service
          const seeded = yield* lightbulb.seedTracerBullet()
          yield* Effect.promise(() => Bun.write(path.join(tmp.path, "prd.md"), "pending PRD body"))

          const decision = yield* lightbulb.registerDecisionArtifact({
            accountID: seeded.accountID,
            type: "prd",
            uri: "prd.md",
            summary: "Pending PRD decision for worker dispatch.",
            retentionPolicy: { mode: "keep" },
            baseDirectory: tmp.path,
            source: {
              issueRef: "#28",
              gateID: seeded.gateID,
            },
            decision: {
              status: "pending",
              owner: "product",
              reviewer: "maintainer",
            },
          })
          const dispatch = yield* lightbulb.planWorkerDispatch({
            issues: [
              {
                accountID: seeded.accountID,
                issueRef: "#28",
                title: "Dispatch-held issue",
                labels: ["ready-for-agent"],
                gateID: seeded.gateID,
              },
            ],
          })

          expect(dispatch.spawnRequests).toEqual([])
          expect(dispatch.skipped).toEqual([
            {
              issueRef: "#28",
              title: "Dispatch-held issue",
              reason: "decision-held",
              decisionHolds: [
                {
                  issueRef: "#28",
                  gateID: seeded.gateID,
                  artifactID: decision.id,
                  status: "pending",
                  summary: "Pending PRD decision for worker dispatch.",
                },
              ],
              summary: "Issue is held for unresolved decision artifacts.",
            },
          ])
        }).pipe(Effect.provide(layer(tmp.path))),
      ),
    ),
  )
})
