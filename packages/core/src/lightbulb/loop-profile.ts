import { and, eq } from "drizzle-orm"
import { Effect } from "effect"
import type { Database } from "../database/database"
import type { Lightbulb } from "../lightbulb"
import { LightbulbEventTable, LightbulbGoalTable, LightbulbLoopTable } from "./sql"

export type LoopProfileID = string

export type LoopProfileBudgetEnvelope = {
  readonly status: "open" | "held"
  readonly maxRunsPerDay: number
  readonly maxTokens: number
  readonly maxCostUsd: number
  readonly maxContextTokens: number
  readonly holdReason?: string
}

export type LoopProfileScheduleEnvelope = {
  readonly enabled: boolean
  readonly cadenceMs: number
  readonly nextDueAt: number | null
}

export type LoopProfileSchedulePolicy = {
  readonly enabled: boolean
  readonly cadenceMs: number
}

export type LoopProfileBudgetPolicy = LoopProfileBudgetEnvelope

export type LoopProfileDefaultPolicy = {
  readonly schedule: LoopProfileSchedulePolicy
  readonly budget: LoopProfileBudgetPolicy
}

export type LoopProfileScheduleOverride = {
  readonly enabled?: boolean
  readonly cadenceMs?: number
}

export type LoopProfileBudgetOverride = {
  readonly status?: "open" | "held"
  readonly maxRunsPerDay?: number
  readonly maxTokens?: number
  readonly maxCostUsd?: number
  readonly maxContextTokens?: number
  readonly holdReason?: string
}

export type LoopProfileDefinition = {
  readonly profileID: LoopProfileID
  readonly kind: Lightbulb.LoopKind
  readonly summary: string
  readonly schedule?: LoopProfileScheduleOverride
  readonly budget?: LoopProfileBudgetOverride
}

export type LoopProfileGoalRef = {
  readonly accountID: Lightbulb.AccountID
  readonly goalID: Lightbulb.GoalID
}

export type LoopProfileGoalSnapshot = {
  readonly id: Lightbulb.GoalID
  readonly accountID: Lightbulb.AccountID
  readonly status: Lightbulb.GoalStatus
}

export type LoopProfileStoredLoop = {
  readonly id: Lightbulb.LoopID
  readonly accountID: Lightbulb.AccountID
  readonly goalID: Lightbulb.GoalID
  readonly kind: Lightbulb.LoopKind
  readonly status: Lightbulb.LoopStatus
  readonly summary: string
  readonly metadata: Record<string, unknown> | null
}

export type LoopProfileCreateInput = {
  readonly loopID: Lightbulb.LoopID
  readonly accountID: Lightbulb.AccountID
  readonly goalID: Lightbulb.GoalID
  readonly kind: Lightbulb.LoopKind
  readonly status: Lightbulb.LoopStatus
  readonly summary: string
  readonly metadata: Record<string, unknown>
  readonly now: number
  readonly profileID: LoopProfileID
}

export type LoopProfileUpdateInput = {
  readonly loopID: Lightbulb.LoopID
  readonly accountID: Lightbulb.AccountID
  readonly goalID: Lightbulb.GoalID
  readonly kind: Lightbulb.LoopKind
  readonly status: Lightbulb.LoopStatus
  readonly summary: string
  readonly metadata: Record<string, unknown>
  readonly now: number
}

export type LoopProfileStorage = {
  readonly readGoal: (input: LoopProfileGoalRef) => Effect.Effect<LoopProfileGoalSnapshot | undefined>
  readonly listLoops: (input: LoopProfileGoalRef) => Effect.Effect<readonly LoopProfileStoredLoop[]>
  readonly createLoop: (input: LoopProfileCreateInput) => Effect.Effect<LoopProfileStoredLoop>
  readonly updateLoop: (input: LoopProfileUpdateInput) => Effect.Effect<LoopProfileStoredLoop>
}

export type LoopProfileBootstrapInput = LoopProfileGoalRef & {
  readonly profiles: readonly LoopProfileDefinition[]
  readonly defaultPolicy: LoopProfileDefaultPolicy
  readonly now: number
  readonly storage: LoopProfileStorage
}

export type LoopProfileBootstrapServiceInput = LoopProfileGoalRef & {
  readonly profiles: readonly LoopProfileDefinition[]
  readonly defaultPolicy: LoopProfileDefaultPolicy
  readonly now: number
}

export type LoopProfileOutcome = "created" | "adopted" | "skipped" | "held" | "invalid"

export type LoopProfileReason =
  | "missing_goal"
  | "goal_not_active"
  | "profile_disabled"
  | "budget_held"
  | "custom_policy"
  | "invalid_profile_id"
  | "duplicate_profile_id"
  | "invalid_loop_kind"
  | "invalid_summary"
  | "invalid_cadence"
  | "invalid_budget"

export type LoopProfileHandle = {
  readonly profileID: LoopProfileID
  readonly loopID: Lightbulb.LoopID | null
  readonly kind: Lightbulb.LoopKind | null
  readonly outcome: LoopProfileOutcome
  readonly reason?: LoopProfileReason
  readonly schedule: LoopProfileScheduleEnvelope | null
  readonly budget: LoopProfileBudgetEnvelope | null
  readonly summary: string
}

export type LoopProfileBootstrapSummary = LoopProfileGoalRef & {
  readonly created: readonly LoopProfileHandle[]
  readonly adopted: readonly LoopProfileHandle[]
  readonly skipped: readonly LoopProfileHandle[]
  readonly held: readonly LoopProfileHandle[]
  readonly invalid: readonly LoopProfileHandle[]
  readonly handles: readonly LoopProfileHandle[]
}

type ValidatedProfile =
  | {
      readonly valid: true
      readonly definition: LoopProfileDefinition
      readonly schedule: LoopProfileScheduleEnvelope
      readonly budget: LoopProfileBudgetEnvelope
      readonly status: Lightbulb.LoopStatus
      readonly reason?: LoopProfileReason
    }
  | {
      readonly valid: false
      readonly handle: LoopProfileHandle
    }

export type LoopProfileMetadata = {
  readonly profileID: LoopProfileID
  readonly managed: boolean
  readonly schedule: LoopProfileScheduleEnvelope & { readonly custom: boolean }
  readonly budget: LoopProfileBudgetEnvelope & { readonly custom: boolean }
}

export const standardAccountLoopProfiles: readonly LoopProfileDefinition[] = [
  {
    profileID: "discovery",
    kind: "discovery",
    summary: "Discover ready account work and produce bounded task candidates.",
  },
  {
    profileID: "implementation",
    kind: "implementation",
    summary: "Dispatch bounded implementation workers for ready account work.",
  },
  {
    profileID: "debug",
    kind: "debug",
    summary: "Reproduce and isolate failures returned by workers or gates.",
  },
  {
    profileID: "review-integration",
    kind: "integration",
    summary: "Review worker artifacts and integrate accepted changes through gates.",
  },
  {
    profileID: "status",
    kind: "status",
    summary: "Publish compact account-loop status for the operator and scheduler.",
  },
]

export const defaultAccountLoopProfilePolicy: LoopProfileDefaultPolicy = {
  schedule: {
    enabled: true,
    cadenceMs: 6 * 60 * 60 * 1000,
  },
  budget: {
    status: "open",
    maxRunsPerDay: 4,
    maxTokens: 200_000,
    maxCostUsd: 25,
    maxContextTokens: 800_000,
  },
}

const LOOP_KINDS: readonly string[] = ["discovery", "implementation", "debug", "review", "integration", "status"]

export function loopIDForProfile(goalID: Lightbulb.GoalID, profileID: LoopProfileID): Lightbulb.LoopID {
  return `lbloop_${goalID.slice("lbgoal_".length)}_${profileID.replaceAll("-", "_")}` as Lightbulb.LoopID
}

export function bootstrapLoopProfiles(input: LoopProfileBootstrapInput) {
  return Effect.gen(function* () {
    const validated = validateProfiles(input)
    const goal = yield* input.storage.readGoal(input)

    if (!goal) {
      return toSummary(
        input,
        validated.map((profile) =>
          profile.valid
            ? toHandle(profile.definition, {
                loopID: null,
                outcome: "skipped",
                reason: "missing_goal",
                schedule: profile.schedule,
                budget: profile.budget,
              })
            : profile.handle,
        ),
      )
    }

    if (goal.status !== "active") {
      return toSummary(
        input,
        validated.map((profile) =>
          profile.valid
            ? toHandle(profile.definition, {
                loopID: loopIDForProfile(input.goalID, profile.definition.profileID),
                outcome: "skipped",
                reason: "goal_not_active",
                schedule: profile.schedule,
                budget: profile.budget,
              })
            : profile.handle,
        ),
      )
    }

    const loops = yield* input.storage.listLoops(input)
    const handles = yield* Effect.forEach(validated, (profile) =>
      profile.valid ? bootstrapProfile(input, loops, profile) : Effect.succeed(profile.handle),
    )
    return toSummary(input, handles)
  })
}

export function databaseLoopProfileStorage(
  db: Database.Interface["db"],
  ids: { readonly event: () => Lightbulb.EventID },
): LoopProfileStorage {
  return {
    readGoal: (input) =>
      db
        .select()
        .from(LightbulbGoalTable)
        .where(and(eq(LightbulbGoalTable.id, input.goalID), eq(LightbulbGoalTable.account_id, input.accountID)))
        .get()
        .pipe(
          Effect.orDie,
          Effect.map((goal) =>
            goal
              ? {
                  id: goal.id,
                  accountID: goal.account_id,
                  status: goal.status,
                }
              : undefined,
          ),
        ),
    listLoops: (input) =>
      db
        .select()
        .from(LightbulbLoopTable)
        .where(and(eq(LightbulbLoopTable.account_id, input.accountID), eq(LightbulbLoopTable.goal_id, input.goalID)))
        .all()
        .pipe(Effect.orDie, Effect.map((loops) => loops.map(toStoredLoop))),
    createLoop: (input) =>
      db
        .transaction((tx) =>
          Effect.gen(function* () {
            const inserted = yield* tx
              .insert(LightbulbLoopTable)
              .values({
                id: input.loopID,
                account_id: input.accountID,
                goal_id: input.goalID,
                kind: input.kind,
                status: input.status,
                summary: input.summary,
                metadata: input.metadata,
                time_created: input.now,
                time_updated: input.now,
              })
              .onConflictDoNothing()
              .returning()
              .get()
            if (inserted) {
              yield* tx
                .insert(LightbulbEventTable)
                .values({
                  id: ids.event(),
                  account_id: input.accountID,
                  aggregate_type: "loop",
                  aggregate_id: input.loopID,
                  type: "lightbulb.loop_profile.created",
                  summary: "Created Lightbulb account loop profile.",
                  data: {
                    goal_id: input.goalID,
                    profile_id: input.profileID,
                    loop_id: input.loopID,
                  },
                  time_created: input.now,
                })
                .run()
              return toStoredLoop(inserted)
            }
            const existing = yield* tx
              .select()
              .from(LightbulbLoopTable)
              .where(
                and(
                  eq(LightbulbLoopTable.id, input.loopID),
                  eq(LightbulbLoopTable.account_id, input.accountID),
                  eq(LightbulbLoopTable.goal_id, input.goalID),
                ),
              )
              .get()
            if (existing) return toStoredLoop(existing)
            return yield* Effect.die(new Error("Lightbulb loop profile was not created or adopted"))
          }),
        )
        .pipe(Effect.orDie),
    updateLoop: (input) =>
      db
        .transaction((tx) =>
          Effect.gen(function* () {
            yield* tx
              .update(LightbulbLoopTable)
              .set({
                kind: input.kind,
                status: input.status,
                summary: input.summary,
                metadata: input.metadata,
                time_updated: input.now,
              })
              .where(
                and(
                  eq(LightbulbLoopTable.id, input.loopID),
                  eq(LightbulbLoopTable.account_id, input.accountID),
                  eq(LightbulbLoopTable.goal_id, input.goalID),
                ),
              )
              .run()
            const updated = yield* tx
              .select()
              .from(LightbulbLoopTable)
              .where(
                and(
                  eq(LightbulbLoopTable.id, input.loopID),
                  eq(LightbulbLoopTable.account_id, input.accountID),
                  eq(LightbulbLoopTable.goal_id, input.goalID),
                ),
              )
              .get()
            if (updated) return toStoredLoop(updated)
            return yield* Effect.die(new Error("Lightbulb loop profile was not updated"))
          }),
        )
        .pipe(Effect.orDie),
  }
}

function bootstrapProfile(
  input: LoopProfileBootstrapInput,
  loops: readonly LoopProfileStoredLoop[],
  profile: Extract<ValidatedProfile, { valid: true }>,
) {
  return Effect.gen(function* () {
    const loopID = loopIDForProfile(input.goalID, profile.definition.profileID)
    const existing = loops.find((loop) => loop.id === loopID)
    const outcome =
      profile.reason === "budget_held" ? "held" : profile.reason === "profile_disabled" ? "skipped" : "created"

    if (!existing) {
      const metadata = toLoopProfileMetadata(input.now, profile)
      const created = yield* input.storage.createLoop({
        loopID,
        accountID: input.accountID,
        goalID: input.goalID,
        kind: profile.definition.kind,
        status: profile.status,
        summary: profile.definition.summary,
        metadata,
        now: input.now,
        profileID: profile.definition.profileID,
      })
      return toHandle(profile.definition, {
        loopID: created.id,
        outcome,
        reason: profile.reason,
        schedule: profile.schedule,
        budget: profile.budget,
      })
    }

    const current = readLoopProfileMetadata(existing.metadata)
    if (hasCustomPolicy(existing, current, profile.definition.profileID)) {
      return toHandle(profile.definition, {
        loopID: existing.id,
        outcome: "skipped",
        reason: "custom_policy",
        schedule: current?.schedule ?? profile.schedule,
        budget: current?.budget ?? profile.budget,
      })
    }

    const refreshed = profileWithPreservedSchedule(profile, current)
    const metadata = toLoopProfileMetadata(input.now, refreshed)

    if (loopMatches(existing, refreshed, current)) {
      return toHandle(profile.definition, {
        loopID: existing.id,
        outcome: outcome === "created" ? "adopted" : outcome,
        reason: profile.reason,
        schedule: refreshed.schedule,
        budget: refreshed.budget,
      })
    }

    const updated = yield* input.storage.updateLoop({
      loopID: existing.id,
      accountID: input.accountID,
      goalID: input.goalID,
      kind: profile.definition.kind,
      status: profile.status,
      summary: profile.definition.summary,
      metadata: mergeMetadata(existing.metadata, metadata),
      now: input.now,
    })
    return toHandle(profile.definition, {
      loopID: updated.id,
      outcome: outcome === "created" ? "adopted" : outcome,
      reason: profile.reason,
      schedule: refreshed.schedule,
      budget: refreshed.budget,
    })
  })
}

function validateProfiles(input: LoopProfileBootstrapInput): readonly ValidatedProfile[] {
  const profileCounts = input.profiles.reduce((counts, profile) => {
    if (isValidProfileID(profile.profileID)) counts.set(profile.profileID, (counts.get(profile.profileID) ?? 0) + 1)
    return counts
  }, new Map<LoopProfileID, number>())

  return input.profiles.map((definition) => {
    const enabled = definition.schedule?.enabled ?? input.defaultPolicy.schedule.enabled
    const cadenceMs = definition.schedule?.cadenceMs ?? input.defaultPolicy.schedule.cadenceMs
    const schedule = {
      enabled,
      cadenceMs,
      nextDueAt: enabled ? input.now + cadenceMs : null,
    }
    const budget = {
      status: definition.budget?.status ?? input.defaultPolicy.budget.status,
      maxRunsPerDay: definition.budget?.maxRunsPerDay ?? input.defaultPolicy.budget.maxRunsPerDay,
      maxTokens: definition.budget?.maxTokens ?? input.defaultPolicy.budget.maxTokens,
      maxCostUsd: definition.budget?.maxCostUsd ?? input.defaultPolicy.budget.maxCostUsd,
      maxContextTokens: definition.budget?.maxContextTokens ?? input.defaultPolicy.budget.maxContextTokens,
      holdReason: definition.budget?.holdReason ?? input.defaultPolicy.budget.holdReason,
    }

    if (!isValidProfileID(definition.profileID)) return invalidProfile(definition, "invalid_profile_id")
    if ((profileCounts.get(definition.profileID) ?? 0) > 1) return invalidProfile(definition, "duplicate_profile_id")
    if (!LOOP_KINDS.includes(definition.kind)) return invalidProfile(definition, "invalid_loop_kind")
    if (definition.summary.trim().length === 0) return invalidProfile(definition, "invalid_summary")
    if (!Number.isSafeInteger(schedule.cadenceMs) || schedule.cadenceMs <= 0) {
      return invalidProfile(definition, "invalid_cadence")
    }
    if (
      (budget.status !== "open" && budget.status !== "held") ||
      !Number.isSafeInteger(budget.maxRunsPerDay) ||
      !Number.isSafeInteger(budget.maxTokens) ||
      !Number.isFinite(budget.maxCostUsd) ||
      !Number.isSafeInteger(budget.maxContextTokens) ||
      budget.maxRunsPerDay <= 0 ||
      budget.maxTokens <= 0 ||
      budget.maxCostUsd <= 0 ||
      budget.maxContextTokens <= 0
    ) {
      return invalidProfile(definition, "invalid_budget")
    }

    const status = !enabled ? "disabled" : budget.status === "held" ? "held" : "active"

    return {
      valid: true,
      definition,
      schedule: {
        ...schedule,
        nextDueAt: enabled && budget.status === "open" ? schedule.nextDueAt : null,
      },
      budget,
      status,
      reason: !enabled ? "profile_disabled" : budget.status === "held" ? "budget_held" : undefined,
    }
  })
}

function invalidProfile(definition: LoopProfileDefinition, reason: LoopProfileReason): ValidatedProfile {
  return {
    valid: false,
    handle: toHandle(definition, {
      loopID: null,
      outcome: "invalid",
      reason,
      schedule: null,
      budget: null,
    }),
  }
}

function toSummary(input: LoopProfileGoalRef, handles: readonly LoopProfileHandle[]): LoopProfileBootstrapSummary {
  return {
    accountID: input.accountID,
    goalID: input.goalID,
    created: handles.filter((handle) => handle.outcome === "created"),
    adopted: handles.filter((handle) => handle.outcome === "adopted"),
    skipped: handles.filter((handle) => handle.outcome === "skipped"),
    held: handles.filter((handle) => handle.outcome === "held"),
    invalid: handles.filter((handle) => handle.outcome === "invalid"),
    handles,
  }
}

function toHandle(
  definition: LoopProfileDefinition,
  input: {
    readonly loopID: Lightbulb.LoopID | null
    readonly outcome: LoopProfileOutcome
    readonly reason?: LoopProfileReason
    readonly schedule: LoopProfileScheduleEnvelope | null
    readonly budget: LoopProfileBudgetEnvelope | null
  },
): LoopProfileHandle {
  return {
    profileID: definition.profileID,
    loopID: input.loopID,
    kind: LOOP_KINDS.includes(definition.kind) ? definition.kind : null,
    outcome: input.outcome,
    reason: input.reason,
    schedule: input.schedule,
    budget: input.budget,
    summary: definition.summary,
  }
}

function isValidProfileID(profileID: LoopProfileID) {
  return /^[a-z][a-z0-9-]{1,48}$/.test(profileID)
}

function toLoopProfileMetadata(
  now: number,
  profile: Extract<ValidatedProfile, { valid: true }>,
): Record<string, unknown> {
  return {
    loop_profile: {
      profile_id: profile.definition.profileID,
      managed: true,
      schedule: {
        enabled: profile.schedule.enabled,
        cadence_ms: profile.schedule.cadenceMs,
        next_due_at: profile.schedule.nextDueAt,
        custom: false,
      },
      budget: {
        status: profile.budget.status,
        max_runs_per_day: profile.budget.maxRunsPerDay,
        max_tokens: profile.budget.maxTokens,
        max_cost_usd: profile.budget.maxCostUsd,
        max_context_tokens: profile.budget.maxContextTokens,
        hold_reason: profile.budget.holdReason,
        custom: false,
      },
      bootstrapped_at: now,
      refreshed_at: now,
    },
  }
}

function mergeMetadata(existing: Record<string, unknown> | null, next: Record<string, unknown>) {
  return {
    ...(isRecord(existing) ? existing : {}),
    ...next,
  }
}

function hasCustomPolicy(
  loop: LoopProfileStoredLoop,
  current: LoopProfileMetadata | undefined,
  profileID: LoopProfileID,
) {
  if (!current) return metadataHasPolicy(loop.metadata)
  if (current.profileID !== profileID) return true
  return !current.managed || current.schedule.custom || current.budget.custom
}

function metadataHasPolicy(metadata: Record<string, unknown> | null) {
  if (!isRecord(metadata)) return false
  return isRecord(metadata.schedule) || isRecord(metadata.budget) || isRecord(metadata.loop_profile)
}

function loopMatches(
  loop: LoopProfileStoredLoop,
  profile: Extract<ValidatedProfile, { valid: true }>,
  current: LoopProfileMetadata | undefined,
) {
  if (!current) return false
  return (
    loop.kind === profile.definition.kind &&
    loop.status === profile.status &&
    loop.summary === profile.definition.summary &&
    current.profileID === profile.definition.profileID &&
    current.schedule.enabled === profile.schedule.enabled &&
    current.schedule.cadenceMs === profile.schedule.cadenceMs &&
    current.schedule.nextDueAt === profile.schedule.nextDueAt &&
    current.budget.status === profile.budget.status &&
    current.budget.maxRunsPerDay === profile.budget.maxRunsPerDay &&
    current.budget.maxTokens === profile.budget.maxTokens &&
    current.budget.maxCostUsd === profile.budget.maxCostUsd &&
    current.budget.maxContextTokens === profile.budget.maxContextTokens &&
    current.budget.holdReason === profile.budget.holdReason
  )
}

function profileWithPreservedSchedule(
  profile: Extract<ValidatedProfile, { valid: true }>,
  current: LoopProfileMetadata | undefined,
): Extract<ValidatedProfile, { valid: true }> {
  if (!current || current.profileID !== profile.definition.profileID) return profile
  if (
    loopBudgetMatches(current.budget, profile.budget) &&
    current.schedule.enabled === profile.schedule.enabled &&
    current.schedule.cadenceMs === profile.schedule.cadenceMs
  ) {
    return {
      ...profile,
      schedule: {
        enabled: current.schedule.enabled,
        cadenceMs: current.schedule.cadenceMs,
        nextDueAt: current.schedule.nextDueAt,
      },
    }
  }
  return profile
}

function loopBudgetMatches(current: LoopProfileMetadata["budget"], next: LoopProfileBudgetEnvelope) {
  return (
    current.status === next.status &&
    current.maxRunsPerDay === next.maxRunsPerDay &&
    current.maxTokens === next.maxTokens &&
    current.maxCostUsd === next.maxCostUsd &&
    current.maxContextTokens === next.maxContextTokens &&
    current.holdReason === next.holdReason
  )
}

export function readLoopProfileMetadata(
  metadata: Record<string, unknown> | null,
): LoopProfileMetadata | undefined {
  const loopProfile = isRecord(metadata) ? metadata.loop_profile : undefined
  if (!isRecord(loopProfile)) return
  const schedule = isRecord(loopProfile.schedule) ? loopProfile.schedule : undefined
  const budget = isRecord(loopProfile.budget) ? loopProfile.budget : undefined
  if (!schedule || !budget || typeof loopProfile.profile_id !== "string") return
  if (
    typeof schedule.enabled !== "boolean" ||
    typeof schedule.cadence_ms !== "number" ||
    (typeof schedule.next_due_at !== "number" && schedule.next_due_at !== null)
  ) {
    return
  }
  if (
    (budget.status !== "open" && budget.status !== "held") ||
    typeof budget.max_runs_per_day !== "number" ||
    typeof budget.max_tokens !== "number" ||
    typeof budget.max_cost_usd !== "number" ||
    typeof budget.max_context_tokens !== "number"
  ) {
    return
  }

  return {
    profileID: loopProfile.profile_id,
    managed: loopProfile.managed === true,
    schedule: {
      enabled: schedule.enabled,
      cadenceMs: schedule.cadence_ms,
      nextDueAt: schedule.next_due_at,
      custom: schedule.custom === true,
    },
    budget: {
      status: budget.status,
      maxRunsPerDay: budget.max_runs_per_day,
      maxTokens: budget.max_tokens,
      maxCostUsd: budget.max_cost_usd,
      maxContextTokens: budget.max_context_tokens,
      holdReason: typeof budget.hold_reason === "string" ? budget.hold_reason : undefined,
      custom: budget.custom === true,
    },
  }
}

function toStoredLoop(row: typeof LightbulbLoopTable.$inferSelect): LoopProfileStoredLoop {
  return {
    id: row.id,
    accountID: row.account_id,
    goalID: row.goal_id,
    kind: row.kind,
    status: row.status,
    summary: row.summary,
    metadata: row.metadata ?? null,
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
