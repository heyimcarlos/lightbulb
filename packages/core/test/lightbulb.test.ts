import path from "path"
import { describe, expect } from "bun:test"
import { rm } from "fs/promises"
import { eq } from "drizzle-orm"
import { Cause, Effect, Exit, Layer } from "effect"
import { Lightbulb } from "@opencode-ai/core/lightbulb"
import {
  LightbulbArtifactEdgeTable,
  LightbulbArtifactTable,
  LightbulbGateTable,
  LightbulbGoalTable,
  LightbulbLoopTable,
  LightbulbRunTable,
} from "@opencode-ai/core/lightbulb/sql"
import { Database } from "@opencode-ai/core/database/database"
import { tmpdir } from "./fixture/tmpdir"
import { it } from "./lib/effect"

function layer(directory: string) {
  const database = Database.layerFromPath(path.join(directory, "lightbulb.db")).pipe(Layer.fresh)
  return Layer.mergeAll(database, Lightbulb.layer.pipe(Layer.provide(database)))
}

describe("Lightbulb", () => {
  it.live("creates and reads one durable account goal graph", () =>
    Effect.acquireRelease(
      Effect.promise(() => tmpdir()),
      (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
    ).pipe(
      Effect.flatMap((tmp) =>
        Effect.gen(function* () {
          const lightbulb = yield* Lightbulb.Service
          const seeded = yield* lightbulb.seedTracerBullet({
            accountName: "Test Account",
            artifactUri: ".lightbulb/runs/issue-2-schema-codex.md",
            artifactSummary: "Worker report with changed files and verification results.",
          })
          const graph = yield* lightbulb.readAccountGraph(seeded.accountID)

          expect(graph?.account.name).toBe("Test Account")
          expect(graph?.goals.map((goal) => goal.id)).toEqual([seeded.goalID])
          expect(graph?.loops.map((loop) => [loop.id, loop.goal_id])).toEqual([[seeded.loopID, seeded.goalID]])
          expect(graph?.runs.map((run) => [run.id, run.loop_id, run.review_status, run.debug_status, run.gate_status])).toEqual([
            [seeded.runID, seeded.loopID, "requested", "fixed", "pending"],
          ])
          expect(graph?.workers.map((worker) => [worker.id, worker.run_id, worker.status])).toEqual([
            [seeded.workerID, seeded.runID, "complete"],
          ])
          expect(graph?.taskPackets.map((packet) => [packet.id, packet.worker_id, packet.status])).toEqual([
            [seeded.taskPacketID, seeded.workerID, "complete"],
          ])
          expect(graph?.artifacts.map((artifact) => [artifact.id, artifact.uri, artifact.producer_worker_id, artifact.task_packet_id])).toEqual([
            [seeded.artifactID, ".lightbulb/runs/issue-2-schema-codex.md", seeded.workerID, seeded.taskPacketID],
          ])
          expect(graph?.artifacts[0]?.checksum).toBe(null)
          expect(graph?.artifacts[0]?.metadata).toMatchObject({
            integrity: {
              uncheckedReason: "tracer artifact content not checked",
            },
          })
          expect(graph?.gates.map((gate) => [gate.id, gate.kind, gate.status, gate.artifact_id])).toEqual([
            [seeded.gateID, "review", "pending", seeded.artifactID],
          ])
          expect(graph?.events.map((event) => [event.aggregate_type, event.aggregate_id, event.type])).toEqual([
            ["run", seeded.runID, "lightbulb.tracer.seeded"],
          ])
        }).pipe(Effect.provide(layer(tmp.path))),
      ),
    ),
  )

  it.live("builds a dashboard read model for seeded account work", () =>
    Effect.acquireRelease(
      Effect.promise(() => tmpdir()),
      (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
    ).pipe(
      Effect.flatMap((tmp) =>
        Effect.gen(function* () {
          const lightbulb = yield* Lightbulb.Service
          const seeded = yield* lightbulb.seedTracerBullet({
            accountName: "Dashboard Account",
            artifactUri: ".lightbulb/runs/issue-3-dashboard.md",
            artifactSummary: "Dashboard artifact handle.",
          })
          const dashboard = yield* lightbulb.readDashboard(seeded.accountID)

          expect(dashboard?.account).toEqual({
            id: seeded.accountID,
            name: "Dashboard Account",
            status: "active",
          })
          expect(dashboard?.goals).toEqual([
            {
              id: seeded.goalID,
              title: "Bootstrap loop harness",
              status: "open",
              summary: "Create one durable Lightbulb goal graph.",
              loops: [
                {
                  id: seeded.loopID,
                  kind: "implementation",
                  status: "active",
                  summary: "Implementation loop owns the tracer bullet run.",
                  runs: [
                    {
                      id: seeded.runID,
                      status: "complete",
                      reviewStatus: "requested",
                      debugStatus: "fixed",
                      gateStatus: "pending",
                      summary: "Worker produced a durable implementation report artifact.",
                      workers: [
                        {
                          id: seeded.workerID,
                          role: "bounded implementation worker",
                          status: "complete",
                          summary: "Implemented the schema tracer bullet and returned artifact handles.",
                        },
                      ],
                      gates: [
                        {
                          id: seeded.gateID,
                          kind: "review",
                          status: "pending",
                          summary: "Parent review is pending against the report artifact.",
                          artifactID: seeded.artifactID,
                        },
                      ],
                      artifacts: [
                        {
                          id: seeded.artifactID,
                          type: "report",
                          uri: ".lightbulb/runs/issue-3-dashboard.md",
                          summary: "Dashboard artifact handle.",
                          status: "registered",
                          integrity: expect.objectContaining({
                            status: "unchecked",
                            checksum: null,
                            uncheckedReason: "tracer artifact content not checked",
                          }),
                          retentionPolicy: { mode: "keep" },
                          retentionDecision: "hold-for-gate",
                          producerKind: "worker",
                          producerRunID: seeded.runID,
                          producerWorkerID: seeded.workerID,
                          source: {},
                          lineage: [
                            {
                              relation: "produced_by",
                              runID: seeded.runID,
                              workerID: seeded.workerID,
                              summary: "Worker produced this artifact for parent review.",
                            },
                          ],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ])
          expect(dashboard?.inbox.taskPackets).toEqual([
            {
              id: seeded.taskPacketID,
              workerID: seeded.workerID,
              title: "Implement schema tracer bullet",
              status: "complete",
            },
          ])
          expect(dashboard?.inbox.gates).toEqual([
            {
              id: seeded.gateID,
              kind: "review",
              status: "pending",
              summary: "Parent review is pending against the report artifact.",
              artifactID: seeded.artifactID,
            },
          ])
          expect(dashboard?.artifactHandles.map((artifact) => [artifact.id, artifact.uri])).toEqual([
            [seeded.artifactID, ".lightbulb/runs/issue-3-dashboard.md"],
          ])
        }).pipe(Effect.provide(layer(tmp.path))),
      ),
    ),
  )

  it.live("summarizes artifact handles for parent orchestration without raw logs", () =>
    Effect.acquireRelease(
      Effect.promise(() => tmpdir()),
      (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
    ).pipe(
      Effect.flatMap((tmp) =>
        Effect.gen(function* () {
          const lightbulb = yield* Lightbulb.Service
          const seeded = yield* lightbulb.seedTracerBullet({
            artifactSummary: "Concise report for parent review.",
            rawWorkerLog: "RAW MODEL STREAM SHOULD STAY OUT OF PARENT SUMMARY",
          })
          const registered = yield* lightbulb.registerArtifact({
            producerRunID: seeded.runID,
            producerWorkerID: seeded.workerID,
            taskPacketID: seeded.taskPacketID,
            type: "report",
            uri: ".lightbulb/runs/issue-4-artifact-flow.md",
            summary: "Issue 4 worker report for parent review.",
            retentionPolicy: { mode: "keep" },
          })
          yield* lightbulb.consumeArtifact({
            artifactID: registered.id,
            consumerRunID: seeded.runID,
            consumerWorkerID: seeded.workerID,
            summary: "Parent reviewed the report handle.",
          })

          const graph = yield* lightbulb.readAccountGraph(seeded.accountID)
          const summary = yield* lightbulb.parentSummary(seeded.runID)
          const consumed = summary?.artifacts.find((artifact) => artifact.id === registered.id)

          expect(registered).toMatchObject({
            id: registered.id,
            type: "report",
            uri: ".lightbulb/runs/issue-4-artifact-flow.md",
            summary: "Issue 4 worker report for parent review.",
            status: "registered",
            integrity: expect.objectContaining({
              status: "unchecked",
              checksum: null,
              uncheckedReason: "artifact content missing during registration",
            }),
            retentionPolicy: { mode: "keep" },
            retentionDecision: "keep",
            producerRunID: seeded.runID,
            producerWorkerID: seeded.workerID,
            lineage: [
              {
                relation: "produced_by",
                runID: seeded.runID,
                workerID: seeded.workerID,
                summary: "Worker produced this artifact for parent review.",
              },
            ],
          })
          expect(
            graph?.artifactEdges
              .filter((edge) => edge.artifact_id === registered.id)
              .map((edge) => edge.relation)
              .sort(),
          ).toEqual(["consumed_by", "produced_by"])
          expect(graph?.artifacts.find((artifact) => artifact.id === registered.id)?.status).toBe("consumed")
          expect(JSON.stringify(graph)).not.toContain("RAW MODEL STREAM")
          expect(consumed).toMatchObject({
            id: registered.id,
            type: "report",
            uri: ".lightbulb/runs/issue-4-artifact-flow.md",
            summary: "Issue 4 worker report for parent review.",
            status: "consumed",
            integrity: expect.objectContaining({
              status: "unchecked",
              checksum: null,
              uncheckedReason: "artifact content missing during registration",
            }),
            retentionPolicy: { mode: "keep" },
            retentionDecision: "keep",
            producerRunID: seeded.runID,
            producerWorkerID: seeded.workerID,
          })
          expect(
            consumed?.lineage
              .map((edge) => ({
                relation: edge.relation,
                runID: edge.runID,
                workerID: edge.workerID,
                summary: edge.summary,
              }))
              .sort((left, right) => left.relation.localeCompare(right.relation)),
          ).toEqual([
            {
              relation: "consumed_by",
              runID: seeded.runID,
              workerID: seeded.workerID,
              summary: "Parent reviewed the report handle.",
            },
            {
              relation: "produced_by",
              runID: seeded.runID,
              workerID: seeded.workerID,
              summary: "Worker produced this artifact for parent review.",
            },
          ])
          expect(JSON.stringify(summary)).not.toContain("RAW MODEL STREAM")
          expect(summary?.gates).toEqual([
            {
              id: seeded.gateID,
              kind: "review",
              status: "pending",
              summary: "Parent review is pending against the report artifact.",
              artifactID: seeded.artifactID,
            },
          ])
        }).pipe(Effect.provide(layer(tmp.path))),
      ),
    ),
  )

  it.live("registers and checks a local artifact with a valid checksum", () =>
    Effect.acquireRelease(
      Effect.promise(() => tmpdir()),
      (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
    ).pipe(
      Effect.flatMap((tmp) =>
        Effect.gen(function* () {
          const lightbulb = yield* Lightbulb.Service
          const seeded = yield* lightbulb.seedTracerBullet()
          yield* Effect.promise(() => Bun.write(path.join(tmp.path, "verified.md"), "artifact v1"))

          const registered = yield* lightbulb.registerArtifact({
            producerRunID: seeded.runID,
            producerWorkerID: seeded.workerID,
            taskPacketID: seeded.taskPacketID,
            type: "report",
            uri: "verified.md",
            summary: "Checksum-backed worker report.",
            retentionPolicy: { mode: "keep" },
            baseDirectory: tmp.path,
          })
          const checked = yield* lightbulb.checkArtifact({
            artifactID: registered.id,
            baseDirectory: tmp.path,
          })
          const graph = yield* lightbulb.readAccountGraph(seeded.accountID)
          const artifact = graph?.artifacts.find((artifact) => artifact.id === registered.id)

          expect(registered.integrity.status).toBe("verified")
          expect(registered.integrity.checksum?.startsWith("sha256:")).toBe(true)
          expect(registered.integrity.expectedSizeBytes).toBe("artifact v1".length)
          expect(registered.retentionDecision).toBe("keep")
          expect(checked?.integrity.status).toBe("verified")
          expect(checked?.integrity.actualChecksum).toBe(registered.integrity.checksum)
          expect(artifact?.checksum).toBe(registered.integrity.checksum)
          expect(artifact?.retention_policy).toBe("keep")
          expect(artifact?.metadata).toMatchObject({
            integrity: {
              algorithm: "sha256",
              sizeBytes: "artifact v1".length,
            },
          })
        }).pipe(Effect.provide(layer(tmp.path))),
      ),
    ),
  )

  it.live("detects changed and missing artifact content by handle", () =>
    Effect.acquireRelease(
      Effect.promise(() => tmpdir()),
      (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
    ).pipe(
      Effect.flatMap((tmp) =>
        Effect.gen(function* () {
          const lightbulb = yield* Lightbulb.Service
          const seeded = yield* lightbulb.seedTracerBullet()
          yield* Effect.promise(() => Bun.write(path.join(tmp.path, "mutable.md"), "artifact v1"))
          const registered = yield* lightbulb.registerArtifact({
            producerRunID: seeded.runID,
            producerWorkerID: seeded.workerID,
            taskPacketID: seeded.taskPacketID,
            type: "report",
            uri: "mutable.md",
            summary: "Mutable worker report.",
            retentionPolicy: { mode: "keep" },
            baseDirectory: tmp.path,
          })

          yield* Effect.promise(() => Bun.write(path.join(tmp.path, "mutable.md"), "artifact v2"))
          const changed = yield* lightbulb.checkArtifact({
            artifactID: registered.id,
            baseDirectory: tmp.path,
          })
          yield* Effect.promise(() => rm(path.join(tmp.path, "mutable.md")))
          const missing = yield* lightbulb.checkArtifact({
            artifactID: registered.id,
            baseDirectory: tmp.path,
          })

          expect(changed?.integrity.status).toBe("changed")
          expect(changed?.integrity.checksum).toBe(registered.integrity.checksum)
          expect(changed?.integrity.actualChecksum).not.toBe(registered.integrity.checksum)
          expect(missing?.integrity.status).toBe("missing")
          expect(missing?.integrity.checksum).toBe(registered.integrity.checksum)
          expect(missing?.integrity.actualChecksum).toBe(null)
        }).pipe(Effect.provide(layer(tmp.path))),
      ),
    ),
  )

  it.live("expires artifacts whose retention deadline has passed", () =>
    Effect.acquireRelease(
      Effect.promise(() => tmpdir()),
      (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
    ).pipe(
      Effect.flatMap((tmp) =>
        Effect.gen(function* () {
          const lightbulb = yield* Lightbulb.Service
          const seeded = yield* lightbulb.seedTracerBullet()
          yield* Effect.promise(() => Bun.write(path.join(tmp.path, "expired.md"), "old report"))
          const registered = yield* lightbulb.registerArtifact({
            producerRunID: seeded.runID,
            producerWorkerID: seeded.workerID,
            taskPacketID: seeded.taskPacketID,
            type: "report",
            uri: "expired.md",
            summary: "Expired worker report.",
            retentionPolicy: { mode: "expire", expiresAt: 100 },
            baseDirectory: tmp.path,
          })

          const applied = yield* lightbulb.applyArtifactRetention({
            artifactID: registered.id,
            baseDirectory: tmp.path,
            now: 101,
          })

          expect(applied?.retentionDecision).toBe("expire")
          expect(applied?.status).toBe("expired")
        }).pipe(Effect.provide(layer(tmp.path))),
      ),
    ),
  )

  it.live("marks superseded artifacts without embedding replacement content", () =>
    Effect.acquireRelease(
      Effect.promise(() => tmpdir()),
      (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
    ).pipe(
      Effect.flatMap((tmp) =>
        Effect.gen(function* () {
          const lightbulb = yield* Lightbulb.Service
          const seeded = yield* lightbulb.seedTracerBullet()
          yield* Effect.promise(() => Bun.write(path.join(tmp.path, "superseded.md"), "old report"))
          const registered = yield* lightbulb.registerArtifact({
            producerRunID: seeded.runID,
            producerWorkerID: seeded.workerID,
            taskPacketID: seeded.taskPacketID,
            type: "report",
            uri: "superseded.md",
            summary: "Superseded worker report.",
            retentionPolicy: { mode: "supersede", supersededByArtifactID: seeded.artifactID },
            baseDirectory: tmp.path,
          })

          const applied = yield* lightbulb.applyArtifactRetention({
            artifactID: registered.id,
            baseDirectory: tmp.path,
          })

          expect(applied?.retentionDecision).toBe("supersede")
          expect(applied?.status).toBe("superseded")
          expect(JSON.stringify(applied)).not.toContain("old report")
        }).pipe(Effect.provide(layer(tmp.path))),
      ),
    ),
  )

  it.live("holds expired artifacts needed by active runs, gates, or unresolved dependencies", () =>
    Effect.acquireRelease(
      Effect.promise(() => tmpdir()),
      (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
    ).pipe(
      Effect.flatMap((tmp) =>
        Effect.gen(function* () {
          const lightbulb = yield* Lightbulb.Service
          const seeded = yield* lightbulb.seedTracerBullet()
          const database = yield* Database.Service

          yield* database.db
            .update(LightbulbArtifactTable)
            .set({ retention_policy: "expire_at:100" })
            .where(eq(LightbulbArtifactTable.id, seeded.artifactID))
            .run()
            .pipe(Effect.orDie)
          const gateHeld = yield* lightbulb.applyArtifactRetention({
            artifactID: seeded.artifactID,
            now: 101,
          })

          yield* Effect.promise(() => Bun.write(path.join(tmp.path, "active.md"), "active report"))
          const active = yield* lightbulb.registerArtifact({
            producerRunID: seeded.runID,
            producerWorkerID: seeded.workerID,
            taskPacketID: seeded.taskPacketID,
            type: "report",
            uri: "active.md",
            summary: "Report still required by an active run.",
            retentionPolicy: { mode: "expire", expiresAt: 100 },
            baseDirectory: tmp.path,
          })
          yield* database.db
            .update(LightbulbRunTable)
            .set({ status: "running" })
            .where(eq(LightbulbRunTable.id, seeded.runID))
            .run()
            .pipe(Effect.orDie)
          const activeHeld = yield* lightbulb.applyArtifactRetention({
            artifactID: active.id,
            baseDirectory: tmp.path,
            now: 101,
          })

          yield* database.db
            .update(LightbulbRunTable)
            .set({ status: "complete" })
            .where(eq(LightbulbRunTable.id, seeded.runID))
            .run()
            .pipe(Effect.orDie)
          yield* Effect.promise(() => Bun.write(path.join(tmp.path, "dependency.md"), "dependency report"))
          const dependency = yield* lightbulb.registerArtifact({
            producerRunID: seeded.runID,
            producerWorkerID: seeded.workerID,
            taskPacketID: seeded.taskPacketID,
            type: "report",
            uri: "dependency.md",
            summary: "Report still required by an unresolved dependency.",
            retentionPolicy: { mode: "expire", expiresAt: 100 },
            baseDirectory: tmp.path,
            unresolvedDependencyIDs: ["issue-14"],
          })
          const dependencyHeld = yield* lightbulb.applyArtifactRetention({
            artifactID: dependency.id,
            baseDirectory: tmp.path,
            now: 101,
          })

          const second = yield* lightbulb.seedTracerBullet()
          yield* Effect.promise(() => Bun.write(path.join(tmp.path, "cross-account-gate.md"), "cross account gate"))
          const crossAccountGate = yield* lightbulb.registerArtifact({
            producerRunID: seeded.runID,
            producerWorkerID: seeded.workerID,
            taskPacketID: seeded.taskPacketID,
            type: "report",
            uri: "cross-account-gate.md",
            summary: "Report with only a foreign account gate.",
            retentionPolicy: { mode: "expire", expiresAt: 100 },
            baseDirectory: tmp.path,
          })
          yield* database.db
            .insert(LightbulbGateTable)
            .values({
              id: Lightbulb.GateID.create(),
              account_id: second.accountID,
              run_id: second.runID,
              kind: "review",
              status: "pending",
              summary: "Foreign account gate must not hold retention.",
              artifact_id: crossAccountGate.id,
            })
            .run()
            .pipe(Effect.orDie)
          const foreignGateExpired = yield* lightbulb.applyArtifactRetention({
            artifactID: crossAccountGate.id,
            baseDirectory: tmp.path,
            now: 101,
          })

          expect(gateHeld?.retentionDecision).toBe("hold-for-gate")
          expect(gateHeld?.status).toBe("registered")
          expect(activeHeld?.retentionDecision).toBe("hold-for-active-run")
          expect(activeHeld?.status).toBe("registered")
          expect(dependencyHeld?.retentionDecision).toBe("hold-for-dependency")
          expect(dependencyHeld?.status).toBe("registered")
          expect(foreignGateExpired?.retentionDecision).toBe("expire")
          expect(foreignGateExpired?.status).toBe("expired")
        }).pipe(Effect.provide(layer(tmp.path))),
      ),
    ),
  )

  it.live("registers a harness-authored PRD artifact with source issue and goal lineage", () =>
    Effect.acquireRelease(
      Effect.promise(() => tmpdir()),
      (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
    ).pipe(
      Effect.flatMap((tmp) =>
        Effect.gen(function* () {
          const lightbulb = yield* Lightbulb.Service
          const seeded = yield* lightbulb.seedTracerBullet()
          yield* Effect.promise(() => Bun.write(path.join(tmp.path, "issue-23-prd.md"), "Harness PRD body"))

          const registered = yield* lightbulb.registerHarnessArtifact({
            accountID: seeded.accountID,
            producerKind: "harness",
            type: "prd",
            uri: "issue-23-prd.md",
            summary: "Issue 23 PRD artifact for parent review.",
            retentionPolicy: { mode: "keep" },
            baseDirectory: tmp.path,
            source: {
              issueRef: "#23",
              goalID: seeded.goalID,
            },
          })
          const graph = yield* lightbulb.readAccountGraph(seeded.accountID)
          const artifact = graph?.artifacts.find((artifact) => artifact.id === registered.id)
          const dashboard = yield* lightbulb.readDashboard(seeded.accountID)
          const handle = dashboard?.artifactHandles.find((artifact) => artifact.id === registered.id)

          expect(registered).toMatchObject({
            type: "prd",
            uri: "issue-23-prd.md",
            summary: "Issue 23 PRD artifact for parent review.",
            status: "registered",
            integrity: expect.objectContaining({
              status: "verified",
              checksum: expect.stringMatching(/^sha256:/),
              expectedSizeBytes: "Harness PRD body".length,
            }),
            retentionPolicy: { mode: "keep" },
            retentionDecision: "keep",
            producerKind: "harness",
            producerRunID: null,
            producerWorkerID: null,
            source: {
              issueRef: "#23",
              goalID: seeded.goalID,
            },
            lineage: [],
          })
          expect(artifact?.producer_kind).toBe("harness")
          expect(artifact?.producer_run_id).toBeNull()
          expect(artifact?.producer_worker_id).toBeNull()
          expect(artifact?.task_packet_id).toBeNull()
          expect(artifact?.source_issue_ref).toBe("#23")
          expect(artifact?.source_goal_id).toBe(seeded.goalID)
          expect(artifact?.checksum).toMatch(/^sha256:/)
          expect(handle).toMatchObject({
            id: registered.id,
            producerKind: "harness",
            source: {
              issueRef: "#23",
              goalID: seeded.goalID,
            },
          })
          expect(JSON.stringify(dashboard)).not.toContain("Harness PRD body")
        }).pipe(Effect.provide(layer(tmp.path))),
      ),
    ),
  )

  it.live("registers a harness-authored run report in parent summaries without embedding contents", () =>
    Effect.acquireRelease(
      Effect.promise(() => tmpdir()),
      (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
    ).pipe(
      Effect.flatMap((tmp) =>
        Effect.gen(function* () {
          const lightbulb = yield* Lightbulb.Service
          const seeded = yield* lightbulb.seedTracerBullet()
          yield* Effect.promise(() => Bun.write(path.join(tmp.path, "run-report.md"), "Harness run report body"))

          const registered = yield* lightbulb.registerHarnessArtifact({
            accountID: seeded.accountID,
            producerKind: "harness",
            type: "run_report",
            uri: "run-report.md",
            summary: "Harness run report for issue 23.",
            retentionPolicy: { mode: "expire", expiresAt: 100 },
            baseDirectory: tmp.path,
            source: {
              issueRef: "#23",
              runID: seeded.runID,
              gateID: seeded.gateID,
            },
          })
          const summary = yield* lightbulb.parentSummary(seeded.runID)
          const handle = summary?.artifacts.find((artifact) => artifact.id === registered.id)
          const graph = yield* lightbulb.readAccountGraph(seeded.accountID)
          const artifact = graph?.artifacts.find((artifact) => artifact.id === registered.id)

          expect(registered).toMatchObject({
            type: "run_report",
            producerKind: "harness",
            producerRunID: null,
            producerWorkerID: null,
            source: {
              issueRef: "#23",
              runID: seeded.runID,
              gateID: seeded.gateID,
            },
            integrity: expect.objectContaining({
              status: "verified",
              checksum: expect.stringMatching(/^sha256:/),
              expectedSizeBytes: "Harness run report body".length,
            }),
            retentionPolicy: { mode: "expire", expiresAt: 100 },
            retentionDecision: "hold-for-gate",
            lineage: [
              {
                relation: "produced_by",
                runID: seeded.runID,
                workerID: null,
                summary: "Harness registered this artifact for parent orchestration.",
              },
            ],
          })
          expect(handle?.id).toBe(registered.id)
          expect(handle?.status).toBe("registered")
          expect(handle?.producerKind).toBe("harness")
          expect(handle?.integrity.status).toBe("unchecked")
          expect(handle?.integrity.checksum).toMatch(/^sha256:/)
          expect(handle?.integrity.uncheckedReason).toBe("live artifact content not checked")
          expect(handle?.retentionDecision).toBe("hold-for-gate")
          expect(handle?.source).toMatchObject({
            issueRef: "#23",
            runID: seeded.runID,
            gateID: seeded.gateID,
          })
          expect(artifact?.metadata).toMatchObject({
            integrity: {
              algorithm: "sha256",
              sizeBytes: "Harness run report body".length,
            },
          })
          expect(JSON.stringify(summary)).not.toContain("Harness run report body")
        }).pipe(Effect.provide(layer(tmp.path))),
      ),
    ),
  )

  it.live("rejects invalid harness artifact handles and lineage with deterministic reasons", () =>
    Effect.acquireRelease(
      Effect.promise(() => tmpdir()),
      (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
    ).pipe(
      Effect.flatMap((tmp) =>
        Effect.gen(function* () {
          const lightbulb = yield* Lightbulb.Service
          const first = yield* lightbulb.seedTracerBullet()
          const second = yield* lightbulb.seedTracerBullet()

          const missingHandle = yield* lightbulb
            .registerHarnessArtifact({
              accountID: first.accountID,
              producerKind: "harness",
              type: "plan",
              uri: "",
              summary: "Missing handle should be rejected.",
              retentionPolicy: { mode: "keep" },
            })
            .pipe(Effect.exit)
          const unsupportedType = yield* lightbulb
            .registerHarnessArtifact({
              accountID: first.accountID,
              producerKind: "harness",
              type: "audio" as Lightbulb.ArtifactType,
              uri: "artifact://issue-23/audio",
              summary: "Unsupported type should be rejected.",
              retentionPolicy: { mode: "keep" },
              uncheckedReason: "external URI not fetched by test",
            })
            .pipe(Effect.exit)
          const oversizedInline = yield* lightbulb
            .registerHarnessArtifact({
              accountID: first.accountID,
              producerKind: "harness",
              type: "plan",
              uri: "artifact://issue-23/inline",
              inlineContent: "x".repeat(9 * 1024),
              summary: "Oversized inline content should be rejected.",
              retentionPolicy: { mode: "keep" },
            })
            .pipe(Effect.exit)
          const invalidLineage = yield* lightbulb
            .registerHarnessArtifact({
              accountID: first.accountID,
              producerKind: "harness",
              type: "plan",
              uri: "artifact://issue-23/cross-account-plan",
              summary: "Cross-account lineage should be rejected.",
              retentionPolicy: { mode: "keep" },
              uncheckedReason: "external URI not fetched by test",
              source: {
                runID: second.runID,
              },
            })
            .pipe(Effect.exit)
          const database = yield* Database.Service
          const otherGoalID = Lightbulb.GoalID.create()
          const otherLoopID = Lightbulb.LoopID.create()
          const otherRunID = Lightbulb.RunID.create()
          const otherGateID = Lightbulb.GateID.create()
          yield* database.db.insert(LightbulbGoalTable).values({
            id: otherGoalID,
            account_id: first.accountID,
            title: "Same-account unrelated goal",
            status: "open",
            summary: "This goal must not be mixed with the first goal's sources.",
          })
          yield* database.db.insert(LightbulbLoopTable).values({
            id: otherLoopID,
            account_id: first.accountID,
            goal_id: otherGoalID,
            kind: "implementation",
            status: "active",
            summary: "Same-account unrelated loop.",
          })
          yield* database.db.insert(LightbulbRunTable).values({
            id: otherRunID,
            account_id: first.accountID,
            loop_id: otherLoopID,
            status: "complete",
            review_status: "requested",
            debug_status: "fixed",
            gate_status: "pending",
            summary: "Same-account unrelated run.",
            started_at: Date.now(),
            completed_at: Date.now(),
          })
          yield* database.db.insert(LightbulbGateTable).values({
            id: otherGateID,
            account_id: first.accountID,
            run_id: otherRunID,
            kind: "review",
            status: "pending",
            summary: "Same-account unrelated gate.",
          })
          const wrongGoalRun = yield* lightbulb
            .registerHarnessArtifact({
              accountID: first.accountID,
              producerKind: "harness",
              type: "plan",
              uri: "artifact://issue-23/wrong-goal-run",
              summary: "Same-account run from another goal should be rejected.",
              retentionPolicy: { mode: "keep" },
              uncheckedReason: "external URI not fetched by test",
              source: {
                goalID: first.goalID,
                runID: otherRunID,
              },
            })
            .pipe(Effect.exit)
          const wrongGoalGate = yield* lightbulb
            .registerHarnessArtifact({
              accountID: first.accountID,
              producerKind: "harness",
              type: "plan",
              uri: "artifact://issue-23/wrong-goal-gate",
              summary: "Same-account gate from another goal should be rejected.",
              retentionPolicy: { mode: "keep" },
              uncheckedReason: "external URI not fetched by test",
              source: {
                goalID: first.goalID,
                gateID: otherGateID,
              },
            })
            .pipe(Effect.exit)

          expect(Exit.isFailure(missingHandle) ? Cause.pretty(missingHandle.cause) : "").toContain(
            "artifact handle uri is required",
          )
          expect(Exit.isFailure(unsupportedType) ? Cause.pretty(unsupportedType.cause) : "").toContain(
            "unsupported artifact type: audio",
          )
          expect(Exit.isFailure(oversizedInline) ? Cause.pretty(oversizedInline.cause) : "").toContain(
            "inline artifact content exceeds 8192 bytes",
          )
          expect(Exit.isFailure(invalidLineage) ? Cause.pretty(invalidLineage.cause) : "").toContain(
            "artifact source run belongs to another account",
          )
          expect(Exit.isFailure(wrongGoalRun) ? Cause.pretty(wrongGoalRun.cause) : "").toContain(
            "artifact source run does not belong to source goal",
          )
          expect(Exit.isFailure(wrongGoalGate) ? Cause.pretty(wrongGoalGate.cause) : "").toContain(
            "artifact source gate does not belong to source goal",
          )
        }).pipe(Effect.provide(layer(tmp.path))),
      ),
    ),
  )

  it.live("rejects internally inconsistent artifact producer lineage", () =>
    Effect.acquireRelease(
      Effect.promise(() => tmpdir()),
      (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
    ).pipe(
      Effect.flatMap((tmp) =>
        Effect.gen(function* () {
          const lightbulb = yield* Lightbulb.Service
          const first = yield* lightbulb.seedTracerBullet()
          const second = yield* lightbulb.seedTracerBullet()
          const database = yield* Database.Service
          const rejected = yield* database.db
            .insert(LightbulbArtifactTable)
            .values({
              id: Lightbulb.ArtifactID.create(),
              account_id: first.accountID,
              producer_run_id: first.runID,
              producer_worker_id: second.workerID,
              task_packet_id: first.taskPacketID,
              producer_kind: "worker",
              type: "report",
              uri: ".lightbulb/runs/invalid-lineage.md",
              checksum: null,
              status: "registered",
              summary: "This artifact mixes a run with a worker from another run.",
              retention_policy: "discard",
            })
            .run()
            .pipe(Effect.exit)

          const missingProducerFields = yield* database.db
            .insert(LightbulbArtifactTable)
            .values({
              id: Lightbulb.ArtifactID.create(),
              account_id: first.accountID,
              producer_run_id: null,
              producer_worker_id: null,
              task_packet_id: null,
              producer_kind: "worker",
              type: "report",
              uri: ".lightbulb/runs/missing-producer.md",
              checksum: null,
              status: "registered",
              summary: "A worker artifact must name its producer run, worker, and packet.",
              retention_policy: "discard",
            })
            .run()
            .pipe(Effect.exit)

          expect(Exit.isFailure(rejected)).toBe(true)
          expect(Exit.isFailure(missingProducerFields)).toBe(true)
        }).pipe(Effect.provide(layer(tmp.path))),
      ),
    ),
  )

  it.live("rejects cross-account artifact consumption", () =>
    Effect.acquireRelease(
      Effect.promise(() => tmpdir()),
      (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
    ).pipe(
      Effect.flatMap((tmp) =>
        Effect.gen(function* () {
          const lightbulb = yield* Lightbulb.Service
          const first = yield* lightbulb.seedTracerBullet()
          const second = yield* lightbulb.seedTracerBullet()
          const serviceRejected = yield* lightbulb
            .consumeArtifact({
              artifactID: first.artifactID,
              consumerRunID: second.runID,
              consumerWorkerID: second.workerID,
              summary: "A different account must not consume this artifact.",
            })
            .pipe(Effect.exit)

          const database = yield* Database.Service
          const directRejected = yield* database.db
            .insert(LightbulbArtifactEdgeTable)
            .values({
              account_id: first.accountID,
              artifact_id: first.artifactID,
              consumer_run_id: second.runID,
              consumer_worker_id: second.workerID,
              relation: "consumed_by",
              summary: "A direct insert must also respect account boundaries.",
            })
            .run()
            .pipe(Effect.exit)

          expect(Exit.isFailure(serviceRejected)).toBe(true)
          expect(Exit.isFailure(directRejected)).toBe(true)
        }).pipe(Effect.provide(layer(tmp.path))),
      ),
    ),
  )
})
