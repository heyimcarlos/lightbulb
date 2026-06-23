import path from "path"
import { describe, expect, test } from "bun:test"
import { Effect, Layer } from "effect"
import { Database } from "@opencode-ai/core/database/database"
import { Lightbulb } from "@opencode-ai/core/lightbulb"
import { tmpdir } from "./fixture/tmpdir"
import { it } from "./lib/effect"

function layer(directory: string) {
  const database = Database.layerFromPath(path.join(directory, "lightbulb.db")).pipe(Layer.fresh)
  return Layer.mergeAll(database, Lightbulb.layer.pipe(Layer.provide(database)))
}

describe("Lightbulb gate policy", () => {
  test("continues when thresholds are clear", () => {
    expect(
      Lightbulb.evaluateGatePolicy({
        thresholds: {
          maxContextTokens: 10_000,
          maxCostUsd: 20,
          requireApproval: true,
          requireVerification: true,
        },
        state: {
          contextTokens: 2_000,
          costUsd: 3.5,
          approval: "approved",
          verification: "passed",
        },
      }),
    ).toEqual({
      outcome: "continue",
      gateStatus: "passed",
      reason: "Policy thresholds allow the run to continue.",
      requiresCheckpoint: false,
      requiresDelegation: false,
    })
  })

  test("checkpoints and requires delegation when context crosses threshold", () => {
    expect(
      Lightbulb.evaluateGatePolicy({
        thresholds: {
          maxContextTokens: 8_000,
        },
        state: {
          contextTokens: 8_000,
          costUsd: 1,
          approval: "not_required",
          verification: "not_required",
        },
      }),
    ).toEqual({
      outcome: "checkpoint",
      gateStatus: "blocked",
      reason: "Context 8000 tokens reached checkpoint threshold 8000; checkpoint and delegate before continuing.",
      requiresCheckpoint: true,
      requiresDelegation: true,
    })
  })

  test("blocks while required approval is pending", () => {
    expect(
      Lightbulb.evaluateGatePolicy({
        thresholds: {
          requireApproval: true,
        },
        state: {
          contextTokens: 2_000,
          costUsd: 1,
          approval: "pending",
          verification: "not_required",
        },
      }),
    ).toMatchObject({
      outcome: "blocked",
      gateStatus: "blocked",
      reason: "Required approval is pending.",
    })
  })

  test("stops when a hard stop is requested", () => {
    expect(
      Lightbulb.evaluateGatePolicy({
        thresholds: {
          stop: true,
        },
        state: {
          contextTokens: 2_000,
          costUsd: 1,
          approval: "not_required",
          verification: "not_required",
        },
      }),
    ).toMatchObject({
      outcome: "stopped",
      gateStatus: "failed",
      reason: "Stop requested by policy.",
    })
  })

  it.live("persists a blocked policy gate in the parent summary", () =>
    Effect.acquireRelease(
      Effect.promise(() => tmpdir()),
      (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
    ).pipe(
      Effect.flatMap((tmp) =>
        Effect.gen(function* () {
          const lightbulb = yield* Lightbulb.Service
          const seeded = yield* lightbulb.seedTracerBullet()
          const transition = yield* lightbulb.applyGatePolicy({
            runID: seeded.runID,
            workerID: seeded.workerID,
            policy: {
              maxContextTokens: 8_000,
            },
            state: {
              contextTokens: 8_000,
              costUsd: 1,
              approval: "not_required",
              verification: "not_required",
            },
          })
          const summary = yield* lightbulb.parentSummary(seeded.runID)

          expect(transition?.decision.outcome).toBe("checkpoint")
          expect(summary?.status).toBe("blocked")
          expect(summary?.gateStatus).toBe("blocked")
          expect(summary?.workers).toContainEqual({
            id: seeded.workerID,
            role: "bounded implementation worker",
            status: "blocked",
            summary: transition!.decision.reason,
            launchAttempts: [],
          })
          expect(summary?.gates).toContainEqual({
            id: transition!.gateID,
            kind: "policy",
            status: "blocked",
            summary: transition!.decision.reason,
            blockedReason: transition!.decision.reason,
            artifactID: null,
          })
        }).pipe(Effect.provide(layer(tmp.path))),
      ),
    ),
  )
})
