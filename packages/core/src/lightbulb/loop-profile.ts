import { and, asc, eq } from "drizzle-orm"
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

export type LoopProfileRisk = "low" | "medium" | "high"

export type LoopProfileReadinessMode = "automatic" | "human_gate" | "manual"

export type LoopProfileTokenCostTier = "low" | "medium" | "high"

export type LoopProfileRegistryPhase = {
  readonly id: string
  readonly goal: string
}

export type LoopProfileRegistryMetadata = {
  readonly name: string
  readonly goal: string
  readonly cadence: string
  readonly risk: LoopProfileRisk
  readonly skills: readonly string[]
  readonly state: string
  readonly readModel: string
  readonly phases: readonly LoopProfileRegistryPhase[]
  readonly humanGates: readonly string[]
  readonly readinessMode: LoopProfileReadinessMode
  readonly tokenCostTier: LoopProfileTokenCostTier
  readonly dailyCap: number
  readonly earlyExitRequirement: string
  readonly starterRef?: string
}

export type LoopProfileInvalidFieldReason =
  | "missing_profile_metadata"
  | "invalid_profile_name"
  | "invalid_profile_goal"
  | "invalid_profile_cadence"
  | "invalid_profile_risk"
  | "invalid_profile_skills"
  | "invalid_profile_state"
  | "invalid_profile_read_model"
  | "invalid_profile_phases"
  | "invalid_profile_human_gates"
  | "invalid_readiness_mode"
  | "invalid_token_cost_tier"
  | "invalid_daily_cap"
  | "invalid_early_exit_requirement"

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
  readonly registry?: LoopProfileRegistryMetadata
  readonly schedule?: LoopProfileScheduleOverride
  readonly budget?: LoopProfileBudgetOverride
}

export type LoopProfileCompactSummary = {
  readonly profileID: LoopProfileID
  readonly loopID: Lightbulb.LoopID | null
  readonly kind: Lightbulb.LoopKind | null
  readonly name: string
  readonly goal: string
  readonly cadence: string
  readonly cadenceMs: number | null
  readonly risk: LoopProfileRisk
  readonly skills: readonly string[]
  readonly state: string
  readonly readModel: string
  readonly phases: readonly LoopProfileRegistryPhase[]
  readonly humanGates: readonly string[]
  readonly readinessMode: LoopProfileReadinessMode
  readonly tokenCostTier: LoopProfileTokenCostTier
  readonly dailyCap: number
  readonly earlyExitRequirement: string
  readonly starterRef?: string
  readonly ready: boolean
  readonly invalidProfileReasons: readonly LoopProfileInvalidFieldReason[]
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
  | "invalid_registry_metadata"
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
  readonly profile: LoopProfileCompactSummary
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
      readonly registry: LoopProfileRegistryMetadata
      readonly invalidProfileReasons: readonly LoopProfileInvalidFieldReason[]
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
  readonly registry: LoopProfileRegistryMetadata | null
  readonly invalidProfileReasons: readonly LoopProfileInvalidFieldReason[]
}

export const standardAccountLoopProfiles: readonly LoopProfileDefinition[] = [
  {
    profileID: "discovery",
    kind: "discovery",
    summary: "Discover ready account work and produce bounded task candidates.",
    registry: {
      name: "Daily triage",
      goal: "Find ready work, blockers, and candidate slices before worker dispatch.",
      cadence: "Every 6h",
      risk: "low",
      skills: ["triage", "codebase-research", "issue-slicing"],
      state: "scanning",
      readModel: "account graph, route stops, scheduler outcomes, and issue queue",
      phases: [
        { id: "scan", goal: "Read current goals, routes, blockers, and recent scheduler outcomes." },
        { id: "slice", goal: "Emit bounded candidate work items or stop when nothing is ready." },
      ],
      humanGates: ["needs-info", "ready-for-human"],
      readinessMode: "automatic",
      tokenCostTier: "medium",
      dailyCap: 4,
      earlyExitRequirement: "Exit when no blocker-free account work can be sliced.",
      starterRef: "patterns/registry.yaml#daily-triage",
    },
  },
  {
    profileID: "implementation",
    kind: "implementation",
    summary: "Dispatch bounded implementation workers for ready account work.",
    registry: {
      name: "Implementation dispatch",
      goal: "Send one bounded ready slice to a fresh worker with enough context to return artifacts.",
      cadence: "Every 6h",
      risk: "high",
      skills: ["implementation", "test-selection", "artifact-reporting"],
      state: "ready-for-agent",
      readModel: "ready route stop, context bundle manifest, and active run ledger",
      phases: [
        { id: "packet", goal: "Select one ready task packet and assemble the worker packet." },
        { id: "dispatch", goal: "Launch or record the bounded implementation assignment." },
      ],
      humanGates: ["budget", "context", "review-required"],
      readinessMode: "human_gate",
      tokenCostTier: "high",
      dailyCap: 4,
      earlyExitRequirement: "Exit before dispatch when no ready packet or unresolved gate exists.",
      starterRef: "patterns/registry.yaml#implementation",
    },
  },
  {
    profileID: "debug",
    kind: "debug",
    summary: "Reproduce and isolate failures returned by workers or gates.",
    registry: {
      name: "Failure diagnosis",
      goal: "Turn failing worker evidence into a minimal repro, diagnosis, or recovery packet.",
      cadence: "Every 6h",
      risk: "medium",
      skills: ["diagnosis", "log-reading", "regression-test-selection"],
      state: "recovery-required",
      readModel: "failed runs, stale workers, gates, and returned artifacts",
      phases: [
        { id: "reproduce", goal: "Reproduce the returned failure from durable evidence." },
        { id: "isolate", goal: "Reduce the failure into a bounded fix or escalation packet." },
      ],
      humanGates: ["needs-info", "failed-gate"],
      readinessMode: "automatic",
      tokenCostTier: "medium",
      dailyCap: 4,
      earlyExitRequirement: "Exit when no failed run, stale worker, or recovery hold is visible.",
      starterRef: "patterns/registry.yaml#debug",
    },
  },
  {
    profileID: "review-integration",
    kind: "integration",
    summary: "Review worker artifacts and integrate accepted changes through gates.",
    registry: {
      name: "PR review and integration",
      goal: "Review returned worker artifacts, verify evidence, and move accepted changes through integration gates.",
      cadence: "Every 6h",
      risk: "high",
      skills: ["code-review", "verification", "release-gating"],
      state: "review-required",
      readModel: "worker reports, artifact handles, gates, and PR review routes",
      phases: [
        { id: "review", goal: "Audit returned diffs and evidence before integration." },
        { id: "integrate", goal: "Record accepted artifacts and surface unresolved gates." },
      ],
      humanGates: ["approval", "ci", "merge"],
      readinessMode: "human_gate",
      tokenCostTier: "high",
      dailyCap: 4,
      earlyExitRequirement: "Exit when no returned artifact is ready for review or a gate blocks integration.",
      starterRef: "patterns/registry.yaml#pr-review",
    },
  },
  {
    profileID: "status",
    kind: "status",
    summary: "Publish compact account-loop status for the operator and scheduler.",
    registry: {
      name: "Status digest",
      goal: "Publish the smallest useful operator view of loop health, blockers, budgets, and next wakeups.",
      cadence: "Every 6h",
      risk: "low",
      skills: ["summarization", "audit", "scheduler-read-models"],
      state: "reporting",
      readModel: "dashboard, scheduler ticks, loop summaries, and artifact handles",
      phases: [
        { id: "summarize", goal: "Collect compact loop and scheduler read models." },
        { id: "publish", goal: "Emit an operator-safe status summary without raw worker text." },
      ],
      humanGates: [],
      readinessMode: "automatic",
      tokenCostTier: "low",
      dailyCap: 4,
      earlyExitRequirement: "Exit after publishing the bounded status digest.",
      starterRef: "patterns/registry.yaml#status",
    },
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
                registry: profile.registry,
                invalidProfileReasons: profile.invalidProfileReasons,
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
                registry: profile.registry,
                invalidProfileReasons: profile.invalidProfileReasons,
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
        .pipe(
          Effect.orDie,
          Effect.map((loops) => loops.map(toStoredLoop)),
        ),
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

export function readLoopProfileSummariesInDb(db: Database.Interface["db"], input: LoopProfileGoalRef) {
  return db
    .select()
    .from(LightbulbLoopTable)
    .where(and(eq(LightbulbLoopTable.account_id, input.accountID), eq(LightbulbLoopTable.goal_id, input.goalID)))
    .orderBy(asc(LightbulbLoopTable.time_created))
    .all()
    .pipe(
      Effect.orDie,
      Effect.map((loops) =>
        loops
          .map((loop) => toLoopProfileCompactSummary(toStoredLoop(loop)))
          .filter((profile): profile is LoopProfileCompactSummary => profile !== null),
      ),
    )
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
        registry: profile.registry,
        invalidProfileReasons: profile.invalidProfileReasons,
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
        registry: current?.registry ?? profile.registry,
        invalidProfileReasons: current?.invalidProfileReasons ?? profile.invalidProfileReasons,
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
        registry: refreshed.registry,
        invalidProfileReasons: refreshed.invalidProfileReasons,
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
      registry: refreshed.registry,
      invalidProfileReasons: refreshed.invalidProfileReasons,
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
    const registry = normalizeProfileRegistry(definition, schedule, budget)

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
    if (registry.invalidProfileReasons.length > 0) {
      return invalidProfile(definition, "invalid_registry_metadata", registry.registry, registry.invalidProfileReasons)
    }

    const status = !enabled ? "disabled" : budget.status === "held" ? "held" : "active"

    return {
      valid: true,
      definition,
      registry: registry.registry,
      invalidProfileReasons: registry.invalidProfileReasons,
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

function invalidProfile(
  definition: LoopProfileDefinition,
  reason: LoopProfileReason,
  registry?: LoopProfileRegistryMetadata,
  invalidProfileReasons: readonly LoopProfileInvalidFieldReason[] = [],
): ValidatedProfile {
  return {
    valid: false,
    handle: toHandle(definition, {
      loopID: null,
      outcome: "invalid",
      reason,
      schedule: null,
      budget: null,
      registry,
      invalidProfileReasons,
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
    readonly registry?: LoopProfileRegistryMetadata | null
    readonly invalidProfileReasons?: readonly LoopProfileInvalidFieldReason[]
  },
): LoopProfileHandle {
  const registry = input.registry ?? defaultRegistryForDefinition(definition, input.schedule, input.budget)
  const invalidProfileReasons = input.invalidProfileReasons ?? []
  return {
    profileID: definition.profileID,
    loopID: input.loopID,
    kind: LOOP_KINDS.includes(definition.kind) ? definition.kind : null,
    outcome: input.outcome,
    reason: input.reason,
    schedule: input.schedule,
    budget: input.budget,
    summary: definition.summary,
    profile: toCompactProfileSummary({
      profileID: definition.profileID,
      loopID: input.loopID,
      kind: LOOP_KINDS.includes(definition.kind) ? definition.kind : null,
      registry,
      schedule: input.schedule,
      budget: input.budget,
      invalidProfileReasons,
    }),
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
      registry: {
        name: profile.registry.name,
        goal: profile.registry.goal,
        cadence: profile.registry.cadence,
        risk: profile.registry.risk,
        skills: profile.registry.skills,
        state: profile.registry.state,
        read_model: profile.registry.readModel,
        phases: profile.registry.phases,
        human_gates: profile.registry.humanGates,
        readiness_mode: profile.registry.readinessMode,
        token_cost_tier: profile.registry.tokenCostTier,
        daily_cap: profile.registry.dailyCap,
        early_exit_requirement: profile.registry.earlyExitRequirement,
        starter_ref: profile.registry.starterRef,
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
    current.budget.holdReason === profile.budget.holdReason &&
    current.invalidProfileReasons.length === 0 &&
    loopRegistryMatches(current.registry, profile.registry)
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

function loopRegistryMatches(current: LoopProfileRegistryMetadata | null, next: LoopProfileRegistryMetadata) {
  if (!current) return false
  return (
    current.name === next.name &&
    current.goal === next.goal &&
    current.cadence === next.cadence &&
    current.risk === next.risk &&
    stringListMatches(current.skills, next.skills) &&
    current.state === next.state &&
    current.readModel === next.readModel &&
    registryPhasesMatch(current.phases, next.phases) &&
    stringListMatches(current.humanGates, next.humanGates) &&
    current.readinessMode === next.readinessMode &&
    current.tokenCostTier === next.tokenCostTier &&
    current.dailyCap === next.dailyCap &&
    current.earlyExitRequirement === next.earlyExitRequirement &&
    current.starterRef === next.starterRef
  )
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

export function readLoopProfileMetadata(metadata: Record<string, unknown> | null): LoopProfileMetadata | undefined {
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
  const registry = readStoredRegistry(loopProfile.registry)

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
    registry: registry.registry,
    invalidProfileReasons: registry.invalidProfileReasons,
  }
}

export function toLoopProfileCompactSummary(loop: LoopProfileStoredLoop): LoopProfileCompactSummary | null {
  const metadata = readLoopProfileMetadata(loop.metadata)
  if (!metadata) return null
  return toCompactProfileSummary({
    profileID: metadata.profileID,
    loopID: loop.id,
    kind: loop.kind,
    registry: metadata.registry ?? defaultRegistryForLoop(loop, metadata),
    schedule: metadata.schedule,
    budget: metadata.budget,
    invalidProfileReasons: metadata.invalidProfileReasons,
  })
}

function normalizeProfileRegistry(
  definition: LoopProfileDefinition,
  schedule: LoopProfileScheduleEnvelope,
  budget: LoopProfileBudgetEnvelope,
) {
  const fallback = defaultRegistryForDefinition(definition, schedule, budget)
  if (!definition.registry) return { registry: fallback, invalidProfileReasons: [] }
  if (!isRecord(definition.registry)) {
    return { registry: fallback, invalidProfileReasons: ["missing_profile_metadata"] as const }
  }
  return {
    registry: registryFromRecord(definition.registry, fallback),
    invalidProfileReasons: registryInvalidReasons(definition.registry),
  }
}

function readStoredRegistry(value: unknown) {
  if (!isRecord(value)) {
    return {
      registry: null,
      invalidProfileReasons: ["missing_profile_metadata"] as readonly LoopProfileInvalidFieldReason[],
    }
  }
  const invalidProfileReasons = registryInvalidReasons(value)
  return {
    registry: invalidProfileReasons.length === 0 ? registryFromRecord(value, null) : null,
    invalidProfileReasons,
  }
}

function registryInvalidReasons(registry: Record<string, unknown>): readonly LoopProfileInvalidFieldReason[] {
  return [
    ...(!nonEmptyString(registry.name) ? ["invalid_profile_name" as const] : []),
    ...(!nonEmptyString(registry.goal) ? ["invalid_profile_goal" as const] : []),
    ...(!nonEmptyString(registry.cadence) ? ["invalid_profile_cadence" as const] : []),
    ...(!isRisk(registry.risk) ? ["invalid_profile_risk" as const] : []),
    ...(!stringList(registry.skills, false) ? ["invalid_profile_skills" as const] : []),
    ...(!nonEmptyString(registry.state) ? ["invalid_profile_state" as const] : []),
    ...(!nonEmptyString(registry.readModel) && !nonEmptyString(registry.read_model)
      ? ["invalid_profile_read_model" as const]
      : []),
    ...(!registryPhases(registry.phases) ? ["invalid_profile_phases" as const] : []),
    ...(!stringList(registry.humanGates ?? registry.human_gates, true) ? ["invalid_profile_human_gates" as const] : []),
    ...(!isReadinessMode(registry.readinessMode ?? registry.readiness_mode) ? ["invalid_readiness_mode" as const] : []),
    ...(!isTokenCostTier(registry.tokenCostTier ?? registry.token_cost_tier)
      ? ["invalid_token_cost_tier" as const]
      : []),
    ...(!positiveInteger(registry.dailyCap ?? registry.daily_cap) ? ["invalid_daily_cap" as const] : []),
    ...(!nonEmptyString(registry.earlyExitRequirement ?? registry.early_exit_requirement)
      ? ["invalid_early_exit_requirement" as const]
      : []),
  ]
}

function registryFromRecord(
  registry: Record<string, unknown>,
  fallback: LoopProfileRegistryMetadata | null,
): LoopProfileRegistryMetadata {
  const readModel = registry.readModel ?? registry.read_model
  const humanGates = registry.humanGates ?? registry.human_gates
  const readinessMode = registry.readinessMode ?? registry.readiness_mode
  const tokenCostTier = registry.tokenCostTier ?? registry.token_cost_tier
  const dailyCap = registry.dailyCap ?? registry.daily_cap
  const earlyExitRequirement = registry.earlyExitRequirement ?? registry.early_exit_requirement
  const starterRef = registry.starterRef ?? registry.starter_ref
  return {
    name: nonEmptyString(registry.name) ? registry.name.trim() : (fallback?.name ?? "Loop profile"),
    goal: nonEmptyString(registry.goal) ? registry.goal.trim() : (fallback?.goal ?? "Run the loop profile."),
    cadence: nonEmptyString(registry.cadence) ? registry.cadence.trim() : (fallback?.cadence ?? "Unscheduled"),
    risk: isRisk(registry.risk) ? registry.risk : (fallback?.risk ?? "medium"),
    skills: stringList(registry.skills, false) ?? fallback?.skills ?? ["loop-profile"],
    state: nonEmptyString(registry.state) ? registry.state.trim() : (fallback?.state ?? "unknown"),
    readModel: nonEmptyString(readModel) ? readModel.trim() : (fallback?.readModel ?? "lightbulb.loop_profile"),
    phases: registryPhases(registry.phases) ?? fallback?.phases ?? [{ id: "run", goal: "Run the loop profile." }],
    humanGates: stringList(humanGates, true) ?? fallback?.humanGates ?? [],
    readinessMode: isReadinessMode(readinessMode) ? readinessMode : (fallback?.readinessMode ?? "automatic"),
    tokenCostTier: isTokenCostTier(tokenCostTier) ? tokenCostTier : (fallback?.tokenCostTier ?? "medium"),
    dailyCap: positiveInteger(dailyCap) ? dailyCap : (fallback?.dailyCap ?? 1),
    earlyExitRequirement: nonEmptyString(earlyExitRequirement)
      ? earlyExitRequirement.trim()
      : (fallback?.earlyExitRequirement ?? "Exit when the loop has no due work."),
    starterRef: nonEmptyString(starterRef) ? starterRef.trim() : fallback?.starterRef,
  }
}

function defaultRegistryForDefinition(
  definition: LoopProfileDefinition,
  schedule: LoopProfileScheduleEnvelope | null,
  budget: LoopProfileBudgetEnvelope | null,
): LoopProfileRegistryMetadata {
  const goal = definition.summary.trim() || "Run the loop profile."
  return {
    name: titleFromProfileID(definition.profileID),
    goal,
    cadence: formatCadence(schedule?.cadenceMs ?? null),
    risk: "medium",
    skills: [definition.kind],
    state: "loop_profile",
    readModel: "lightbulb.loop_profile",
    phases: [{ id: "run", goal }],
    humanGates: [],
    readinessMode: "automatic",
    tokenCostTier: "medium",
    dailyCap: budget?.maxRunsPerDay ?? 1,
    earlyExitRequirement: "Exit when the loop has no due work or a gate blocks progress.",
  }
}

function defaultRegistryForLoop(
  loop: LoopProfileStoredLoop,
  metadata: LoopProfileMetadata,
): LoopProfileRegistryMetadata {
  return {
    name: titleFromProfileID(metadata.profileID),
    goal: loop.summary,
    cadence: formatCadence(metadata.schedule.cadenceMs),
    risk: "medium",
    skills: [loop.kind],
    state: loop.status,
    readModel: "lightbulb.loop_profile",
    phases: [{ id: "run", goal: loop.summary }],
    humanGates: [],
    readinessMode: "automatic",
    tokenCostTier: "medium",
    dailyCap: metadata.budget.maxRunsPerDay,
    earlyExitRequirement: "Exit when the loop has no due work or a gate blocks progress.",
  }
}

function toCompactProfileSummary(input: {
  readonly profileID: LoopProfileID
  readonly loopID: Lightbulb.LoopID | null
  readonly kind: Lightbulb.LoopKind | null
  readonly registry: LoopProfileRegistryMetadata
  readonly schedule: LoopProfileScheduleEnvelope | null
  readonly budget: LoopProfileBudgetEnvelope | null
  readonly invalidProfileReasons: readonly LoopProfileInvalidFieldReason[]
}): LoopProfileCompactSummary {
  return {
    profileID: input.profileID,
    loopID: input.loopID,
    kind: input.kind,
    name: input.registry.name,
    goal: input.registry.goal,
    cadence: input.registry.cadence,
    cadenceMs: input.schedule?.cadenceMs ?? null,
    risk: input.registry.risk,
    skills: input.registry.skills,
    state: input.registry.state,
    readModel: input.registry.readModel,
    phases: input.registry.phases,
    humanGates: input.registry.humanGates,
    readinessMode: input.registry.readinessMode,
    tokenCostTier: input.registry.tokenCostTier,
    dailyCap: input.registry.dailyCap,
    earlyExitRequirement: input.registry.earlyExitRequirement,
    starterRef: input.registry.starterRef,
    ready:
      input.invalidProfileReasons.length === 0 && input.schedule?.enabled === true && input.budget?.status === "open",
    invalidProfileReasons: input.invalidProfileReasons,
  }
}

function titleFromProfileID(profileID: string) {
  return profileID
    .split("-")
    .filter((part) => part.length > 0)
    .map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`)
    .join(" ")
}

function formatCadence(cadenceMs: number | null) {
  if (!cadenceMs || !Number.isFinite(cadenceMs) || cadenceMs <= 0) return "Unscheduled"
  const hours = cadenceMs / (60 * 60 * 1000)
  if (Number.isInteger(hours)) return `Every ${hours}h`
  const minutes = cadenceMs / (60 * 1000)
  if (Number.isInteger(minutes)) return `Every ${minutes}m`
  return `Every ${cadenceMs}ms`
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0
}

function positiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0
}

function stringList(value: unknown, allowEmpty: boolean): readonly string[] | undefined {
  if (!Array.isArray(value)) return
  if (!allowEmpty && value.length === 0) return
  if (!value.every(nonEmptyString)) return
  return value.map((item) => item.trim())
}

function stringListMatches(current: readonly string[], next: readonly string[]) {
  return current.length === next.length && current.every((value, index) => value === next[index])
}

function registryPhases(value: unknown): readonly LoopProfileRegistryPhase[] | undefined {
  if (!Array.isArray(value) || value.length === 0) return
  if (!value.every((phase) => isRecord(phase) && nonEmptyString(phase.id) && nonEmptyString(phase.goal))) return
  return value.map((phase) => ({
    id: isRecord(phase) && nonEmptyString(phase.id) ? phase.id.trim() : "",
    goal: isRecord(phase) && nonEmptyString(phase.goal) ? phase.goal.trim() : "",
  }))
}

function registryPhasesMatch(
  current: readonly LoopProfileRegistryPhase[],
  next: readonly LoopProfileRegistryPhase[],
) {
  return (
    current.length === next.length &&
    current.every((phase, index) => phase.id === next[index]?.id && phase.goal === next[index]?.goal)
  )
}

function isRisk(value: unknown): value is LoopProfileRisk {
  return value === "low" || value === "medium" || value === "high"
}

function isReadinessMode(value: unknown): value is LoopProfileReadinessMode {
  return value === "automatic" || value === "human_gate" || value === "manual"
}

function isTokenCostTier(value: unknown): value is LoopProfileTokenCostTier {
  return value === "low" || value === "medium" || value === "high"
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
