import path from "path"
import { describe, expect } from "bun:test"
import { asc } from "drizzle-orm"
import { Effect, Layer } from "effect"
import { Database } from "@opencode-ai/core/database/database"
import {
  Lightbulb,
  evaluateIssueMutationSafeWritePolicy,
  type IssueMutationApplyAction,
  type IssueMutationApplyAdapter,
  type IssueMutationApplyAdapterResult,
  type SafeWritePolicyInput,
} from "@opencode-ai/core/lightbulb"
import { LightbulbIssueMutationOutboxTable } from "@opencode-ai/core/lightbulb/sql"
import { tmpdir } from "./fixture/tmpdir"
import { it } from "./lib/effect"

const now = Date.UTC(2026, 5, 24, 16)

function layer(directory: string) {
  const database = Database.layerFromPath(path.join(directory, "lightbulb-safe-write-policy.db")).pipe(Layer.fresh)
  return Layer.mergeAll(database, Lightbulb.layer.pipe(Layer.provide(database)))
}

describe("Lightbulb safe-write policy", () => {
  it.live("distinguishes connector authorities and returns bounded deny reasons", () =>
    Effect.sync(() => {
      const evaluation = evaluateIssueMutationSafeWritePolicy({
        mutation: {
          repository: "heyimcarlos/lightbulb",
          action: "add_label",
          addLabels: ["ready-for-agent"],
        },
        policy: {
          profile: {
            connector: "github",
            authorities: ["read", "comment", "edit", "branch_pull_request", "merge"],
          },
          issueType: "pull_request",
          deniedIssueTypes: ["pull_request"],
          pathRefs: ["packages/core/src/lightbulb.ts"],
          allowedPathPrefixes: ["docs/lightbulb"],
          deniedLabels: ["ready-for-agent"],
          risk: "high",
          maxRisk: "medium",
        },
      })

      expect(evaluation?.requiredAuthority).toBe("label")
      expect(evaluation?.authorities).toContain("merge")
      expect(evaluation?.holdReasons).toEqual([
        "unsupported_adapter_capability",
        "safe_write_issue_type_denied",
        "safe_write_path_denied",
        "safe_write_label_denied",
        "safe_write_risk_denied",
      ])
    }),
  )

  it.live("stores safe-write evaluation metadata on held proposals", () =>
    withLightbulb((lightbulb) =>
      Effect.gen(function* () {
        const seeded = yield* lightbulb.seedTracerBullet()
        const result = yield* lightbulb.proposeIssueMutation({
          accountID: seeded.accountID,
          repository: "heyimcarlos/lightbulb",
          action: "create_issue",
          title: "Slice 80: denied safe-write issue",
          body: "This proposal should be held by policy metadata.",
          labels: ["ready-for-agent"],
          source: source(seeded),
          safeWritePolicy: {
            profile: {
              connector: "github",
              authorities: ["read", "comment", "label", "edit"],
            },
            pathRefs: ["packages/core/src/lightbulb.ts"],
            deniedPathPrefixes: ["packages/core"],
            deniedLabels: ["ready-for-agent"],
            risk: "high",
            maxRisk: "medium",
          },
          now,
        })
        const metadata = safeWriteMetadata(result.item)
        const projected = yield* lightbulb.projectHumanInbox({ accountID: seeded.accountID, now: now + 1 })

        expect(result.item.status).toBe("held")
        expect(result.item.holdReasons).toEqual([
          "safe_write_path_denied",
          "safe_write_label_denied",
          "safe_write_risk_denied",
        ])
        expect(metadata.handle).toBeString()
        expect(metadata.connector).toBe("github")
        expect(metadata.required_authority).toBe("edit")
        expect(metadata.hold_reasons).toEqual(result.item.holdReasons)
        expect(projected.digest.byType.conflict[0]?.source.mutationID).toBe(result.item.id)
        expect(projected.digest.byType.conflict[0]?.reason).toContain("safe_write_path_denied")
      }),
    ),
  )

  it.live("holds ready proposals at apply time when the current policy denies paths", () =>
    withLightbulb((lightbulb, database) =>
      Effect.gen(function* () {
        const seeded = yield* lightbulb.seedTracerBullet()
        const proposal = yield* lightbulb.proposeIssueMutation({
          accountID: seeded.accountID,
          repository: "heyimcarlos/lightbulb",
          action: "add_comment",
          targetIssue: target(80),
          comment: comment("safe-write-denied-path"),
          source: source(seeded),
          now,
        })
        const fake = fakeAdapter(() => ({
          status: "applied",
          summary: "Should not reach adapter.",
        }))
        const result = yield* lightbulb.runIssueMutationApplyPass({
          accountID: seeded.accountID,
          mode: "apply",
          approval: approved(),
          adapter: fake.adapter,
          safeWritePolicy: {
            profile: {
              connector: "github",
              authorities: ["read", "comment", "label", "edit"],
            },
            pathRefs: ["packages/core/src/lightbulb.ts"],
            allowedPathPrefixes: ["docs/lightbulb"],
          },
          now: now + 1,
        })
        const rows = yield* database.db
          .select()
          .from(LightbulbIssueMutationOutboxTable)
          .orderBy(asc(LightbulbIssueMutationOutboxTable.time_created))
          .all()
          .pipe(Effect.orDie)

        expect(proposal.item.status).toBe("ready")
        expect(result.outcomes).toHaveLength(1)
        expect(result.outcomes[0]?.holdReasons).toEqual(["safe_write_path_denied"])
        expect(fake.calls).toHaveLength(0)
        expect(rows[0]?.status).toBe("held")
        expect(rows[0]?.apply_result?.metadata?.safe_write_policy).toMatchObject({
          connector: "github",
          required_authority: "comment",
          hold_reasons: ["safe_write_path_denied"],
        })
      }),
    ),
  )

  it.live("uses adapter capability profiles as an apply-time safe-write gate", () =>
    withLightbulb((lightbulb) =>
      Effect.gen(function* () {
        const seeded = yield* lightbulb.seedTracerBullet()
        yield* lightbulb.proposeIssueMutation({
          accountID: seeded.accountID,
          repository: "heyimcarlos/lightbulb",
          action: "add_label",
          targetIssue: target(80),
          addLabels: ["enhancement"],
          source: source(seeded),
          now,
        })
        const fake = fakeAdapter(() => ({
          status: "applied",
          summary: "Should not reach adapter.",
        }), {
          connector: "github-read-comment-only",
          authorities: ["read", "comment"],
        })
        const result = yield* lightbulb.runIssueMutationApplyPass({
          accountID: seeded.accountID,
          mode: "apply",
          approval: approved(),
          adapter: fake.adapter,
          now: now + 1,
        })

        expect(result.outcomes[0]?.holdReasons).toEqual(["unsupported_adapter_capability"])
        expect(fake.calls).toHaveLength(0)
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

function fakeAdapter(
  result: (action: IssueMutationApplyAction) => IssueMutationApplyAdapterResult,
  capabilityProfile?: SafeWritePolicyInput["profile"],
) {
  const calls: IssueMutationApplyAction[] = []
  return {
    calls,
    adapter: {
      capabilities: ["create_issue", "edit_issue", "add_label", "remove_label", "add_comment"],
      ...(capabilityProfile ? { capabilityProfile } : {}),
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
    approvalHandle: "lightbulb:approval:safe-write",
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

function target(number: number): Lightbulb.IssueMutationTargetIssue {
  return {
    number,
    url: "https://github.com/heyimcarlos/lightbulb/issues/" + number,
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

function safeWriteMetadata(item: Lightbulb.IssueMutationOutboxItem) {
  const metadata = item.metadata?.safe_write_policy
  if (typeof metadata !== "object" || metadata === null || Array.isArray(metadata)) {
    throw new Error("missing safe-write metadata")
  }
  return metadata as Record<string, unknown>
}
