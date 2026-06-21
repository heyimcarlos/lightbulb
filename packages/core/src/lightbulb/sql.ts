import { foreignKey, index, integer, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core"
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
    status: text().$type<Lightbulb.GoalStatus>().notNull(),
    summary: text().notNull(),
    metadata: text({ mode: "json" }).$type<Record<string, unknown>>(),
    ...Timestamps,
  },
  (table) => [index("lightbulb_goal_account_idx").on(table.account_id)],
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
