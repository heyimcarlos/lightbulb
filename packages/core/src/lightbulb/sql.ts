import { sql } from "drizzle-orm"
import { check, foreignKey, index, integer, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core"
import { Timestamps } from "../database/schema.sql"
import type { Lightbulb } from "../lightbulb"

export const LightbulbAccountTable = sqliteTable("lightbulb_account", {
  id: text().$type<Lightbulb.AccountID>().primaryKey(),
  name: text().notNull(),
  status: text().$type<Lightbulb.AccountStatus>().notNull(),
  metadata: text({ mode: "json" }).$type<Record<string, unknown>>(),
  ...Timestamps,
})

export const LightbulbGoalTable = sqliteTable(
  "lightbulb_goal",
  {
    id: text().$type<Lightbulb.GoalID>().primaryKey(),
    account_id: text()
      .$type<Lightbulb.AccountID>()
      .notNull()
      .references(() => LightbulbAccountTable.id, { onDelete: "cascade" }),
    title: text().notNull(),
    objective: text().notNull().default(""),
    source_ref: text(),
    owner_id: text(),
    status: text().$type<Lightbulb.GoalStatus>().notNull(),
    summary: text().notNull(),
    hold_reason: text(),
    completion_reason: text(),
    completed_at: integer(),
    metadata: text({ mode: "json" }).$type<Record<string, unknown>>(),
    ...Timestamps,
  },
  (table) => [
    index("lightbulb_goal_account_idx").on(table.account_id),
    uniqueIndex("lightbulb_goal_account_source_ref_idx").on(table.account_id, table.source_ref),
    uniqueIndex("lightbulb_goal_account_id_idx").on(table.account_id, table.id),
  ],
)

export const LightbulbLoopTable = sqliteTable(
  "lightbulb_loop",
  {
    id: text().$type<Lightbulb.LoopID>().primaryKey(),
    account_id: text()
      .$type<Lightbulb.AccountID>()
      .notNull()
      .references(() => LightbulbAccountTable.id, { onDelete: "cascade" }),
    goal_id: text()
      .$type<Lightbulb.GoalID>()
      .notNull()
      .references(() => LightbulbGoalTable.id, { onDelete: "cascade" }),
    kind: text().$type<Lightbulb.LoopKind>().notNull(),
    status: text().$type<Lightbulb.LoopStatus>().notNull(),
    summary: text().notNull(),
    metadata: text({ mode: "json" }).$type<Record<string, unknown>>(),
    ...Timestamps,
  },
  (table) => [
    index("lightbulb_loop_account_idx").on(table.account_id),
    index("lightbulb_loop_goal_idx").on(table.goal_id),
    uniqueIndex("lightbulb_loop_account_id_idx").on(table.account_id, table.id),
  ],
)

export const LightbulbRouteTable = sqliteTable(
  "lightbulb_route",
  {
    id: text().$type<Lightbulb.RouteID>().primaryKey(),
    account_id: text()
      .$type<Lightbulb.AccountID>()
      .notNull()
      .references(() => LightbulbAccountTable.id, { onDelete: "cascade" }),
    goal_id: text()
      .$type<Lightbulb.GoalID>()
      .notNull()
      .references(() => LightbulbGoalTable.id, { onDelete: "cascade" }),
    destination: text().notNull(),
    status: text().$type<Lightbulb.RouteStatus>().notNull(),
    current_stop_id: text().$type<Lightbulb.RouteStopID>(),
    summary: text().notNull(),
    metadata: text({ mode: "json" }).$type<Record<string, unknown>>(),
    ...Timestamps,
  },
  (table) => [
    index("lightbulb_route_account_idx").on(table.account_id),
    index("lightbulb_route_goal_idx").on(table.goal_id),
    uniqueIndex("lightbulb_route_account_id_idx").on(table.account_id, table.id),
    foreignKey({
      columns: [table.account_id, table.goal_id],
      foreignColumns: [LightbulbGoalTable.account_id, LightbulbGoalTable.id],
      name: "lightbulb_route_account_goal_fk",
    }).onDelete("cascade"),
  ],
)

export const LightbulbRouteStopTable = sqliteTable(
  "lightbulb_route_stop",
  {
    id: text().$type<Lightbulb.RouteStopID>().primaryKey(),
    account_id: text()
      .$type<Lightbulb.AccountID>()
      .notNull()
      .references(() => LightbulbAccountTable.id, { onDelete: "cascade" }),
    route_id: text()
      .$type<Lightbulb.RouteID>()
      .notNull()
      .references(() => LightbulbRouteTable.id, { onDelete: "cascade" }),
    sequence: integer().notNull(),
    kind: text().$type<Lightbulb.RouteStopKind>().notNull(),
    status: text().$type<Lightbulb.RouteStopStatus>().notNull(),
    title: text().notNull(),
    objective: text().notNull(),
    evidence: text().notNull(),
    metadata: text({ mode: "json" }).$type<Record<string, unknown>>(),
    ...Timestamps,
  },
  (table) => [
    index("lightbulb_route_stop_account_idx").on(table.account_id),
    index("lightbulb_route_stop_route_idx").on(table.route_id),
    uniqueIndex("lightbulb_route_stop_route_sequence_idx").on(table.route_id, table.sequence),
    uniqueIndex("lightbulb_route_stop_account_id_idx").on(table.account_id, table.id),
    foreignKey({
      columns: [table.account_id, table.route_id],
      foreignColumns: [LightbulbRouteTable.account_id, LightbulbRouteTable.id],
      name: "lightbulb_route_stop_account_route_fk",
    }).onDelete("cascade"),
  ],
)

export const LightbulbRouteSteerTable = sqliteTable(
  "lightbulb_route_steer",
  {
    id: text().$type<Lightbulb.RouteSteerID>().primaryKey(),
    account_id: text()
      .$type<Lightbulb.AccountID>()
      .notNull()
      .references(() => LightbulbAccountTable.id, { onDelete: "cascade" }),
    route_id: text()
      .$type<Lightbulb.RouteID>()
      .notNull()
      .references(() => LightbulbRouteTable.id, { onDelete: "cascade" }),
    reason: text().$type<Lightbulb.RouteSteerReason>().notNull(),
    from_stop_id: text().$type<Lightbulb.RouteStopID>(),
    to_stop_id: text().$type<Lightbulb.RouteStopID>(),
    summary: text().notNull(),
    instruction: text(),
    metadata: text({ mode: "json" }).$type<Record<string, unknown>>(),
    ...Timestamps,
  },
  (table) => [
    index("lightbulb_route_steer_account_idx").on(table.account_id),
    index("lightbulb_route_steer_route_idx").on(table.route_id),
    foreignKey({
      columns: [table.account_id, table.route_id],
      foreignColumns: [LightbulbRouteTable.account_id, LightbulbRouteTable.id],
      name: "lightbulb_route_steer_account_route_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.account_id, table.from_stop_id],
      foreignColumns: [LightbulbRouteStopTable.account_id, LightbulbRouteStopTable.id],
      name: "lightbulb_route_steer_account_from_stop_fk",
    }).onDelete("set null"),
    foreignKey({
      columns: [table.account_id, table.to_stop_id],
      foreignColumns: [LightbulbRouteStopTable.account_id, LightbulbRouteStopTable.id],
      name: "lightbulb_route_steer_account_to_stop_fk",
    }).onDelete("set null"),
  ],
)

export const LightbulbPRReviewCandidateTable = sqliteTable(
  "lightbulb_pr_review_candidate",
  {
    id: text().$type<Lightbulb.PRReviewCandidateID>().primaryKey(),
    account_id: text()
      .$type<Lightbulb.AccountID>()
      .notNull()
      .references(() => LightbulbAccountTable.id, { onDelete: "cascade" }),
    repository: text().notNull(),
    pr_number: integer().notNull(),
    title: text().notNull(),
    url: text().notNull(),
    state: text().$type<Lightbulb.PRReviewCandidateState>().notNull(),
    status: text().$type<Lightbulb.PRReviewCandidateStatus>().notNull(),
    base_ref: text().notNull(),
    head_ref: text().notNull(),
    head_sha: text(),
    last_seen_at: integer().notNull(),
    last_checked_at: integer().notNull(),
    route_seed: text({ mode: "json" }).$type<Lightbulb.PRReviewCandidateRouteSeed>().notNull(),
    evidence: text({ mode: "json" }).$type<Lightbulb.PRReviewCandidateEvidence>().notNull(),
    metadata: text({ mode: "json" }).$type<Record<string, unknown>>(),
    ...Timestamps,
  },
  (table) => [
    index("lightbulb_pr_review_candidate_account_idx").on(table.account_id),
    index("lightbulb_pr_review_candidate_repository_idx").on(table.account_id, table.repository),
    uniqueIndex("lightbulb_pr_review_candidate_identity_idx").on(table.account_id, table.repository, table.pr_number),
  ],
)

export const LightbulbPRReviewRouteTable = sqliteTable(
  "lightbulb_pr_review_route",
  {
    id: text().$type<Lightbulb.RouteID>().primaryKey(),
    account_id: text()
      .$type<Lightbulb.AccountID>()
      .notNull()
      .references(() => LightbulbAccountTable.id, { onDelete: "cascade" }),
    candidate_id: text()
      .$type<Lightbulb.PRReviewCandidateID>()
      .notNull()
      .references(() => LightbulbPRReviewCandidateTable.id, { onDelete: "cascade" }),
    goal_id: text()
      .$type<Lightbulb.GoalID>()
      .notNull()
      .references(() => LightbulbGoalTable.id, { onDelete: "cascade" }),
    repository: text().notNull(),
    active_repository_key: text(),
    pr_number: integer().notNull(),
    title: text().notNull(),
    url: text().notNull(),
    status: text().$type<Lightbulb.PRReviewRouteStatus>().notNull(),
    current_stop_id: text().$type<Lightbulb.RouteStopID>(),
    latest_evidence: text({ mode: "json" }).$type<Lightbulb.PRReviewRouteEvidence>(),
    active_worker: text({ mode: "json" }).$type<Lightbulb.PRReviewRouteWorkerHandle>(),
    blocked_reason: text(),
    next_wake_source: text().$type<Lightbulb.PRReviewRouteWakeSource>(),
    merge_ready: integer({ mode: "boolean" }).notNull(),
    last_wake_at: integer(),
    metadata: text({ mode: "json" }).$type<Record<string, unknown>>(),
    ...Timestamps,
  },
  (table) => [
    index("lightbulb_pr_review_route_account_idx").on(table.account_id),
    index("lightbulb_pr_review_route_repository_idx").on(table.account_id, table.repository, table.status),
    uniqueIndex("lightbulb_pr_review_route_active_repository_idx").on(table.account_id, table.active_repository_key),
    uniqueIndex("lightbulb_pr_review_route_candidate_idx").on(table.account_id, table.candidate_id),
    uniqueIndex("lightbulb_pr_review_route_account_id_idx").on(table.account_id, table.id),
    foreignKey({
      columns: [table.account_id, table.id],
      foreignColumns: [LightbulbRouteTable.account_id, LightbulbRouteTable.id],
      name: "lightbulb_pr_review_route_account_route_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.account_id, table.goal_id],
      foreignColumns: [LightbulbGoalTable.account_id, LightbulbGoalTable.id],
      name: "lightbulb_pr_review_route_account_goal_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.account_id, table.current_stop_id],
      foreignColumns: [LightbulbRouteStopTable.account_id, LightbulbRouteStopTable.id],
      name: "lightbulb_pr_review_route_account_current_stop_fk",
    }).onDelete("set null"),
  ],
)

export const LightbulbPRReviewRouteWakeTable = sqliteTable(
  "lightbulb_pr_review_route_wake",
  {
    id: text().$type<Lightbulb.PRReviewRouteWakeID>().primaryKey(),
    account_id: text()
      .$type<Lightbulb.AccountID>()
      .notNull()
      .references(() => LightbulbAccountTable.id, { onDelete: "cascade" }),
    route_id: text()
      .$type<Lightbulb.RouteID>()
      .notNull()
      .references(() => LightbulbPRReviewRouteTable.id, { onDelete: "cascade" }),
    source: text().$type<Lightbulb.PRReviewRouteWakeSource>().notNull(),
    summary: text().notNull(),
    evidence: text({ mode: "json" }).$type<Lightbulb.PRReviewRouteEvidence>().notNull(),
    active_worker: text({ mode: "json" }).$type<Lightbulb.PRReviewRouteWorkerHandle>(),
    blocked_reason: text(),
    next_wake_source: text().$type<Lightbulb.PRReviewRouteWakeSource>(),
    current_stop_id: text().$type<Lightbulb.RouteStopID>(),
    merge_ready: integer({ mode: "boolean" }).notNull(),
    metadata: text({ mode: "json" }).$type<Record<string, unknown>>(),
    ...Timestamps,
  },
  (table) => [
    index("lightbulb_pr_review_route_wake_account_idx").on(table.account_id),
    index("lightbulb_pr_review_route_wake_route_idx").on(table.route_id, table.time_created),
    foreignKey({
      columns: [table.account_id, table.route_id],
      foreignColumns: [LightbulbPRReviewRouteTable.account_id, LightbulbPRReviewRouteTable.id],
      name: "lightbulb_pr_review_route_wake_account_route_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.account_id, table.current_stop_id],
      foreignColumns: [LightbulbRouteStopTable.account_id, LightbulbRouteStopTable.id],
      name: "lightbulb_pr_review_route_wake_account_current_stop_fk",
    }).onDelete("set null"),
  ],
)

export const LightbulbDiscoveryCandidateTable = sqliteTable(
  "lightbulb_discovery_candidate",
  {
    id: text().$type<Lightbulb.DiscoveryCandidateID>().primaryKey(),
    account_id: text()
      .$type<Lightbulb.AccountID>()
      .notNull()
      .references(() => LightbulbAccountTable.id, { onDelete: "cascade" }),
    source_kind: text().$type<Lightbulb.DiscoveryCandidateSourceKind>().notNull(),
    source_id: text().notNull(),
    title: text().notNull(),
    url: text().notNull(),
    status: text().$type<Lightbulb.DiscoveryCandidateStatus>().notNull(),
    section: text().$type<Lightbulb.DiscoveryCandidateSection>().notNull(),
    score: integer().notNull(),
    reason: text().notNull(),
    suggested_action: text().notNull(),
    source_handles: text({ mode: "json" }).$type<Lightbulb.DiscoveryCandidateSourceHandles>().notNull(),
    duplicate_refs: text({ mode: "json" }).$type<readonly string[]>().notNull(),
    labels: text({ mode: "json" }).$type<readonly string[]>().notNull(),
    last_seen_at: integer().notNull(),
    last_projected_at: integer().notNull(),
    metadata: text({ mode: "json" }).$type<Record<string, unknown>>(),
    ...Timestamps,
  },
  (table) => [
    index("lightbulb_discovery_candidate_account_idx").on(table.account_id),
    index("lightbulb_discovery_candidate_section_idx").on(table.account_id, table.section, table.score),
    uniqueIndex("lightbulb_discovery_candidate_identity_idx").on(table.account_id, table.source_kind, table.source_id),
  ],
)

export const LightbulbOperationsSnapshotTable = sqliteTable(
  "lightbulb_operations_snapshot",
  {
    id: text().$type<Lightbulb.OperationsSnapshotID>().primaryKey(),
    account_id: text()
      .$type<Lightbulb.AccountID>()
      .notNull()
      .references(() => LightbulbAccountTable.id, { onDelete: "cascade" }),
    snapshot_key: text().notNull(),
    status: text().$type<Lightbulb.OperationsSnapshotStatus>().notNull(),
    summary: text().notNull(),
    source_hash: text().notNull(),
    generated_at: integer().notNull(),
    next_wake_at: integer(),
    counts: text({ mode: "json" }).$type<Lightbulb.OperationsSnapshotCounts>().notNull(),
    handles: text({ mode: "json" }).$type<Lightbulb.OperationsSnapshotHandles>().notNull(),
    metadata: text({ mode: "json" }).$type<Record<string, unknown>>(),
    ...Timestamps,
  },
  (table) => [
    index("lightbulb_operations_snapshot_account_idx").on(table.account_id),
    index("lightbulb_operations_snapshot_status_idx").on(table.account_id, table.status),
    uniqueIndex("lightbulb_operations_snapshot_key_idx").on(table.account_id, table.snapshot_key),
    uniqueIndex("lightbulb_operations_snapshot_account_id_idx").on(table.account_id, table.id),
  ],
)

export const LightbulbRunTable = sqliteTable(
  "lightbulb_run",
  {
    id: text().$type<Lightbulb.RunID>().primaryKey(),
    account_id: text()
      .$type<Lightbulb.AccountID>()
      .notNull()
      .references(() => LightbulbAccountTable.id, { onDelete: "cascade" }),
    loop_id: text()
      .$type<Lightbulb.LoopID>()
      .notNull()
      .references(() => LightbulbLoopTable.id, { onDelete: "cascade" }),
    status: text().$type<Lightbulb.RunStatus>().notNull(),
    review_status: text().$type<Lightbulb.ReviewStatus>().notNull(),
    debug_status: text().$type<Lightbulb.DebugStatus>().notNull(),
    gate_status: text().$type<Lightbulb.GateStatus>().notNull(),
    summary: text().notNull(),
    started_at: integer().notNull(),
    completed_at: integer(),
    metadata: text({ mode: "json" }).$type<Record<string, unknown>>(),
    ...Timestamps,
  },
  (table) => [
    index("lightbulb_run_account_idx").on(table.account_id),
    index("lightbulb_run_loop_idx").on(table.loop_id),
    uniqueIndex("lightbulb_run_account_id_idx").on(table.account_id, table.id),
    foreignKey({
      columns: [table.account_id, table.loop_id],
      foreignColumns: [LightbulbLoopTable.account_id, LightbulbLoopTable.id],
      name: "lightbulb_run_account_loop_fk",
    }).onDelete("cascade"),
  ],
)

export const LightbulbWorkerTable = sqliteTable(
  "lightbulb_worker",
  {
    id: text().$type<Lightbulb.WorkerID>().primaryKey(),
    account_id: text()
      .$type<Lightbulb.AccountID>()
      .notNull()
      .references(() => LightbulbAccountTable.id, { onDelete: "cascade" }),
    run_id: text()
      .$type<Lightbulb.RunID>()
      .notNull()
      .references(() => LightbulbRunTable.id, { onDelete: "cascade" }),
    role: text().notNull(),
    status: text().$type<Lightbulb.WorkerStatus>().notNull(),
    summary: text().notNull(),
    metadata: text({ mode: "json" }).$type<Record<string, unknown>>(),
    ...Timestamps,
  },
  (table) => [
    index("lightbulb_worker_account_idx").on(table.account_id),
    index("lightbulb_worker_run_idx").on(table.run_id),
    uniqueIndex("lightbulb_worker_account_id_idx").on(table.account_id, table.id),
    uniqueIndex("lightbulb_worker_id_run_idx").on(table.id, table.run_id),
    foreignKey({
      columns: [table.account_id, table.run_id],
      foreignColumns: [LightbulbRunTable.account_id, LightbulbRunTable.id],
      name: "lightbulb_worker_account_run_fk",
    }).onDelete("cascade"),
  ],
)

export const LightbulbTaskPacketTable = sqliteTable(
  "lightbulb_task_packet",
  {
    id: text().$type<Lightbulb.TaskPacketID>().primaryKey(),
    account_id: text()
      .$type<Lightbulb.AccountID>()
      .notNull()
      .references(() => LightbulbAccountTable.id, { onDelete: "cascade" }),
    worker_id: text()
      .$type<Lightbulb.WorkerID>()
      .notNull()
      .references(() => LightbulbWorkerTable.id, { onDelete: "cascade" }),
    title: text().notNull(),
    status: text().$type<Lightbulb.TaskPacketStatus>().notNull(),
    instructions: text().notNull(),
    metadata: text({ mode: "json" }).$type<Record<string, unknown>>(),
    ...Timestamps,
  },
  (table) => [
    index("lightbulb_task_packet_account_idx").on(table.account_id),
    index("lightbulb_task_packet_worker_idx").on(table.worker_id),
    uniqueIndex("lightbulb_task_packet_account_id_idx").on(table.account_id, table.id),
    uniqueIndex("lightbulb_task_packet_id_worker_idx").on(table.id, table.worker_id),
    foreignKey({
      columns: [table.account_id, table.worker_id],
      foreignColumns: [LightbulbWorkerTable.account_id, LightbulbWorkerTable.id],
      name: "lightbulb_task_packet_account_worker_fk",
    }).onDelete("cascade"),
  ],
)

export const LightbulbWorkerLaunchAttemptTable = sqliteTable(
  "lightbulb_worker_launch_attempt",
  {
    id: text().$type<Lightbulb.WorkerLaunchAttemptID>().primaryKey(),
    account_id: text()
      .$type<Lightbulb.AccountID>()
      .notNull()
      .references(() => LightbulbAccountTable.id, { onDelete: "cascade" }),
    run_id: text()
      .$type<Lightbulb.RunID>()
      .notNull()
      .references(() => LightbulbRunTable.id, { onDelete: "cascade" }),
    worker_id: text()
      .$type<Lightbulb.WorkerID>()
      .notNull()
      .references(() => LightbulbWorkerTable.id, { onDelete: "cascade" }),
    task_packet_id: text()
      .$type<Lightbulb.TaskPacketID>()
      .notNull()
      .references(() => LightbulbTaskPacketTable.id, { onDelete: "cascade" }),
    active_key: text(),
    status: text().$type<Lightbulb.WorkerLaunchStatus>().notNull(),
    trigger: text().$type<Lightbulb.WorkerLaunchTrigger>().notNull(),
    summary: text().notNull(),
    cwd: text().notNull(),
    worktree_id: text(),
    command: text().notNull(),
    profile_id: text(),
    session_id: text(),
    process_id: integer(),
    heartbeat_uri: text(),
    log_uri: text(),
    report_uri: text(),
    failure_reason: text(),
    metadata: text({ mode: "json" }).$type<Record<string, unknown>>(),
    ...Timestamps,
  },
  (table) => [
    index("lightbulb_worker_launch_account_idx").on(table.account_id),
    index("lightbulb_worker_launch_run_idx").on(table.run_id),
    index("lightbulb_worker_launch_worker_idx").on(table.worker_id),
    index("lightbulb_worker_launch_task_packet_idx").on(table.task_packet_id),
    uniqueIndex("lightbulb_worker_launch_account_id_idx").on(table.account_id, table.id),
    uniqueIndex("lightbulb_worker_launch_active_key_idx").on(table.active_key),
    foreignKey({
      columns: [table.account_id, table.run_id],
      foreignColumns: [LightbulbRunTable.account_id, LightbulbRunTable.id],
      name: "lightbulb_worker_launch_account_run_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.account_id, table.worker_id],
      foreignColumns: [LightbulbWorkerTable.account_id, LightbulbWorkerTable.id],
      name: "lightbulb_worker_launch_account_worker_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.account_id, table.task_packet_id],
      foreignColumns: [LightbulbTaskPacketTable.account_id, LightbulbTaskPacketTable.id],
      name: "lightbulb_worker_launch_account_task_packet_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.worker_id, table.run_id],
      foreignColumns: [LightbulbWorkerTable.id, LightbulbWorkerTable.run_id],
      name: "lightbulb_worker_launch_worker_run_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.task_packet_id, table.worker_id],
      foreignColumns: [LightbulbTaskPacketTable.id, LightbulbTaskPacketTable.worker_id],
      name: "lightbulb_worker_launch_task_packet_worker_fk",
    }).onDelete("cascade"),
  ],
)

export const LightbulbArtifactTable = sqliteTable(
  "lightbulb_artifact",
  {
    id: text().$type<Lightbulb.ArtifactID>().primaryKey(),
    account_id: text()
      .$type<Lightbulb.AccountID>()
      .notNull()
      .references(() => LightbulbAccountTable.id, { onDelete: "cascade" }),
    producer_run_id: text()
      .$type<Lightbulb.RunID>()
      .references(() => LightbulbRunTable.id, { onDelete: "cascade" }),
    producer_worker_id: text()
      .$type<Lightbulb.WorkerID>()
      .references(() => LightbulbWorkerTable.id, { onDelete: "cascade" }),
    task_packet_id: text()
      .$type<Lightbulb.TaskPacketID>()
      .references(() => LightbulbTaskPacketTable.id, { onDelete: "cascade" }),
    producer_kind: text().$type<Lightbulb.ArtifactProducerKind>().notNull(),
    source_issue_ref: text(),
    source_goal_id: text().$type<Lightbulb.GoalID>().references(() => LightbulbGoalTable.id, { onDelete: "set null" }),
    source_loop_id: text().$type<Lightbulb.LoopID>().references(() => LightbulbLoopTable.id, { onDelete: "set null" }),
    source_run_id: text().$type<Lightbulb.RunID>().references(() => LightbulbRunTable.id, { onDelete: "set null" }),
    source_gate_id: text().$type<Lightbulb.GateID>(),
    type: text().$type<Lightbulb.ArtifactType>().notNull(),
    uri: text().notNull(),
    checksum: text(),
    status: text().$type<Lightbulb.ArtifactStatus>().notNull(),
    summary: text().notNull(),
    metadata: text({ mode: "json" }).$type<Record<string, unknown>>(),
    retention_policy: text().notNull(),
    ...Timestamps,
  },
  (table) => [
    index("lightbulb_artifact_account_idx").on(table.account_id),
    index("lightbulb_artifact_producer_run_idx").on(table.producer_run_id),
    index("lightbulb_artifact_producer_worker_idx").on(table.producer_worker_id),
    index("lightbulb_artifact_task_packet_idx").on(table.task_packet_id),
    index("lightbulb_artifact_source_goal_idx").on(table.source_goal_id),
    index("lightbulb_artifact_source_loop_idx").on(table.source_loop_id),
    index("lightbulb_artifact_source_run_idx").on(table.source_run_id),
    index("lightbulb_artifact_source_gate_idx").on(table.source_gate_id),
    uniqueIndex("lightbulb_artifact_account_id_idx").on(table.account_id, table.id),
    foreignKey({
      columns: [table.account_id, table.producer_run_id],
      foreignColumns: [LightbulbRunTable.account_id, LightbulbRunTable.id],
      name: "lightbulb_artifact_account_run_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.producer_worker_id, table.producer_run_id],
      foreignColumns: [LightbulbWorkerTable.id, LightbulbWorkerTable.run_id],
      name: "lightbulb_artifact_producer_worker_run_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.account_id, table.task_packet_id],
      foreignColumns: [LightbulbTaskPacketTable.account_id, LightbulbTaskPacketTable.id],
      name: "lightbulb_artifact_account_task_packet_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.task_packet_id, table.producer_worker_id],
      foreignColumns: [LightbulbTaskPacketTable.id, LightbulbTaskPacketTable.worker_id],
      name: "lightbulb_artifact_task_packet_worker_fk",
    }).onDelete("cascade"),
    check(
      "lightbulb_artifact_producer_kind_fields",
      sql`(
        ${table.producer_kind} = 'harness'
        AND ${table.producer_run_id} IS NULL
        AND ${table.producer_worker_id} IS NULL
        AND ${table.task_packet_id} IS NULL
      ) OR (
        ${table.producer_kind} = 'worker'
        AND ${table.producer_run_id} IS NOT NULL
        AND ${table.producer_worker_id} IS NOT NULL
        AND ${table.task_packet_id} IS NOT NULL
      )`,
    ),
  ],
)

export const LightbulbArtifactEdgeTable = sqliteTable(
  "lightbulb_artifact_edge",
  {
    account_id: text()
      .$type<Lightbulb.AccountID>()
      .notNull()
      .references(() => LightbulbAccountTable.id, { onDelete: "cascade" }),
    artifact_id: text()
      .$type<Lightbulb.ArtifactID>()
      .notNull()
      .references(() => LightbulbArtifactTable.id, { onDelete: "cascade" }),
    consumer_run_id: text()
      .$type<Lightbulb.RunID>()
      .notNull()
      .references(() => LightbulbRunTable.id, { onDelete: "cascade" }),
    consumer_worker_id: text().$type<Lightbulb.WorkerID>(),
    relation: text().$type<Lightbulb.ArtifactEdgeRelation>().notNull(),
    summary: text().notNull(),
    time_created: integer()
      .notNull()
      .$default(() => Date.now()),
  },
  (table) => [
    primaryKey({ columns: [table.account_id, table.artifact_id, table.consumer_run_id, table.relation] }),
    index("lightbulb_artifact_edge_account_idx").on(table.account_id),
    index("lightbulb_artifact_edge_consumer_run_idx").on(table.consumer_run_id),
    foreignKey({
      columns: [table.account_id, table.artifact_id],
      foreignColumns: [LightbulbArtifactTable.account_id, LightbulbArtifactTable.id],
      name: "lightbulb_artifact_edge_account_artifact_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.account_id, table.consumer_run_id],
      foreignColumns: [LightbulbRunTable.account_id, LightbulbRunTable.id],
      name: "lightbulb_artifact_edge_account_consumer_run_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.account_id, table.consumer_worker_id],
      foreignColumns: [LightbulbWorkerTable.account_id, LightbulbWorkerTable.id],
      name: "lightbulb_artifact_edge_account_consumer_worker_fk",
    }).onDelete("cascade"),
  ],
)

export const LightbulbGateTable = sqliteTable(
  "lightbulb_gate",
  {
    id: text().$type<Lightbulb.GateID>().primaryKey(),
    account_id: text()
      .$type<Lightbulb.AccountID>()
      .notNull()
      .references(() => LightbulbAccountTable.id, { onDelete: "cascade" }),
    run_id: text()
      .$type<Lightbulb.RunID>()
      .notNull()
      .references(() => LightbulbRunTable.id, { onDelete: "cascade" }),
    kind: text().$type<Lightbulb.GateKind>().notNull(),
    status: text().$type<Lightbulb.GateStatus>().notNull(),
    summary: text().notNull(),
    artifact_id: text()
      .$type<Lightbulb.ArtifactID>()
      .references(() => LightbulbArtifactTable.id, { onDelete: "set null" }),
    metadata: text({ mode: "json" }).$type<Record<string, unknown>>(),
    ...Timestamps,
  },
  (table) => [
    index("lightbulb_gate_account_idx").on(table.account_id),
    index("lightbulb_gate_run_idx").on(table.run_id),
    foreignKey({
      columns: [table.account_id, table.run_id],
      foreignColumns: [LightbulbRunTable.account_id, LightbulbRunTable.id],
      name: "lightbulb_gate_account_run_fk",
    }).onDelete("cascade"),
  ],
)

export const LightbulbEventTable = sqliteTable(
  "lightbulb_event",
  {
    id: text().$type<Lightbulb.EventID>().primaryKey(),
    account_id: text()
      .$type<Lightbulb.AccountID>()
      .notNull()
      .references(() => LightbulbAccountTable.id, { onDelete: "cascade" }),
    aggregate_type: text().notNull(),
    aggregate_id: text().notNull(),
    type: text().notNull(),
    summary: text().notNull(),
    data: text({ mode: "json" }).$type<Record<string, unknown>>().notNull(),
    time_created: integer()
      .notNull()
      .$default(() => Date.now()),
  },
  (table) => [
    index("lightbulb_event_account_idx").on(table.account_id),
    index("lightbulb_event_aggregate_idx").on(table.aggregate_type, table.aggregate_id, table.time_created),
  ],
)

export const LightbulbSchedulerSupervisorPassTable = sqliteTable(
  "lightbulb_scheduler_supervisor_pass",
  {
    account_id: text()
      .$type<Lightbulb.AccountID>()
      .notNull()
      .references(() => LightbulbAccountTable.id, { onDelete: "cascade" }),
    pass_id: text().notNull(),
    event_id: text()
      .$type<Lightbulb.EventID>()
      .references(() => LightbulbEventTable.id, { onDelete: "set null" }),
    metadata: text({ mode: "json" }).$type<Record<string, unknown>>(),
    ...Timestamps,
  },
  (table) => [
    primaryKey({ columns: [table.account_id, table.pass_id] }),
    index("lightbulb_scheduler_supervisor_pass_account_idx").on(table.account_id),
    index("lightbulb_scheduler_supervisor_pass_event_idx").on(table.event_id),
  ],
)
