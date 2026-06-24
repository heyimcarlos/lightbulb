import path from "path"
import { describe, expect, test } from "bun:test"
import { Effect, Layer } from "effect"
import { Database } from "@opencode-ai/core/database/database"
import { Lightbulb } from "@opencode-ai/core/lightbulb"
import { tmpdir } from "./fixture/tmpdir"
import { it } from "./lib/effect"

const now = 1_000

function layer(directory: string) {
  const database = Database.layerFromPath(path.join(directory, "lightbulb-loop-starters.db")).pipe(Layer.fresh)
  return Layer.mergeAll(database, Lightbulb.layer.pipe(Layer.provide(database)))
}

describe("Lightbulb loop profile starters", () => {
  test("defines the stable-v0 starter set with route seeds and first wake prompts", () => {
    expect(Lightbulb.standardLoopStarters.map((starter) => starter.starterID)).toEqual([
      "system-discovery",
      "pr-review-babysitter",
      "issue-triage",
      "daily-status",
      "failure-debug",
      "trace-eval",
    ])
    expect(
      Lightbulb.standardLoopStarters.map((starter) => [
        starter.starterID,
        starter.profile.registry?.readinessMode,
        starter.profile.schedule?.enabled,
        starter.profile.starter?.routeSeed.stops.length,
        starter.profile.starter?.runLogPolicy.rawTranscriptPolicy,
      ]),
    ).toEqual([
      ["system-discovery", "human_gate", false, 2, "forbidden"],
      ["pr-review-babysitter", "human_gate", false, 3, "forbidden"],
      ["issue-triage", "human_gate", false, 2, "forbidden"],
      ["daily-status", "human_gate", false, 2, "forbidden"],
      ["failure-debug", "human_gate", false, 2, "forbidden"],
      ["trace-eval", "human_gate", false, 2, "forbidden"],
    ])

    const prStarter = Lightbulb.standardLoopStarters.find((starter) => starter.starterID === "pr-review-babysitter")
    expect(prStarter?.profile.registry?.readModel).toContain("#65/#66/#75")
    expect(prStarter?.profile.starter?.firstWakePrompt).toContain("babysitter digest")
    expect(prStarter?.profile.starter?.routeSeed.destination).toContain("PR")
  })

  it.live("bootstraps starter profiles idempotently as report-only defaults", () =>
    Effect.acquireRelease(
      Effect.promise(() => tmpdir()),
      (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
    ).pipe(
      Effect.flatMap((tmp) =>
        Effect.gen(function* () {
          const lightbulb = yield* Lightbulb.Service
          const created = yield* lightbulb.createOrAdoptGoal({
            accountName: "Loop Starter Account",
            title: "Bootstrap loop starters",
            objective: "Create stable-v0 loop starter profiles.",
          })
          const first = yield* lightbulb.bootstrapLoopStarters({
            accountID: created.goal.account_id,
            goalID: created.goal.id,
            now,
          })
          const retry = yield* lightbulb.bootstrapLoopStarters({
            accountID: created.goal.account_id,
            goalID: created.goal.id,
            now: now + 60_000,
          })
          const graph = yield* lightbulb.readAccountGraph(created.goal.account_id)
          const readiness = yield* lightbulb.readLoopReadiness({ accountID: created.goal.account_id, now })

          expect(first.starters.map((starter) => [starter.starterID, starter.loopID, starter.reason])).toEqual(
            Lightbulb.standardLoopStarters.map((starter) => [
              starter.starterID,
              Lightbulb.loopIDForProfile(created.goal.id, starter.starterID),
              "profile_disabled",
            ]),
          )
          expect(first.unknownStarterIDs).toEqual([])
          expect(retry.starters.map((starter) => starter.loopID)).toEqual(first.starters.map((starter) => starter.loopID))
          expect(graph?.loops).toHaveLength(6)
          expect(graph?.loops.every((loop) => loop.status === "disabled")).toBe(true)
          expect(readiness?.level).toBe("report-only")
          expect(readiness?.profiles.every((profile) => profile.level === "report-only")).toBe(true)
          expect(readiness?.profiles.every((profile) => profile.canRunUnattended === false)).toBe(true)
          expect(JSON.stringify(first)).not.toContain("rawWorkerLog")
        }).pipe(Effect.provide(layer(tmp.path))),
      ),
    ),
  )

  it.live("promotes selected starters without creating duplicate loops", () =>
    Effect.acquireRelease(
      Effect.promise(() => tmpdir()),
      (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
    ).pipe(
      Effect.flatMap((tmp) =>
        Effect.gen(function* () {
          const lightbulb = yield* Lightbulb.Service
          const created = yield* lightbulb.createOrAdoptGoal({
            accountName: "Promoted Starter Account",
            title: "Promote starter",
            objective: "Promote one starter after report-only bootstrap.",
          })
          yield* lightbulb.bootstrapLoopStarters({
            accountID: created.goal.account_id,
            goalID: created.goal.id,
            starterIDs: ["daily-status"],
            now,
          })
          const promoted = yield* lightbulb.bootstrapLoopStarters({
            accountID: created.goal.account_id,
            goalID: created.goal.id,
            starterIDs: ["daily-status"],
            promote: true,
            now: now + 60_000,
          })
          const retry = yield* lightbulb.bootstrapLoopStarters({
            accountID: created.goal.account_id,
            goalID: created.goal.id,
            starterIDs: ["daily-status"],
            promote: true,
            now: now + 120_000,
          })
          const graph = yield* lightbulb.readAccountGraph(created.goal.account_id)

          expect(promoted.starters).toEqual([
            expect.objectContaining({
              starterID: "daily-status",
              loopID: Lightbulb.loopIDForProfile(created.goal.id, "daily-status"),
              outcome: "adopted",
              promoted: true,
            }),
          ])
          expect(retry.starters).toEqual([
            expect.objectContaining({
              starterID: "daily-status",
              outcome: "adopted",
              promoted: true,
            }),
          ])
          expect(graph?.loops).toHaveLength(1)
          expect(graph?.loops[0]?.status).toBe("active")
          expect(graph?.loops[0]?.metadata?.loop_profile).toMatchObject({
            starter: {
              starter_id: "daily-status",
              run_log_policy: {
                raw_transcript_policy: "forbidden",
              },
            },
          })
        }).pipe(Effect.provide(layer(tmp.path))),
      ),
    ),
  )
})
