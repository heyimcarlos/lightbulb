import path from "path"
import { describe, expect, test } from "bun:test"
import { eq } from "drizzle-orm"
import { Effect, Layer } from "effect"
import { Database } from "@opencode-ai/core/database/database"
import { Lightbulb } from "@opencode-ai/core/lightbulb"
import { LightbulbTaskPacketTable } from "@opencode-ai/core/lightbulb/sql"
import { tmpdir } from "./fixture/tmpdir"
import { it } from "./lib/effect"

const now = Date.UTC(2026, 5, 23)

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
  const database = Database.layerFromPath(path.join(directory, "lightbulb-pickup-packet.db")).pipe(Layer.fresh)
  return Layer.mergeAll(database, Lightbulb.layer.pipe(Layer.provide(database)))
}

describe("Lightbulb pickup packets", () => {
  test("parses, renders, and replaces a stable pickup packet section without duplication", () => {
    const packet = Lightbulb.createIssuePickupPacket({
      issueRef: "#74",
      issueHandle: "github:issue:74",
      title: "Structured pickup packets",
      url: "https://github.com/heyimcarlos/lightbulb/issues/74",
      updatedAt: now,
      body: issueBody(),
    })
    const rendered = Lightbulb.renderPickupPacket(packet)
    const reparsed = Lightbulb.parsePickupPacketSection(rendered, packet.source)
    if (!reparsed) throw new Error("expected rendered pickup packet to parse")
    const updated = Lightbulb.upsertPickupPacketSection(issueBody() + "\n## Acceptance criteria\n\n- done", packet)

    expect(packet).toMatchObject({
      source: {
        kind: "github_issue",
        ref: "#74",
        handle: "github:issue:74",
      },
      scope: ["pickup packet schema/read model, GitHub issue/comment rendering, and worker dispatch consumption."],
      nonGoals: ["changing the whole task-packet lifecycle", "real worker launch", "issue mutation apply"],
      blockers: ["#9 task-packet substrate and #12 issue intake should be integrated or available as stable seams."],
      affectedPackages: ["packages/core", "packages/opencode for CLI/dashboard rendering if needed."],
      routeStop: {
        name: "triage-to-worker admission",
      },
      suggestedAction: "implement schema + renderer + parser/adopter at fakeable seams.",
      preferredFirstCommand: "cd packages/core && bun test test/lightbulb-pickup-packet.test.ts",
      attemptBudget: {
        maxAttempts: 2,
        escalationRule: "agent-blocked with failing evidence.",
      },
    })
    expect(Lightbulb.renderPickupPacket(reparsed)).toBe(rendered)
    expect(updated.match(/^## Pickup packet$/gm)).toHaveLength(1)
    expect(updated).toContain("## Acceptance criteria")
    expect(JSON.stringify(packet)).not.toContain("Raw transcript")
  })

  it.live("carries parsed pickup packets from issue intake into worker dispatch", () =>
    Effect.acquireRelease(
      Effect.promise(() => tmpdir()),
      (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
    ).pipe(
      Effect.flatMap((tmp) =>
        Effect.gen(function* () {
          const lightbulb = yield* Lightbulb.Service
          const accountID = Lightbulb.AccountID.create()
          const pickupPacket = Lightbulb.createIssuePickupPacket({
            issueRef: "#74",
            issueHandle: "github:issue:74",
            title: "Structured pickup packets",
            url: "https://github.com/heyimcarlos/lightbulb/issues/74",
            updatedAt: now,
            body: issueBody(),
          })
          const intake = yield* lightbulb.ingestIssueQueueSnapshots({
            snapshots: [
              {
                accountID,
                number: 74,
                title: "Structured pickup packets",
                url: "https://github.com/heyimcarlos/lightbulb/issues/74",
                labels: ["ready-for-agent"],
                updatedAt: now,
                bodyHandle: "github:issue:74:body",
                bodySummary: "Add a structured pickup packet contract.",
                pickupPacket,
              },
            ],
          })
          const dispatch = yield* lightbulb.planWorkerDispatch({ issues: intake.routingInputs })

          expect(intake.taskPacketRequests[0]?.pickupPacket.scope).toEqual([
            "pickup packet schema/read model, GitHub issue/comment rendering, and worker dispatch consumption.",
          ])
          expect(dispatch.spawnRequests[0]?.pickupPacket).toMatchObject({
            scope: ["pickup packet schema/read model, GitHub issue/comment rendering, and worker dispatch consumption."],
            preferredFirstCommand: "cd packages/core && bun test test/lightbulb-pickup-packet.test.ts",
          })
          expect(Lightbulb.renderPickupPacket(dispatch.spawnRequests[0]?.pickupPacket ?? pickupPacket)).toContain("## Pickup packet")
          expect(Lightbulb.renderPickupPacketWorkerInstructions(dispatch.spawnRequests[0]?.pickupPacket ?? pickupPacket)).toContain(
            "Return only a compact worker report",
          )
          expect(dispatch.spawnRequests[0]?.pickupPacket.contextHandles ?? []).toEqual([])
        }).pipe(Effect.provide(layer(tmp.path))),
      ),
    ),
  )

  it.live("stores pickup packets as bounded task-packet instructions and metadata", () =>
    Effect.acquireRelease(
      Effect.promise(() => tmpdir()),
      (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
    ).pipe(
      Effect.flatMap((tmp) =>
        Effect.gen(function* () {
          const lightbulb = yield* Lightbulb.Service
          const database = yield* Database.Service
          const prepared = yield* prepareDueLoop(lightbulb)
          const packet = Lightbulb.createIssuePickupPacket({
            issueRef: "#74",
            issueHandle: "github:issue:74",
            title: "Structured pickup packets",
            url: "https://github.com/heyimcarlos/lightbulb/issues/74",
            updatedAt: now,
            body: issueBody(),
          })

          const result = yield* lightbulb.runAccountLoopTick({
            accountID: prepared.accountID,
            tickID: "pickup-packet-runner",
            now: now + 2_000,
            issues: [
              {
                accountID: prepared.accountID,
                issueRef: "#74",
                issueHandle: "github:issue:74",
                title: "Structured pickup packets",
                url: "https://github.com/heyimcarlos/lightbulb/issues/74",
                labels: ["ready-for-agent"],
                bodyHandle: "github:issue:74:body",
                bodySummary: "Compact pickup packet summary.",
                updatedAt: now,
                pickupPacket: packet,
              },
            ],
          })
          if (!result.taskPacketID) throw new Error("expected task packet")
          const stored = yield* database.db
            .select()
            .from(LightbulbTaskPacketTable)
            .where(eq(LightbulbTaskPacketTable.id, result.taskPacketID))
            .get()
            .pipe(Effect.orDie)
          if (!stored) throw new Error("expected stored task packet")

          expect(stored.instructions).toContain("Scope:\n- pickup packet schema/read model")
          expect(stored.instructions).toContain("Preferred first command: cd packages/core && bun test test/lightbulb-pickup-packet.test.ts")
          expect(stored.instructions).toContain("Return only a compact worker report")
          expect(stored.instructions).not.toContain("Raw transcript content should stay outside")
          expect(stored.metadata?.pickup_packet).toMatchObject({
            scope: ["pickup packet schema/read model, GitHub issue/comment rendering, and worker dispatch consumption."],
            routeStop: {
              name: "triage-to-worker admission",
            },
          })
          expect(JSON.stringify(stored.metadata)).not.toContain("Raw transcript content should stay outside")
        }).pipe(Effect.provide(layer(tmp.path))),
      ),
    ),
  )
})

function issueBody() {
  return `# Structured pickup packets

Raw transcript content should stay outside the bounded packet.

## Pickup packet

- Scope: pickup packet schema/read model, GitHub issue/comment rendering, and worker dispatch consumption.
- Non-goals: changing the whole task-packet lifecycle, real worker launch, issue mutation apply
- Blockers: #9 task-packet substrate and #12 issue intake should be integrated or available as stable seams.
- Affected packages: packages/core, packages/opencode for CLI/dashboard rendering if needed.
- Route stop: triage-to-worker admission
- Suggested loop action: implement schema + renderer + parser/adopter at fakeable seams.
- Risk/gates: do not embed raw issue bodies, worker transcripts, or full comments; use handles/summaries.
- Preferred first verification command: \`cd packages/core && bun test test/lightbulb-pickup-packet.test.ts\`
- Full verification commands:
  - \`cd packages/core && bun test test/lightbulb-pickup-packet.test.ts\`
  - \`cd packages/core && bun typecheck\`
  - \`git diff --check\`
- Acceptance evidence: fixture issue with ## Pickup packet becomes a bounded packet and renders back idempotently.
- Attempt budget: max 2 attempts; escalate: agent-blocked with failing evidence.
`
}

function prepareDueLoop(lightbulb: Lightbulb.Interface) {
  return Effect.gen(function* () {
    const created = yield* lightbulb.createOrAdoptGoal({
      accountName: "Pickup Packet Runner",
      title: "Pickup packet runner",
      objective: "Run one deterministic loop tick with a structured pickup packet.",
    })
    yield* lightbulb.bootstrapLoopProfiles({
      accountID: created.goal.account_id,
      goalID: created.goal.id,
      profiles: [
        {
          profileID: "pickup-packet-runner",
          kind: "implementation",
          summary: "Due pickup packet runner loop.",
          schedule: {
            cadenceMs: 1_000,
          },
        },
      ],
      defaultPolicy,
      now,
    })
    return {
      accountID: created.goal.account_id,
    }
  })
}
