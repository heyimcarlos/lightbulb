import { and, asc, eq } from "drizzle-orm"
import { Effect, Schema } from "effect"
import type { Database } from "../database/database"
import type { Lightbulb } from "../lightbulb"
import { readLoopProfileMetadata } from "./loop-profile"
import { LightbulbBudgetUsageTable, LightbulbLoopTable, LightbulbRunTable, LightbulbWorkerTable } from "./sql"

const DAY_MS = 24 * 60 * 60 * 1000

export class BudgetUsageRejected extends Schema.TaggedErrorClass<BudgetUsageRejected>()(
  "Lightbulb.BudgetUsageRejected",
  {
    reason: Schema.String,
  },
) {
  override get message() {
    return this.reason
  }
}

export type BudgetUsageArtifactHandleInput = {
  readonly id?: Lightbulb.ArtifactID
  readonly uri: string
  readonly summary?: string
}

export type BudgetUsageSourceInput = {
  readonly kind: Lightbulb.BudgetUsageSourceKind
  readonly issueRef?: string
  readonly artifactHandle?: BudgetUsageArtifactHandleInput
  readonly idempotencyKey?: string
}

export type BudgetUsageServiceInput = {
  readonly accountID: Lightbulb.AccountID
  readonly goalID: Lightbulb.GoalID
  readonly loopID: Lightbulb.LoopID
  readonly runID: Lightbulb.RunID
  readonly workerID?: Lightbulb.WorkerID
  readonly source: BudgetUsageSourceInput
  readonly costUnits?: number
  readonly tokenUnits?: number
  readonly contextUnits?: number
  readonly approvalCount?: number
  readonly usageAt?: number
  readonly now?: number
}

export type BudgetUsageInput = Omit<BudgetUsageServiceInput, "now"> & {
  readonly now: number
}

export type BudgetUsageSourceHandle = {
  readonly kind: Lightbulb.BudgetUsageSourceKind
  readonly idempotencyKey: string
  readonly issueRef: string | null
  readonly artifactHandle: {
    readonly id: Lightbulb.ArtifactID | null
    readonly uri: string
    readonly summary: string | null
  } | null
}

export type BudgetUsageEntry = {
  readonly id: Lightbulb.BudgetUsageID
  readonly accountID: Lightbulb.AccountID
  readonly goalID: Lightbulb.GoalID
  readonly loopID: Lightbulb.LoopID
  readonly runID: Lightbulb.RunID
  readonly workerID: Lightbulb.WorkerID | null
  readonly source: BudgetUsageSourceHandle
  readonly costUnits: number
  readonly tokenUnits: number
  readonly contextUnits: number
  readonly approvalCount: number
  readonly usageAt: number
  readonly timeCreated: number
  readonly timeUpdated: number
}

export type LoopBudgetUnknownReason = "budget_profile_missing"
export type LoopBudgetExhaustedReason =
  | "daily_run_budget_exhausted"
  | "token_budget_exhausted"
  | "cost_budget_exhausted"
  | "context_budget_exhausted"
  | "approval_budget_exhausted"

export type LoopBudgetReason = LoopBudgetUnknownReason | LoopBudgetExhaustedReason | "budget_held"

export type LoopBudgetUsageUnits = {
  readonly runsStartedToday: number
  readonly costUnits: number
  readonly tokenUnits: number
  readonly contextUnits: number
  readonly approvalCount: number
}

export type LoopBudgetRemainingUnits = {
  readonly runsToday: number | null
  readonly costUnits: number | null
  readonly tokenUnits: number | null
  readonly contextUnits: number | null
  readonly approvalCount: number | null
}

export type LoopBudgetLimits = {
  readonly maxRunsPerDay: number
  readonly maxCostUnits: number
  readonly maxTokenUnits: number
  readonly maxContextUnits: number
  readonly maxApprovals: number | null
}

export type LoopBudgetReadModel = {
  readonly accountID: Lightbulb.AccountID
  readonly goalID: Lightbulb.GoalID
  readonly loopID: Lightbulb.LoopID
  readonly status: "open" | "held" | "unknown"
  readonly state: "open" | "held" | "exhausted" | "unknown"
  readonly reason: LoopBudgetReason | string | null
  readonly holdReason: LoopBudgetReason | string | null
  readonly exhausted: boolean
  readonly exhaustedReasons: readonly LoopBudgetExhaustedReason[]
  readonly unknownReasons: readonly LoopBudgetUnknownReason[]
  readonly used: LoopBudgetUsageUnits
  readonly remaining: LoopBudgetRemainingUnits
  readonly limits: LoopBudgetLimits | null
  readonly resetsAt: number
}

export type BudgetUsageRecordResult = {
  readonly outcome: "recorded" | "duplicate"
  readonly entry: BudgetUsageEntry
  readonly budget: LoopBudgetReadModel
}

export type ReadLoopBudgetInput = {
  readonly accountID: Lightbulb.AccountID
  readonly loopID: Lightbulb.LoopID
  readonly now: number
}

export type ReadAccountLoopBudgetsInput = {
  readonly accountID: Lightbulb.AccountID
  readonly now: number
}

export type LoopBudgetStoredLoop = Pick<
  typeof LightbulbLoopTable.$inferSelect,
  "id" | "account_id" | "goal_id" | "status" | "metadata"
>

export type LoopBudgetStoredRun = Pick<typeof LightbulbRunTable.$inferSelect, "loop_id" | "started_at">

export type LoopBudgetStoredUsage = Pick<
  typeof LightbulbBudgetUsageTable.$inferSelect,
  "loop_id" | "cost_units" | "token_units" | "context_units" | "approval_count" | "usage_at"
>

export function recordBudgetUsageInDb(
  db: Database.Interface["db"],
  input: BudgetUsageInput,
  ids: { readonly usage: () => Lightbulb.BudgetUsageID },
): Effect.Effect<BudgetUsageRecordResult, BudgetUsageRejected> {
  return Effect.gen(function* () {
    const rejected = validateBudgetUsageInput(input)
    if (rejected) return yield* Effect.fail(new BudgetUsageRejected({ reason: rejected }))

    yield* resolveBudgetUsageTarget(db, input)
    const idempotencyKey = budgetUsageIdempotencyKey(input)
    const existing = yield* db
      .select()
      .from(LightbulbBudgetUsageTable)
      .where(
        and(
          eq(LightbulbBudgetUsageTable.account_id, input.accountID),
          eq(LightbulbBudgetUsageTable.idempotency_key, idempotencyKey),
        ),
      )
      .get()
      .pipe(Effect.orDie)

    if (existing) {
      const budget = yield* readLoopBudgetInDb(db, { accountID: input.accountID, loopID: input.loopID, now: input.now })
      if (!budget) return yield* Effect.fail(new BudgetUsageRejected({ reason: "budget usage loop was not found" }))
      return { outcome: "duplicate" as const, entry: toBudgetUsageEntry(existing), budget }
    }

    const inserted = yield* db
      .insert(LightbulbBudgetUsageTable)
      .values({
        id: ids.usage(),
        account_id: input.accountID,
        goal_id: input.goalID,
        loop_id: input.loopID,
        run_id: input.runID,
        worker_id: input.workerID,
        source_kind: input.source.kind,
        idempotency_key: idempotencyKey,
        source_issue_ref: input.source.issueRef?.trim() ?? null,
        source_artifact_id: input.source.artifactHandle?.id ?? null,
        source_artifact_uri: input.source.artifactHandle?.uri.trim() ?? null,
        source_artifact_summary: input.source.artifactHandle?.summary?.trim() ?? null,
        cost_units: input.costUnits ?? 0,
        token_units: input.tokenUnits ?? 0,
        context_units: input.contextUnits ?? 0,
        approval_count: input.approvalCount ?? 0,
        usage_at: input.usageAt ?? input.now,
        time_created: input.now,
        time_updated: input.now,
      })
      .returning()
      .get()
      .pipe(Effect.orDie)
    const budget = yield* readLoopBudgetInDb(db, { accountID: input.accountID, loopID: input.loopID, now: input.now })
    if (!budget) return yield* Effect.fail(new BudgetUsageRejected({ reason: "budget usage loop was not found" }))
    return { outcome: "recorded" as const, entry: toBudgetUsageEntry(inserted), budget }
  })
}

export function readLoopBudgetInDb(db: Database.Interface["db"], input: ReadLoopBudgetInput) {
  return Effect.gen(function* () {
    const loop = yield* db
      .select()
      .from(LightbulbLoopTable)
      .where(and(eq(LightbulbLoopTable.account_id, input.accountID), eq(LightbulbLoopTable.id, input.loopID)))
      .get()
      .pipe(Effect.orDie)
    if (!loop) return

    const runs = yield* db
      .select({
        loop_id: LightbulbRunTable.loop_id,
        started_at: LightbulbRunTable.started_at,
      })
      .from(LightbulbRunTable)
      .where(and(eq(LightbulbRunTable.account_id, input.accountID), eq(LightbulbRunTable.loop_id, input.loopID)))
      .orderBy(asc(LightbulbRunTable.started_at))
      .all()
      .pipe(Effect.orDie)
    const usage = yield* db
      .select({
        loop_id: LightbulbBudgetUsageTable.loop_id,
        cost_units: LightbulbBudgetUsageTable.cost_units,
        token_units: LightbulbBudgetUsageTable.token_units,
        context_units: LightbulbBudgetUsageTable.context_units,
        approval_count: LightbulbBudgetUsageTable.approval_count,
        usage_at: LightbulbBudgetUsageTable.usage_at,
      })
      .from(LightbulbBudgetUsageTable)
      .where(and(eq(LightbulbBudgetUsageTable.account_id, input.accountID), eq(LightbulbBudgetUsageTable.loop_id, input.loopID)))
      .orderBy(asc(LightbulbBudgetUsageTable.usage_at))
      .all()
      .pipe(Effect.orDie)

    return rollupLoopBudget({ loop, runs, usage, now: input.now })
  })
}

export function readAccountLoopBudgetsInDb(db: Database.Interface["db"], input: ReadAccountLoopBudgetsInput) {
  return Effect.gen(function* () {
    const loops = yield* db
      .select()
      .from(LightbulbLoopTable)
      .where(eq(LightbulbLoopTable.account_id, input.accountID))
      .orderBy(asc(LightbulbLoopTable.time_created))
      .all()
      .pipe(Effect.orDie)
    const runs = yield* db
      .select({
        loop_id: LightbulbRunTable.loop_id,
        started_at: LightbulbRunTable.started_at,
      })
      .from(LightbulbRunTable)
      .where(eq(LightbulbRunTable.account_id, input.accountID))
      .orderBy(asc(LightbulbRunTable.started_at))
      .all()
      .pipe(Effect.orDie)
    const usage = yield* db
      .select({
        loop_id: LightbulbBudgetUsageTable.loop_id,
        cost_units: LightbulbBudgetUsageTable.cost_units,
        token_units: LightbulbBudgetUsageTable.token_units,
        context_units: LightbulbBudgetUsageTable.context_units,
        approval_count: LightbulbBudgetUsageTable.approval_count,
        usage_at: LightbulbBudgetUsageTable.usage_at,
      })
      .from(LightbulbBudgetUsageTable)
      .where(eq(LightbulbBudgetUsageTable.account_id, input.accountID))
      .orderBy(asc(LightbulbBudgetUsageTable.usage_at))
      .all()
      .pipe(Effect.orDie)

    return loops.map((loop) => rollupLoopBudget({ loop, runs, usage, now: input.now }))
  })
}

export function rollupLoopBudget(input: {
  readonly loop: LoopBudgetStoredLoop
  readonly runs: readonly LoopBudgetStoredRun[]
  readonly usage: readonly LoopBudgetStoredUsage[]
  readonly now: number
}): LoopBudgetReadModel {
  const date = new Date(input.now)
  const dayStart = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  const used = {
    runsStartedToday: input.runs.filter(
      (run) => run.loop_id === input.loop.id && run.started_at >= dayStart && run.started_at <= input.now,
    ).length,
    costUnits: sumUsage(input, "cost_units", dayStart),
    tokenUnits: sumUsage(input, "token_units", dayStart),
    contextUnits: sumUsage(input, "context_units", dayStart),
    approvalCount: sumUsage(input, "approval_count", dayStart),
  }
  const profile = readLoopProfileMetadata(input.loop.metadata ?? null)

  if (!profile) {
    return {
      accountID: input.loop.account_id,
      goalID: input.loop.goal_id,
      loopID: input.loop.id,
      status: "unknown",
      state: "unknown",
      reason: "budget_profile_missing",
      holdReason: "budget_profile_missing",
      exhausted: false,
      exhaustedReasons: [],
      unknownReasons: ["budget_profile_missing"],
      used,
      remaining: {
        runsToday: null,
        costUnits: null,
        tokenUnits: null,
        contextUnits: null,
        approvalCount: null,
      },
      limits: null,
      resetsAt: dayStart + DAY_MS,
    }
  }

  const limits = {
    maxRunsPerDay: profile.budget.maxRunsPerDay,
    maxCostUnits: profile.budget.maxCostUsd,
    maxTokenUnits: profile.budget.maxTokens,
    maxContextUnits: profile.budget.maxContextTokens,
    maxApprovals: profile.budget.maxApprovals ?? null,
  }
  const exhaustedReasons = [
    used.runsStartedToday >= limits.maxRunsPerDay ? "daily_run_budget_exhausted" : null,
    used.tokenUnits >= limits.maxTokenUnits ? "token_budget_exhausted" : null,
    used.costUnits >= limits.maxCostUnits ? "cost_budget_exhausted" : null,
    used.contextUnits >= limits.maxContextUnits ? "context_budget_exhausted" : null,
    limits.maxApprovals !== null && used.approvalCount >= limits.maxApprovals ? "approval_budget_exhausted" : null,
  ].filter((reason): reason is LoopBudgetExhaustedReason => reason !== null)
  const heldReason = profile.budget.status === "held" ? profile.budget.holdReason ?? "budget_held" : null
  const holdReason = heldReason ?? exhaustedReasons[0] ?? null

  return {
    accountID: input.loop.account_id,
    goalID: input.loop.goal_id,
    loopID: input.loop.id,
    status: holdReason ? "held" : "open",
    state: exhaustedReasons.length > 0 ? "exhausted" : heldReason ? "held" : "open",
    reason: holdReason,
    holdReason,
    exhausted: exhaustedReasons.length > 0,
    exhaustedReasons,
    unknownReasons: [],
    used,
    remaining: {
      runsToday: Math.max(0, limits.maxRunsPerDay - used.runsStartedToday),
      costUnits: Math.max(0, limits.maxCostUnits - used.costUnits),
      tokenUnits: Math.max(0, limits.maxTokenUnits - used.tokenUnits),
      contextUnits: Math.max(0, limits.maxContextUnits - used.contextUnits),
      approvalCount: limits.maxApprovals === null ? null : Math.max(0, limits.maxApprovals - used.approvalCount),
    },
    limits,
    resetsAt: dayStart + DAY_MS,
  }
}

function validateBudgetUsageInput(input: BudgetUsageInput) {
  if (!isSourceKind(input.source.kind)) return "budget usage source kind is invalid"
  if (input.source.idempotencyKey !== undefined && !input.source.idempotencyKey.trim())
    return "budget usage idempotency key must not be empty"
  if (input.source.issueRef !== undefined && !input.source.issueRef.trim()) return "budget usage issue ref must not be empty"
  if (input.source.artifactHandle !== undefined && !input.source.artifactHandle.uri.trim())
    return "budget usage artifact uri must not be empty"
  if (!input.source.issueRef && !input.source.artifactHandle) return "budget usage source issue or artifact handle is required"
  if (input.usageAt !== undefined && (!Number.isSafeInteger(input.usageAt) || input.usageAt < 0))
    return "budget usage timestamp must be a non-negative safe integer"

  const invalidUnit = [
    ["costUnits", input.costUnits],
    ["tokenUnits", input.tokenUnits],
    ["contextUnits", input.contextUnits],
    ["approvalCount", input.approvalCount],
  ] as const
  const invalid = invalidUnit.find((entry) => entry[1] !== undefined && (!Number.isFinite(entry[1]) || entry[1] < 0))
  if (invalid) return "budget usage " + invalid[0] + " must be a non-negative finite number"
  if (input.tokenUnits !== undefined && !Number.isSafeInteger(input.tokenUnits))
    return "budget usage tokenUnits must be a safe integer"
  if (input.contextUnits !== undefined && !Number.isSafeInteger(input.contextUnits))
    return "budget usage contextUnits must be a safe integer"
  if (input.approvalCount !== undefined && !Number.isSafeInteger(input.approvalCount))
    return "budget usage approvalCount must be a safe integer"
  return
}

function resolveBudgetUsageTarget(db: Database.Interface["db"], input: BudgetUsageInput) {
  return Effect.gen(function* () {
    const loop = yield* db
      .select()
      .from(LightbulbLoopTable)
      .where(and(eq(LightbulbLoopTable.account_id, input.accountID), eq(LightbulbLoopTable.id, input.loopID)))
      .get()
      .pipe(Effect.orDie)
    if (!loop) return yield* Effect.fail(new BudgetUsageRejected({ reason: "budget usage loop was not found" }))
    if (loop.goal_id !== input.goalID)
      return yield* Effect.fail(new BudgetUsageRejected({ reason: "budget usage loop does not belong to goal" }))

    const run = yield* db
      .select()
      .from(LightbulbRunTable)
      .where(and(eq(LightbulbRunTable.account_id, input.accountID), eq(LightbulbRunTable.id, input.runID)))
      .get()
      .pipe(Effect.orDie)
    if (!run) return yield* Effect.fail(new BudgetUsageRejected({ reason: "budget usage run was not found" }))
    if (run.loop_id !== input.loopID)
      return yield* Effect.fail(new BudgetUsageRejected({ reason: "budget usage run does not belong to loop" }))

    if (!input.workerID) return
    const worker = yield* db
      .select()
      .from(LightbulbWorkerTable)
      .where(and(eq(LightbulbWorkerTable.account_id, input.accountID), eq(LightbulbWorkerTable.id, input.workerID)))
      .get()
      .pipe(Effect.orDie)
    if (!worker) return yield* Effect.fail(new BudgetUsageRejected({ reason: "budget usage worker was not found" }))
    if (worker.run_id !== input.runID)
      return yield* Effect.fail(new BudgetUsageRejected({ reason: "budget usage worker does not belong to run" }))
  })
}

function budgetUsageIdempotencyKey(input: BudgetUsageInput) {
  if (input.source.idempotencyKey?.trim()) return input.source.idempotencyKey.trim()
  const sourceKey = input.source.artifactHandle
    ? input.source.artifactHandle.id ?? input.source.artifactHandle.uri.trim()
    : input.source.issueRef?.trim()
  return [input.source.kind, input.runID, input.workerID ?? "no-worker", sourceKey].join(":")
}

function toBudgetUsageEntry(row: typeof LightbulbBudgetUsageTable.$inferSelect): BudgetUsageEntry {
  return {
    id: row.id,
    accountID: row.account_id,
    goalID: row.goal_id,
    loopID: row.loop_id,
    runID: row.run_id,
    workerID: row.worker_id,
    source: {
      kind: row.source_kind,
      idempotencyKey: row.idempotency_key,
      issueRef: row.source_issue_ref,
      artifactHandle: row.source_artifact_uri
        ? {
            id: row.source_artifact_id,
            uri: row.source_artifact_uri,
            summary: row.source_artifact_summary,
          }
        : null,
    },
    costUnits: row.cost_units,
    tokenUnits: row.token_units,
    contextUnits: row.context_units,
    approvalCount: row.approval_count,
    usageAt: row.usage_at,
    timeCreated: row.time_created,
    timeUpdated: row.time_updated,
  }
}

function sumUsage(input: {
  readonly loop: LoopBudgetStoredLoop
  readonly usage: readonly LoopBudgetStoredUsage[]
  readonly now: number
}, key: "cost_units" | "token_units" | "context_units" | "approval_count", dayStart: number) {
  return input.usage
    .filter((usage) => usage.loop_id === input.loop.id && usage.usage_at >= dayStart && usage.usage_at <= input.now)
    .map((usage) => usage[key])
    .reduce((total, value) => total + value, 0)
}

function isSourceKind(value: string): value is Lightbulb.BudgetUsageSourceKind {
  return value === "worker_report" || value === "run_usage" || value === "local_report"
}
