import { Effect } from "effect"
import type { DatabaseMigration } from "./migration"

export default {
  up(tx) {
    return Effect.gen(function* () {
      yield* tx.run(`
        CREATE TABLE \`workspace\` (
          \`id\` text PRIMARY KEY,
          \`type\` text NOT NULL,
          \`name\` text DEFAULT '' NOT NULL,
          \`branch\` text,
          \`directory\` text,
          \`extra\` text,
          \`project_id\` text NOT NULL,
          \`time_used\` integer NOT NULL,
          CONSTRAINT \`fk_workspace_project_id_project_id_fk\` FOREIGN KEY (\`project_id\`) REFERENCES \`project\`(\`id\`) ON DELETE CASCADE
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`data_migration\` (
          \`name\` text PRIMARY KEY,
          \`time_completed\` integer NOT NULL
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`account_state\` (
          \`id\` integer PRIMARY KEY,
          \`active_account_id\` text,
          \`active_org_id\` text,
          CONSTRAINT \`fk_account_state_active_account_id_account_id_fk\` FOREIGN KEY (\`active_account_id\`) REFERENCES \`account\`(\`id\`) ON DELETE SET NULL
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`account\` (
          \`id\` text PRIMARY KEY,
          \`email\` text NOT NULL,
          \`url\` text NOT NULL,
          \`access_token\` text NOT NULL,
          \`refresh_token\` text NOT NULL,
          \`token_expiry\` integer,
          \`time_created\` integer NOT NULL,
          \`time_updated\` integer NOT NULL
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`control_account\` (
          \`email\` text NOT NULL,
          \`url\` text NOT NULL,
          \`access_token\` text NOT NULL,
          \`refresh_token\` text NOT NULL,
          \`token_expiry\` integer,
          \`active\` integer NOT NULL,
          \`time_created\` integer NOT NULL,
          \`time_updated\` integer NOT NULL,
          CONSTRAINT \`control_account_pk\` PRIMARY KEY(\`email\`, \`url\`)
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`credential\` (
          \`id\` text PRIMARY KEY,
          \`integration_id\` text,
          \`label\` text NOT NULL,
          \`value\` text NOT NULL,
          \`connector_id\` text,
          \`method_id\` text,
          \`active\` integer,
          \`time_created\` integer NOT NULL,
          \`time_updated\` integer NOT NULL
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`event_sequence\` (
          \`aggregate_id\` text PRIMARY KEY,
          \`seq\` integer NOT NULL,
          \`owner_id\` text
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`event\` (
          \`id\` text PRIMARY KEY,
          \`aggregate_id\` text NOT NULL,
          \`seq\` integer NOT NULL,
          \`type\` text NOT NULL,
          \`data\` text NOT NULL,
          CONSTRAINT \`fk_event_aggregate_id_event_sequence_aggregate_id_fk\` FOREIGN KEY (\`aggregate_id\`) REFERENCES \`event_sequence\`(\`aggregate_id\`) ON DELETE CASCADE
        );
      `)
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
          \`account_id\` text NOT NULL,
          \`artifact_id\` text NOT NULL,
          \`consumer_run_id\` text NOT NULL,
          \`consumer_worker_id\` text,
          \`relation\` text NOT NULL,
          \`summary\` text NOT NULL,
          \`time_created\` integer NOT NULL,
          CONSTRAINT \`lightbulb_artifact_edge_pk\` PRIMARY KEY(\`account_id\`, \`artifact_id\`, \`consumer_run_id\`, \`relation\`),
          CONSTRAINT \`fk_lightbulb_artifact_edge_account_id_lightbulb_account_id_fk\` FOREIGN KEY (\`account_id\`) REFERENCES \`lightbulb_account\`(\`id\`) ON DELETE CASCADE,
          CONSTRAINT \`fk_lightbulb_artifact_edge_artifact_id_lightbulb_artifact_id_fk\` FOREIGN KEY (\`artifact_id\`) REFERENCES \`lightbulb_artifact\`(\`id\`) ON DELETE CASCADE,
          CONSTRAINT \`fk_lightbulb_artifact_edge_consumer_run_id_lightbulb_run_id_fk\` FOREIGN KEY (\`consumer_run_id\`) REFERENCES \`lightbulb_run\`(\`id\`) ON DELETE CASCADE,
          CONSTRAINT \`lightbulb_artifact_edge_account_artifact_fk\` FOREIGN KEY (\`account_id\`,\`artifact_id\`) REFERENCES \`lightbulb_artifact\`(\`account_id\`,\`id\`) ON DELETE CASCADE,
          CONSTRAINT \`lightbulb_artifact_edge_account_consumer_run_fk\` FOREIGN KEY (\`account_id\`,\`consumer_run_id\`) REFERENCES \`lightbulb_run\`(\`account_id\`,\`id\`) ON DELETE CASCADE,
          CONSTRAINT \`lightbulb_artifact_edge_account_consumer_worker_fk\` FOREIGN KEY (\`account_id\`,\`consumer_worker_id\`) REFERENCES \`lightbulb_worker\`(\`account_id\`,\`id\`) ON DELETE CASCADE
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`lightbulb_artifact\` (
          \`id\` text PRIMARY KEY,
          \`account_id\` text NOT NULL,
          \`producer_run_id\` text,
          \`producer_worker_id\` text,
          \`task_packet_id\` text,
          \`producer_kind\` text NOT NULL,
          \`source_issue_ref\` text,
          \`source_goal_id\` text,
          \`source_loop_id\` text,
          \`source_run_id\` text,
          \`source_gate_id\` text,
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
          CONSTRAINT \`fk_lightbulb_artifact_source_goal_id_lightbulb_goal_id_fk\` FOREIGN KEY (\`source_goal_id\`) REFERENCES \`lightbulb_goal\`(\`id\`) ON DELETE SET NULL,
          CONSTRAINT \`fk_lightbulb_artifact_source_loop_id_lightbulb_loop_id_fk\` FOREIGN KEY (\`source_loop_id\`) REFERENCES \`lightbulb_loop\`(\`id\`) ON DELETE SET NULL,
          CONSTRAINT \`fk_lightbulb_artifact_source_run_id_lightbulb_run_id_fk\` FOREIGN KEY (\`source_run_id\`) REFERENCES \`lightbulb_run\`(\`id\`) ON DELETE SET NULL,
          CONSTRAINT \`lightbulb_artifact_account_run_fk\` FOREIGN KEY (\`account_id\`,\`producer_run_id\`) REFERENCES \`lightbulb_run\`(\`account_id\`,\`id\`) ON DELETE CASCADE,
          CONSTRAINT \`lightbulb_artifact_producer_worker_run_fk\` FOREIGN KEY (\`producer_worker_id\`,\`producer_run_id\`) REFERENCES \`lightbulb_worker\`(\`id\`,\`run_id\`) ON DELETE CASCADE,
          CONSTRAINT \`lightbulb_artifact_account_task_packet_fk\` FOREIGN KEY (\`account_id\`,\`task_packet_id\`) REFERENCES \`lightbulb_task_packet\`(\`account_id\`,\`id\`) ON DELETE CASCADE,
          CONSTRAINT \`lightbulb_artifact_task_packet_worker_fk\` FOREIGN KEY (\`task_packet_id\`,\`producer_worker_id\`) REFERENCES \`lightbulb_task_packet\`(\`id\`,\`worker_id\`) ON DELETE CASCADE,
          CONSTRAINT "lightbulb_artifact_producer_kind_fields" CHECK((
                "producer_kind" = 'harness'
                AND "producer_run_id" IS NULL
                AND "producer_worker_id" IS NULL
                AND "task_packet_id" IS NULL
              ) OR (
                "producer_kind" = 'worker'
                AND "producer_run_id" IS NOT NULL
                AND "producer_worker_id" IS NOT NULL
                AND "task_packet_id" IS NOT NULL
              ))
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
          \`objective\` text DEFAULT '' NOT NULL,
          \`source_ref\` text,
          \`owner_id\` text,
          \`status\` text NOT NULL,
          \`summary\` text NOT NULL,
          \`hold_reason\` text,
          \`completion_reason\` text,
          \`completed_at\` integer,
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
        CREATE TABLE \`lightbulb_pr_review_candidate\` (
          \`id\` text PRIMARY KEY,
          \`account_id\` text NOT NULL,
          \`repository\` text NOT NULL,
          \`pr_number\` integer NOT NULL,
          \`title\` text NOT NULL,
          \`url\` text NOT NULL,
          \`state\` text NOT NULL,
          \`status\` text NOT NULL,
          \`base_ref\` text NOT NULL,
          \`head_ref\` text NOT NULL,
          \`head_sha\` text,
          \`last_seen_at\` integer NOT NULL,
          \`last_checked_at\` integer NOT NULL,
          \`route_seed\` text NOT NULL,
          \`evidence\` text NOT NULL,
          \`metadata\` text,
          \`time_created\` integer NOT NULL,
          \`time_updated\` integer NOT NULL,
          CONSTRAINT \`fk_lightbulb_pr_review_candidate_account_id_lightbulb_account_id_fk\` FOREIGN KEY (\`account_id\`) REFERENCES \`lightbulb_account\`(\`id\`) ON DELETE CASCADE
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`lightbulb_route_steer\` (
          \`id\` text PRIMARY KEY,
          \`account_id\` text NOT NULL,
          \`route_id\` text NOT NULL,
          \`reason\` text NOT NULL,
          \`from_stop_id\` text,
          \`to_stop_id\` text,
          \`summary\` text NOT NULL,
          \`instruction\` text,
          \`metadata\` text,
          \`time_created\` integer NOT NULL,
          \`time_updated\` integer NOT NULL,
          CONSTRAINT \`fk_lightbulb_route_steer_account_id_lightbulb_account_id_fk\` FOREIGN KEY (\`account_id\`) REFERENCES \`lightbulb_account\`(\`id\`) ON DELETE CASCADE,
          CONSTRAINT \`fk_lightbulb_route_steer_route_id_lightbulb_route_id_fk\` FOREIGN KEY (\`route_id\`) REFERENCES \`lightbulb_route\`(\`id\`) ON DELETE CASCADE,
          CONSTRAINT \`lightbulb_route_steer_account_route_fk\` FOREIGN KEY (\`account_id\`,\`route_id\`) REFERENCES \`lightbulb_route\`(\`account_id\`,\`id\`) ON DELETE CASCADE,
          CONSTRAINT \`lightbulb_route_steer_account_from_stop_fk\` FOREIGN KEY (\`account_id\`,\`from_stop_id\`) REFERENCES \`lightbulb_route_stop\`(\`account_id\`,\`id\`) ON DELETE SET NULL,
          CONSTRAINT \`lightbulb_route_steer_account_to_stop_fk\` FOREIGN KEY (\`account_id\`,\`to_stop_id\`) REFERENCES \`lightbulb_route_stop\`(\`account_id\`,\`id\`) ON DELETE SET NULL
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`lightbulb_route_stop\` (
          \`id\` text PRIMARY KEY,
          \`account_id\` text NOT NULL,
          \`route_id\` text NOT NULL,
          \`sequence\` integer NOT NULL,
          \`kind\` text NOT NULL,
          \`status\` text NOT NULL,
          \`title\` text NOT NULL,
          \`objective\` text NOT NULL,
          \`evidence\` text NOT NULL,
          \`metadata\` text,
          \`time_created\` integer NOT NULL,
          \`time_updated\` integer NOT NULL,
          CONSTRAINT \`fk_lightbulb_route_stop_account_id_lightbulb_account_id_fk\` FOREIGN KEY (\`account_id\`) REFERENCES \`lightbulb_account\`(\`id\`) ON DELETE CASCADE,
          CONSTRAINT \`fk_lightbulb_route_stop_route_id_lightbulb_route_id_fk\` FOREIGN KEY (\`route_id\`) REFERENCES \`lightbulb_route\`(\`id\`) ON DELETE CASCADE,
          CONSTRAINT \`lightbulb_route_stop_account_route_fk\` FOREIGN KEY (\`account_id\`,\`route_id\`) REFERENCES \`lightbulb_route\`(\`account_id\`,\`id\`) ON DELETE CASCADE
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`lightbulb_route\` (
          \`id\` text PRIMARY KEY,
          \`account_id\` text NOT NULL,
          \`goal_id\` text NOT NULL,
          \`destination\` text NOT NULL,
          \`status\` text NOT NULL,
          \`current_stop_id\` text,
          \`summary\` text NOT NULL,
          \`metadata\` text,
          \`time_created\` integer NOT NULL,
          \`time_updated\` integer NOT NULL,
          CONSTRAINT \`fk_lightbulb_route_account_id_lightbulb_account_id_fk\` FOREIGN KEY (\`account_id\`) REFERENCES \`lightbulb_account\`(\`id\`) ON DELETE CASCADE,
          CONSTRAINT \`fk_lightbulb_route_goal_id_lightbulb_goal_id_fk\` FOREIGN KEY (\`goal_id\`) REFERENCES \`lightbulb_goal\`(\`id\`) ON DELETE CASCADE,
          CONSTRAINT \`lightbulb_route_account_goal_fk\` FOREIGN KEY (\`account_id\`,\`goal_id\`) REFERENCES \`lightbulb_goal\`(\`account_id\`,\`id\`) ON DELETE CASCADE
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
        CREATE TABLE \`lightbulb_scheduler_supervisor_pass\` (
          \`account_id\` text NOT NULL,
          \`pass_id\` text NOT NULL,
          \`event_id\` text,
          \`metadata\` text,
          \`time_created\` integer NOT NULL,
          \`time_updated\` integer NOT NULL,
          CONSTRAINT \`lightbulb_scheduler_supervisor_pass_pk\` PRIMARY KEY(\`account_id\`, \`pass_id\`),
          CONSTRAINT \`fk_lightbulb_scheduler_supervisor_pass_account_id_lightbulb_account_id_fk\` FOREIGN KEY (\`account_id\`) REFERENCES \`lightbulb_account\`(\`id\`) ON DELETE CASCADE,
          CONSTRAINT \`fk_lightbulb_scheduler_supervisor_pass_event_id_lightbulb_event_id_fk\` FOREIGN KEY (\`event_id\`) REFERENCES \`lightbulb_event\`(\`id\`) ON DELETE SET NULL
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
      yield* tx.run(`
        CREATE TABLE \`permission\` (
          \`id\` text PRIMARY KEY,
          \`project_id\` text NOT NULL,
          \`action\` text NOT NULL,
          \`resource\` text NOT NULL,
          \`time_created\` integer NOT NULL,
          \`time_updated\` integer NOT NULL,
          CONSTRAINT \`fk_permission_project_id_project_id_fk\` FOREIGN KEY (\`project_id\`) REFERENCES \`project\`(\`id\`) ON DELETE CASCADE
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`project_directory\` (
          \`project_id\` text NOT NULL,
          \`directory\` text NOT NULL,
          \`type\` text,
          \`strategy\` text,
          \`time_created\` integer NOT NULL,
          CONSTRAINT \`project_directory_pk\` PRIMARY KEY(\`project_id\`, \`directory\`),
          CONSTRAINT \`fk_project_directory_project_id_project_id_fk\` FOREIGN KEY (\`project_id\`) REFERENCES \`project\`(\`id\`) ON DELETE CASCADE
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`project\` (
          \`id\` text PRIMARY KEY,
          \`worktree\` text NOT NULL,
          \`vcs\` text,
          \`name\` text,
          \`icon_url\` text,
          \`icon_url_override\` text,
          \`icon_color\` text,
          \`time_created\` integer NOT NULL,
          \`time_updated\` integer NOT NULL,
          \`time_initialized\` integer,
          \`sandboxes\` text NOT NULL,
          \`commands\` text
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`message\` (
          \`id\` text PRIMARY KEY,
          \`session_id\` text NOT NULL,
          \`time_created\` integer NOT NULL,
          \`time_updated\` integer NOT NULL,
          \`data\` text NOT NULL,
          CONSTRAINT \`fk_message_session_id_session_id_fk\` FOREIGN KEY (\`session_id\`) REFERENCES \`session\`(\`id\`) ON DELETE CASCADE
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`part\` (
          \`id\` text PRIMARY KEY,
          \`message_id\` text NOT NULL,
          \`session_id\` text NOT NULL,
          \`time_created\` integer NOT NULL,
          \`time_updated\` integer NOT NULL,
          \`data\` text NOT NULL,
          CONSTRAINT \`fk_part_message_id_message_id_fk\` FOREIGN KEY (\`message_id\`) REFERENCES \`message\`(\`id\`) ON DELETE CASCADE
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`session_context_epoch\` (
          \`session_id\` text PRIMARY KEY,
          \`baseline\` text NOT NULL,
          \`agent\` text DEFAULT 'build' NOT NULL,
          \`snapshot\` text NOT NULL,
          \`baseline_seq\` integer NOT NULL,
          \`replacement_seq\` integer,
          \`revision\` integer DEFAULT 0 NOT NULL,
          CONSTRAINT \`fk_session_context_epoch_session_id_session_id_fk\` FOREIGN KEY (\`session_id\`) REFERENCES \`session\`(\`id\`) ON DELETE CASCADE
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`session_input\` (
          \`id\` text PRIMARY KEY,
          \`session_id\` text NOT NULL,
          \`prompt\` text NOT NULL,
          \`delivery\` text NOT NULL,
          \`admitted_seq\` integer NOT NULL,
          \`promoted_seq\` integer,
          \`time_created\` integer NOT NULL,
          CONSTRAINT \`fk_session_input_session_id_session_id_fk\` FOREIGN KEY (\`session_id\`) REFERENCES \`session\`(\`id\`) ON DELETE CASCADE
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`session_message\` (
          \`id\` text PRIMARY KEY,
          \`session_id\` text NOT NULL,
          \`type\` text NOT NULL,
          \`seq\` integer NOT NULL,
          \`time_created\` integer NOT NULL,
          \`time_updated\` integer NOT NULL,
          \`data\` text NOT NULL,
          CONSTRAINT \`fk_session_message_session_id_session_id_fk\` FOREIGN KEY (\`session_id\`) REFERENCES \`session\`(\`id\`) ON DELETE CASCADE
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`session\` (
          \`id\` text PRIMARY KEY,
          \`project_id\` text NOT NULL,
          \`workspace_id\` text,
          \`parent_id\` text,
          \`slug\` text NOT NULL,
          \`directory\` text NOT NULL,
          \`path\` text,
          \`title\` text NOT NULL,
          \`version\` text NOT NULL,
          \`share_url\` text,
          \`summary_additions\` integer,
          \`summary_deletions\` integer,
          \`summary_files\` integer,
          \`summary_diffs\` text,
          \`metadata\` text,
          \`cost\` real DEFAULT 0 NOT NULL,
          \`tokens_input\` integer DEFAULT 0 NOT NULL,
          \`tokens_output\` integer DEFAULT 0 NOT NULL,
          \`tokens_reasoning\` integer DEFAULT 0 NOT NULL,
          \`tokens_cache_read\` integer DEFAULT 0 NOT NULL,
          \`tokens_cache_write\` integer DEFAULT 0 NOT NULL,
          \`revert\` text,
          \`permission\` text,
          \`agent\` text,
          \`model\` text,
          \`time_created\` integer NOT NULL,
          \`time_updated\` integer NOT NULL,
          \`time_compacting\` integer,
          \`time_archived\` integer,
          CONSTRAINT \`fk_session_project_id_project_id_fk\` FOREIGN KEY (\`project_id\`) REFERENCES \`project\`(\`id\`) ON DELETE CASCADE
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`todo\` (
          \`session_id\` text NOT NULL,
          \`content\` text NOT NULL,
          \`status\` text NOT NULL,
          \`priority\` text NOT NULL,
          \`position\` integer NOT NULL,
          \`time_created\` integer NOT NULL,
          \`time_updated\` integer NOT NULL,
          CONSTRAINT \`todo_pk\` PRIMARY KEY(\`session_id\`, \`position\`),
          CONSTRAINT \`fk_todo_session_id_session_id_fk\` FOREIGN KEY (\`session_id\`) REFERENCES \`session\`(\`id\`) ON DELETE CASCADE
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`session_share\` (
          \`session_id\` text PRIMARY KEY,
          \`id\` text NOT NULL,
          \`secret\` text NOT NULL,
          \`url\` text NOT NULL,
          \`time_created\` integer NOT NULL,
          \`time_updated\` integer NOT NULL,
          CONSTRAINT \`fk_session_share_session_id_session_id_fk\` FOREIGN KEY (\`session_id\`) REFERENCES \`session\`(\`id\`) ON DELETE CASCADE
        );
      `)
      yield* tx.run(`CREATE UNIQUE INDEX \`event_aggregate_seq_idx\` ON \`event\` (\`aggregate_id\`,\`seq\`);`)
      yield* tx.run(`CREATE INDEX \`event_aggregate_type_seq_idx\` ON \`event\` (\`aggregate_id\`,\`type\`,\`seq\`);`)
      yield* tx.run(`CREATE INDEX \`lightbulb_artifact_edge_account_idx\` ON \`lightbulb_artifact_edge\` (\`account_id\`);`)
      yield* tx.run(`CREATE INDEX \`lightbulb_artifact_edge_consumer_run_idx\` ON \`lightbulb_artifact_edge\` (\`consumer_run_id\`);`)
      yield* tx.run(`CREATE INDEX \`lightbulb_artifact_account_idx\` ON \`lightbulb_artifact\` (\`account_id\`);`)
      yield* tx.run(`CREATE INDEX \`lightbulb_artifact_producer_run_idx\` ON \`lightbulb_artifact\` (\`producer_run_id\`);`)
      yield* tx.run(`CREATE INDEX \`lightbulb_artifact_producer_worker_idx\` ON \`lightbulb_artifact\` (\`producer_worker_id\`);`)
      yield* tx.run(`CREATE INDEX \`lightbulb_artifact_task_packet_idx\` ON \`lightbulb_artifact\` (\`task_packet_id\`);`)
      yield* tx.run(`CREATE INDEX \`lightbulb_artifact_source_goal_idx\` ON \`lightbulb_artifact\` (\`source_goal_id\`);`)
      yield* tx.run(`CREATE INDEX \`lightbulb_artifact_source_loop_idx\` ON \`lightbulb_artifact\` (\`source_loop_id\`);`)
      yield* tx.run(`CREATE INDEX \`lightbulb_artifact_source_run_idx\` ON \`lightbulb_artifact\` (\`source_run_id\`);`)
      yield* tx.run(`CREATE INDEX \`lightbulb_artifact_source_gate_idx\` ON \`lightbulb_artifact\` (\`source_gate_id\`);`)
      yield* tx.run(`CREATE UNIQUE INDEX \`lightbulb_artifact_account_id_idx\` ON \`lightbulb_artifact\` (\`account_id\`,\`id\`);`)
      yield* tx.run(`CREATE INDEX \`lightbulb_event_account_idx\` ON \`lightbulb_event\` (\`account_id\`);`)
      yield* tx.run(`CREATE INDEX \`lightbulb_event_aggregate_idx\` ON \`lightbulb_event\` (\`aggregate_type\`,\`aggregate_id\`,\`time_created\`);`)
      yield* tx.run(`CREATE INDEX \`lightbulb_gate_account_idx\` ON \`lightbulb_gate\` (\`account_id\`);`)
      yield* tx.run(`CREATE INDEX \`lightbulb_gate_run_idx\` ON \`lightbulb_gate\` (\`run_id\`);`)
      yield* tx.run(`CREATE INDEX \`lightbulb_goal_account_idx\` ON \`lightbulb_goal\` (\`account_id\`);`)
      yield* tx.run(`CREATE UNIQUE INDEX \`lightbulb_goal_account_source_ref_idx\` ON \`lightbulb_goal\` (\`account_id\`,\`source_ref\`);`)
      yield* tx.run(`CREATE UNIQUE INDEX \`lightbulb_goal_account_id_idx\` ON \`lightbulb_goal\` (\`account_id\`,\`id\`);`)
      yield* tx.run(`CREATE INDEX \`lightbulb_loop_account_idx\` ON \`lightbulb_loop\` (\`account_id\`);`)
      yield* tx.run(`CREATE INDEX \`lightbulb_loop_goal_idx\` ON \`lightbulb_loop\` (\`goal_id\`);`)
      yield* tx.run(`CREATE UNIQUE INDEX \`lightbulb_loop_account_id_idx\` ON \`lightbulb_loop\` (\`account_id\`,\`id\`);`)
      yield* tx.run(`CREATE INDEX \`lightbulb_pr_review_candidate_account_idx\` ON \`lightbulb_pr_review_candidate\` (\`account_id\`);`)
      yield* tx.run(`CREATE INDEX \`lightbulb_pr_review_candidate_repository_idx\` ON \`lightbulb_pr_review_candidate\` (\`account_id\`,\`repository\`);`)
      yield* tx.run(`CREATE UNIQUE INDEX \`lightbulb_pr_review_candidate_identity_idx\` ON \`lightbulb_pr_review_candidate\` (\`account_id\`,\`repository\`,\`pr_number\`);`)
      yield* tx.run(`CREATE INDEX \`lightbulb_route_steer_account_idx\` ON \`lightbulb_route_steer\` (\`account_id\`);`)
      yield* tx.run(`CREATE INDEX \`lightbulb_route_steer_route_idx\` ON \`lightbulb_route_steer\` (\`route_id\`);`)
      yield* tx.run(`CREATE INDEX \`lightbulb_route_stop_account_idx\` ON \`lightbulb_route_stop\` (\`account_id\`);`)
      yield* tx.run(`CREATE INDEX \`lightbulb_route_stop_route_idx\` ON \`lightbulb_route_stop\` (\`route_id\`);`)
      yield* tx.run(`CREATE UNIQUE INDEX \`lightbulb_route_stop_route_sequence_idx\` ON \`lightbulb_route_stop\` (\`route_id\`,\`sequence\`);`)
      yield* tx.run(`CREATE UNIQUE INDEX \`lightbulb_route_stop_account_id_idx\` ON \`lightbulb_route_stop\` (\`account_id\`,\`id\`);`)
      yield* tx.run(`CREATE INDEX \`lightbulb_route_account_idx\` ON \`lightbulb_route\` (\`account_id\`);`)
      yield* tx.run(`CREATE INDEX \`lightbulb_route_goal_idx\` ON \`lightbulb_route\` (\`goal_id\`);`)
      yield* tx.run(`CREATE UNIQUE INDEX \`lightbulb_route_account_id_idx\` ON \`lightbulb_route\` (\`account_id\`,\`id\`);`)
      yield* tx.run(`CREATE INDEX \`lightbulb_run_account_idx\` ON \`lightbulb_run\` (\`account_id\`);`)
      yield* tx.run(`CREATE INDEX \`lightbulb_run_loop_idx\` ON \`lightbulb_run\` (\`loop_id\`);`)
      yield* tx.run(`CREATE UNIQUE INDEX \`lightbulb_run_account_id_idx\` ON \`lightbulb_run\` (\`account_id\`,\`id\`);`)
      yield* tx.run(`CREATE INDEX \`lightbulb_scheduler_supervisor_pass_account_idx\` ON \`lightbulb_scheduler_supervisor_pass\` (\`account_id\`);`)
      yield* tx.run(`CREATE INDEX \`lightbulb_scheduler_supervisor_pass_event_idx\` ON \`lightbulb_scheduler_supervisor_pass\` (\`event_id\`);`)
      yield* tx.run(`CREATE INDEX \`lightbulb_task_packet_account_idx\` ON \`lightbulb_task_packet\` (\`account_id\`);`)
      yield* tx.run(`CREATE INDEX \`lightbulb_task_packet_worker_idx\` ON \`lightbulb_task_packet\` (\`worker_id\`);`)
      yield* tx.run(`CREATE UNIQUE INDEX \`lightbulb_task_packet_account_id_idx\` ON \`lightbulb_task_packet\` (\`account_id\`,\`id\`);`)
      yield* tx.run(`CREATE UNIQUE INDEX \`lightbulb_task_packet_id_worker_idx\` ON \`lightbulb_task_packet\` (\`id\`,\`worker_id\`);`)
      yield* tx.run(`CREATE INDEX \`lightbulb_worker_account_idx\` ON \`lightbulb_worker\` (\`account_id\`);`)
      yield* tx.run(`CREATE INDEX \`lightbulb_worker_run_idx\` ON \`lightbulb_worker\` (\`run_id\`);`)
      yield* tx.run(`CREATE UNIQUE INDEX \`lightbulb_worker_account_id_idx\` ON \`lightbulb_worker\` (\`account_id\`,\`id\`);`)
      yield* tx.run(`CREATE UNIQUE INDEX \`lightbulb_worker_id_run_idx\` ON \`lightbulb_worker\` (\`id\`,\`run_id\`);`)
      yield* tx.run(`CREATE UNIQUE INDEX \`permission_project_action_resource_idx\` ON \`permission\` (\`project_id\`,\`action\`,\`resource\`);`)
      yield* tx.run(`CREATE INDEX \`message_session_time_created_id_idx\` ON \`message\` (\`session_id\`,\`time_created\`,\`id\`);`)
      yield* tx.run(`CREATE INDEX \`part_message_id_id_idx\` ON \`part\` (\`message_id\`,\`id\`);`)
      yield* tx.run(`CREATE INDEX \`part_session_idx\` ON \`part\` (\`session_id\`);`)
      yield* tx.run(`CREATE INDEX \`session_input_session_pending_delivery_seq_idx\` ON \`session_input\` (\`session_id\`,\`promoted_seq\`,\`delivery\`,\`admitted_seq\`);`)
      yield* tx.run(`CREATE UNIQUE INDEX \`session_input_session_admitted_seq_idx\` ON \`session_input\` (\`session_id\`,\`admitted_seq\`);`)
      yield* tx.run(`CREATE UNIQUE INDEX \`session_input_session_promoted_seq_idx\` ON \`session_input\` (\`session_id\`,\`promoted_seq\`);`)
      yield* tx.run(`CREATE UNIQUE INDEX \`session_message_session_seq_idx\` ON \`session_message\` (\`session_id\`,\`seq\`);`)
      yield* tx.run(`CREATE INDEX \`session_message_session_type_seq_idx\` ON \`session_message\` (\`session_id\`,\`type\`,\`seq\`);`)
      yield* tx.run(`CREATE INDEX \`session_message_session_time_created_id_idx\` ON \`session_message\` (\`session_id\`,\`time_created\`,\`id\`);`)
      yield* tx.run(`CREATE INDEX \`session_message_time_created_idx\` ON \`session_message\` (\`time_created\`);`)
      yield* tx.run(`CREATE INDEX \`session_project_idx\` ON \`session\` (\`project_id\`);`)
      yield* tx.run(`CREATE INDEX \`session_workspace_idx\` ON \`session\` (\`workspace_id\`);`)
      yield* tx.run(`CREATE INDEX \`session_parent_idx\` ON \`session\` (\`parent_id\`);`)
      yield* tx.run(`CREATE INDEX \`todo_session_idx\` ON \`todo\` (\`session_id\`);`)
    })
  },
} satisfies Omit<DatabaseMigration.Migration, "id">
