import { Effect } from "effect"
import type { DatabaseMigration } from "../migration"

export default {
  id: "20260621023940_lightbulb_schema",
  up(tx) {
    return Effect.gen(function* () {
      yield* tx.run(`
        CREATE TABLE \`lightbulb_account\` (
          \`id\` text PRIMARY KEY,
          \`name\` text NOT NULL,
          \`status\` text NOT NULL,
          \`metadata\` text,
          \`time_created\` integer NOT NULL,
          \`time_updated\` integer NOT NULL
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`lightbulb_artifact_edge\` (
          \`artifact_id\` text NOT NULL,
          \`consumer_run_id\` text NOT NULL,
          \`consumer_worker_id\` text,
          \`relation\` text NOT NULL,
          \`summary\` text NOT NULL,
          \`time_created\` integer NOT NULL,
          CONSTRAINT \`lightbulb_artifact_edge_pk\` PRIMARY KEY(\`artifact_id\`, \`consumer_run_id\`, \`relation\`),
          CONSTRAINT \`fk_lightbulb_artifact_edge_artifact_id_lightbulb_artifact_id_fk\` FOREIGN KEY (\`artifact_id\`) REFERENCES \`lightbulb_artifact\`(\`id\`) ON DELETE CASCADE,
          CONSTRAINT \`fk_lightbulb_artifact_edge_consumer_run_id_lightbulb_run_id_fk\` FOREIGN KEY (\`consumer_run_id\`) REFERENCES \`lightbulb_run\`(\`id\`) ON DELETE CASCADE,
          CONSTRAINT \`lightbulb_artifact_edge_consumer_worker_run_fk\` FOREIGN KEY (\`consumer_worker_id\`,\`consumer_run_id\`) REFERENCES \`lightbulb_worker\`(\`id\`,\`run_id\`) ON DELETE CASCADE
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`lightbulb_artifact\` (
          \`id\` text PRIMARY KEY,
          \`account_id\` text NOT NULL,
          \`producer_run_id\` text NOT NULL,
          \`producer_worker_id\` text NOT NULL,
          \`task_packet_id\` text NOT NULL,
          \`type\` text NOT NULL,
          \`uri\` text NOT NULL,
          \`checksum\` text,
          \`status\` text NOT NULL,
          \`summary\` text NOT NULL,
          \`metadata\` text,
          \`retention_policy\` text NOT NULL,
          \`time_created\` integer NOT NULL,
          \`time_updated\` integer NOT NULL,
          CONSTRAINT \`fk_lightbulb_artifact_account_id_lightbulb_account_id_fk\` FOREIGN KEY (\`account_id\`) REFERENCES \`lightbulb_account\`(\`id\`) ON DELETE CASCADE,
          CONSTRAINT \`fk_lightbulb_artifact_producer_run_id_lightbulb_run_id_fk\` FOREIGN KEY (\`producer_run_id\`) REFERENCES \`lightbulb_run\`(\`id\`) ON DELETE CASCADE,
          CONSTRAINT \`fk_lightbulb_artifact_producer_worker_id_lightbulb_worker_id_fk\` FOREIGN KEY (\`producer_worker_id\`) REFERENCES \`lightbulb_worker\`(\`id\`) ON DELETE CASCADE,
          CONSTRAINT \`fk_lightbulb_artifact_task_packet_id_lightbulb_task_packet_id_fk\` FOREIGN KEY (\`task_packet_id\`) REFERENCES \`lightbulb_task_packet\`(\`id\`) ON DELETE CASCADE,
          CONSTRAINT \`lightbulb_artifact_account_run_fk\` FOREIGN KEY (\`account_id\`,\`producer_run_id\`) REFERENCES \`lightbulb_run\`(\`account_id\`,\`id\`) ON DELETE CASCADE,
          CONSTRAINT \`lightbulb_artifact_producer_worker_run_fk\` FOREIGN KEY (\`producer_worker_id\`,\`producer_run_id\`) REFERENCES \`lightbulb_worker\`(\`id\`,\`run_id\`) ON DELETE CASCADE,
          CONSTRAINT \`lightbulb_artifact_account_task_packet_fk\` FOREIGN KEY (\`account_id\`,\`task_packet_id\`) REFERENCES \`lightbulb_task_packet\`(\`account_id\`,\`id\`) ON DELETE CASCADE,
          CONSTRAINT \`lightbulb_artifact_task_packet_worker_fk\` FOREIGN KEY (\`task_packet_id\`,\`producer_worker_id\`) REFERENCES \`lightbulb_task_packet\`(\`id\`,\`worker_id\`) ON DELETE CASCADE
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`lightbulb_event\` (
          \`id\` text PRIMARY KEY,
          \`account_id\` text NOT NULL,
          \`aggregate_type\` text NOT NULL,
          \`aggregate_id\` text NOT NULL,
          \`type\` text NOT NULL,
          \`summary\` text NOT NULL,
          \`data\` text NOT NULL,
          \`time_created\` integer NOT NULL,
          CONSTRAINT \`fk_lightbulb_event_account_id_lightbulb_account_id_fk\` FOREIGN KEY (\`account_id\`) REFERENCES \`lightbulb_account\`(\`id\`) ON DELETE CASCADE
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`lightbulb_gate\` (
          \`id\` text PRIMARY KEY,
          \`account_id\` text NOT NULL,
          \`run_id\` text NOT NULL,
          \`kind\` text NOT NULL,
          \`status\` text NOT NULL,
          \`summary\` text NOT NULL,
          \`artifact_id\` text,
          \`metadata\` text,
          \`time_created\` integer NOT NULL,
          \`time_updated\` integer NOT NULL,
          CONSTRAINT \`fk_lightbulb_gate_account_id_lightbulb_account_id_fk\` FOREIGN KEY (\`account_id\`) REFERENCES \`lightbulb_account\`(\`id\`) ON DELETE CASCADE,
          CONSTRAINT \`fk_lightbulb_gate_run_id_lightbulb_run_id_fk\` FOREIGN KEY (\`run_id\`) REFERENCES \`lightbulb_run\`(\`id\`) ON DELETE CASCADE,
          CONSTRAINT \`fk_lightbulb_gate_artifact_id_lightbulb_artifact_id_fk\` FOREIGN KEY (\`artifact_id\`) REFERENCES \`lightbulb_artifact\`(\`id\`) ON DELETE SET NULL,
          CONSTRAINT \`lightbulb_gate_account_run_fk\` FOREIGN KEY (\`account_id\`,\`run_id\`) REFERENCES \`lightbulb_run\`(\`account_id\`,\`id\`) ON DELETE CASCADE
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`lightbulb_goal\` (
          \`id\` text PRIMARY KEY,
          \`account_id\` text NOT NULL,
          \`title\` text NOT NULL,
          \`status\` text NOT NULL,
          \`summary\` text NOT NULL,
          \`metadata\` text,
          \`time_created\` integer NOT NULL,
          \`time_updated\` integer NOT NULL,
          CONSTRAINT \`fk_lightbulb_goal_account_id_lightbulb_account_id_fk\` FOREIGN KEY (\`account_id\`) REFERENCES \`lightbulb_account\`(\`id\`) ON DELETE CASCADE
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`lightbulb_loop\` (
          \`id\` text PRIMARY KEY,
          \`account_id\` text NOT NULL,
          \`goal_id\` text NOT NULL,
          \`kind\` text NOT NULL,
          \`status\` text NOT NULL,
          \`summary\` text NOT NULL,
          \`metadata\` text,
          \`time_created\` integer NOT NULL,
          \`time_updated\` integer NOT NULL,
          CONSTRAINT \`fk_lightbulb_loop_account_id_lightbulb_account_id_fk\` FOREIGN KEY (\`account_id\`) REFERENCES \`lightbulb_account\`(\`id\`) ON DELETE CASCADE,
          CONSTRAINT \`fk_lightbulb_loop_goal_id_lightbulb_goal_id_fk\` FOREIGN KEY (\`goal_id\`) REFERENCES \`lightbulb_goal\`(\`id\`) ON DELETE CASCADE
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`lightbulb_run\` (
          \`id\` text PRIMARY KEY,
          \`account_id\` text NOT NULL,
          \`loop_id\` text NOT NULL,
          \`status\` text NOT NULL,
          \`review_status\` text NOT NULL,
          \`debug_status\` text NOT NULL,
          \`gate_status\` text NOT NULL,
          \`summary\` text NOT NULL,
          \`started_at\` integer NOT NULL,
          \`completed_at\` integer,
          \`metadata\` text,
          \`time_created\` integer NOT NULL,
          \`time_updated\` integer NOT NULL,
          CONSTRAINT \`fk_lightbulb_run_account_id_lightbulb_account_id_fk\` FOREIGN KEY (\`account_id\`) REFERENCES \`lightbulb_account\`(\`id\`) ON DELETE CASCADE,
          CONSTRAINT \`fk_lightbulb_run_loop_id_lightbulb_loop_id_fk\` FOREIGN KEY (\`loop_id\`) REFERENCES \`lightbulb_loop\`(\`id\`) ON DELETE CASCADE,
          CONSTRAINT \`lightbulb_run_account_loop_fk\` FOREIGN KEY (\`account_id\`,\`loop_id\`) REFERENCES \`lightbulb_loop\`(\`account_id\`,\`id\`) ON DELETE CASCADE
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`lightbulb_task_packet\` (
          \`id\` text PRIMARY KEY,
          \`account_id\` text NOT NULL,
          \`worker_id\` text NOT NULL,
          \`title\` text NOT NULL,
          \`status\` text NOT NULL,
          \`instructions\` text NOT NULL,
          \`metadata\` text,
          \`time_created\` integer NOT NULL,
          \`time_updated\` integer NOT NULL,
          CONSTRAINT \`fk_lightbulb_task_packet_account_id_lightbulb_account_id_fk\` FOREIGN KEY (\`account_id\`) REFERENCES \`lightbulb_account\`(\`id\`) ON DELETE CASCADE,
          CONSTRAINT \`fk_lightbulb_task_packet_worker_id_lightbulb_worker_id_fk\` FOREIGN KEY (\`worker_id\`) REFERENCES \`lightbulb_worker\`(\`id\`) ON DELETE CASCADE,
          CONSTRAINT \`lightbulb_task_packet_account_worker_fk\` FOREIGN KEY (\`account_id\`,\`worker_id\`) REFERENCES \`lightbulb_worker\`(\`account_id\`,\`id\`) ON DELETE CASCADE
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`lightbulb_worker\` (
          \`id\` text PRIMARY KEY,
          \`account_id\` text NOT NULL,
          \`run_id\` text NOT NULL,
          \`role\` text NOT NULL,
          \`status\` text NOT NULL,
          \`summary\` text NOT NULL,
          \`metadata\` text,
          \`time_created\` integer NOT NULL,
          \`time_updated\` integer NOT NULL,
          CONSTRAINT \`fk_lightbulb_worker_account_id_lightbulb_account_id_fk\` FOREIGN KEY (\`account_id\`) REFERENCES \`lightbulb_account\`(\`id\`) ON DELETE CASCADE,
          CONSTRAINT \`fk_lightbulb_worker_run_id_lightbulb_run_id_fk\` FOREIGN KEY (\`run_id\`) REFERENCES \`lightbulb_run\`(\`id\`) ON DELETE CASCADE,
          CONSTRAINT \`lightbulb_worker_account_run_fk\` FOREIGN KEY (\`account_id\`,\`run_id\`) REFERENCES \`lightbulb_run\`(\`account_id\`,\`id\`) ON DELETE CASCADE
        );
      `)
      yield* tx.run(`CREATE INDEX \`lightbulb_artifact_edge_consumer_run_idx\` ON \`lightbulb_artifact_edge\` (\`consumer_run_id\`);`)
      yield* tx.run(`CREATE INDEX \`lightbulb_artifact_account_idx\` ON \`lightbulb_artifact\` (\`account_id\`);`)
      yield* tx.run(`CREATE INDEX \`lightbulb_artifact_producer_run_idx\` ON \`lightbulb_artifact\` (\`producer_run_id\`);`)
      yield* tx.run(`CREATE INDEX \`lightbulb_artifact_producer_worker_idx\` ON \`lightbulb_artifact\` (\`producer_worker_id\`);`)
      yield* tx.run(`CREATE INDEX \`lightbulb_artifact_task_packet_idx\` ON \`lightbulb_artifact\` (\`task_packet_id\`);`)
      yield* tx.run(`CREATE INDEX \`lightbulb_event_account_idx\` ON \`lightbulb_event\` (\`account_id\`);`)
      yield* tx.run(`CREATE INDEX \`lightbulb_event_aggregate_idx\` ON \`lightbulb_event\` (\`aggregate_type\`,\`aggregate_id\`,\`time_created\`);`)
      yield* tx.run(`CREATE INDEX \`lightbulb_gate_account_idx\` ON \`lightbulb_gate\` (\`account_id\`);`)
      yield* tx.run(`CREATE INDEX \`lightbulb_gate_run_idx\` ON \`lightbulb_gate\` (\`run_id\`);`)
      yield* tx.run(`CREATE INDEX \`lightbulb_goal_account_idx\` ON \`lightbulb_goal\` (\`account_id\`);`)
      yield* tx.run(`CREATE INDEX \`lightbulb_loop_account_idx\` ON \`lightbulb_loop\` (\`account_id\`);`)
      yield* tx.run(`CREATE INDEX \`lightbulb_loop_goal_idx\` ON \`lightbulb_loop\` (\`goal_id\`);`)
      yield* tx.run(`CREATE UNIQUE INDEX \`lightbulb_loop_account_id_idx\` ON \`lightbulb_loop\` (\`account_id\`,\`id\`);`)
      yield* tx.run(`CREATE INDEX \`lightbulb_run_account_idx\` ON \`lightbulb_run\` (\`account_id\`);`)
      yield* tx.run(`CREATE INDEX \`lightbulb_run_loop_idx\` ON \`lightbulb_run\` (\`loop_id\`);`)
      yield* tx.run(`CREATE UNIQUE INDEX \`lightbulb_run_account_id_idx\` ON \`lightbulb_run\` (\`account_id\`,\`id\`);`)
      yield* tx.run(`CREATE INDEX \`lightbulb_task_packet_account_idx\` ON \`lightbulb_task_packet\` (\`account_id\`);`)
      yield* tx.run(`CREATE INDEX \`lightbulb_task_packet_worker_idx\` ON \`lightbulb_task_packet\` (\`worker_id\`);`)
      yield* tx.run(`CREATE UNIQUE INDEX \`lightbulb_task_packet_account_id_idx\` ON \`lightbulb_task_packet\` (\`account_id\`,\`id\`);`)
      yield* tx.run(`CREATE UNIQUE INDEX \`lightbulb_task_packet_id_worker_idx\` ON \`lightbulb_task_packet\` (\`id\`,\`worker_id\`);`)
      yield* tx.run(`CREATE INDEX \`lightbulb_worker_account_idx\` ON \`lightbulb_worker\` (\`account_id\`);`)
      yield* tx.run(`CREATE INDEX \`lightbulb_worker_run_idx\` ON \`lightbulb_worker\` (\`run_id\`);`)
      yield* tx.run(`CREATE UNIQUE INDEX \`lightbulb_worker_account_id_idx\` ON \`lightbulb_worker\` (\`account_id\`,\`id\`);`)
      yield* tx.run(`CREATE UNIQUE INDEX \`lightbulb_worker_id_run_idx\` ON \`lightbulb_worker\` (\`id\`,\`run_id\`);`)
    })
  },
} satisfies DatabaseMigration.Migration
