import { Effect } from "effect"
import type { DatabaseMigration } from "../migration"

export default {
  id: "20260623033253_lightbulb_worker_launch_attempt",
  up(tx) {
    return Effect.gen(function* () {
      yield* tx.run(`
        CREATE TABLE \`lightbulb_worker_launch_attempt\` (
          \`id\` text PRIMARY KEY,
          \`account_id\` text NOT NULL,
          \`run_id\` text NOT NULL,
          \`worker_id\` text NOT NULL,
          \`task_packet_id\` text NOT NULL,
          \`active_key\` text,
          \`status\` text NOT NULL,
          \`trigger\` text NOT NULL,
          \`summary\` text NOT NULL,
          \`cwd\` text NOT NULL,
          \`worktree_id\` text,
          \`command\` text NOT NULL,
          \`profile_id\` text,
          \`session_id\` text,
          \`process_id\` integer,
          \`heartbeat_uri\` text,
          \`log_uri\` text,
          \`report_uri\` text,
          \`failure_reason\` text,
          \`metadata\` text,
          \`time_created\` integer NOT NULL,
          \`time_updated\` integer NOT NULL,
          CONSTRAINT \`fk_lightbulb_worker_launch_attempt_account_id_lightbulb_account_id_fk\` FOREIGN KEY (\`account_id\`) REFERENCES \`lightbulb_account\`(\`id\`) ON DELETE CASCADE,
          CONSTRAINT \`fk_lightbulb_worker_launch_attempt_run_id_lightbulb_run_id_fk\` FOREIGN KEY (\`run_id\`) REFERENCES \`lightbulb_run\`(\`id\`) ON DELETE CASCADE,
          CONSTRAINT \`fk_lightbulb_worker_launch_attempt_worker_id_lightbulb_worker_id_fk\` FOREIGN KEY (\`worker_id\`) REFERENCES \`lightbulb_worker\`(\`id\`) ON DELETE CASCADE,
          CONSTRAINT \`fk_lightbulb_worker_launch_attempt_task_packet_id_lightbulb_task_packet_id_fk\` FOREIGN KEY (\`task_packet_id\`) REFERENCES \`lightbulb_task_packet\`(\`id\`) ON DELETE CASCADE,
          CONSTRAINT \`lightbulb_worker_launch_account_run_fk\` FOREIGN KEY (\`account_id\`,\`run_id\`) REFERENCES \`lightbulb_run\`(\`account_id\`,\`id\`) ON DELETE CASCADE,
          CONSTRAINT \`lightbulb_worker_launch_account_worker_fk\` FOREIGN KEY (\`account_id\`,\`worker_id\`) REFERENCES \`lightbulb_worker\`(\`account_id\`,\`id\`) ON DELETE CASCADE,
          CONSTRAINT \`lightbulb_worker_launch_account_task_packet_fk\` FOREIGN KEY (\`account_id\`,\`task_packet_id\`) REFERENCES \`lightbulb_task_packet\`(\`account_id\`,\`id\`) ON DELETE CASCADE,
          CONSTRAINT \`lightbulb_worker_launch_worker_run_fk\` FOREIGN KEY (\`worker_id\`,\`run_id\`) REFERENCES \`lightbulb_worker\`(\`id\`,\`run_id\`) ON DELETE CASCADE,
          CONSTRAINT \`lightbulb_worker_launch_task_packet_worker_fk\` FOREIGN KEY (\`task_packet_id\`,\`worker_id\`) REFERENCES \`lightbulb_task_packet\`(\`id\`,\`worker_id\`) ON DELETE CASCADE
        );
      `)
      yield* tx.run(`CREATE INDEX \`lightbulb_worker_launch_account_idx\` ON \`lightbulb_worker_launch_attempt\` (\`account_id\`);`)
      yield* tx.run(`CREATE INDEX \`lightbulb_worker_launch_run_idx\` ON \`lightbulb_worker_launch_attempt\` (\`run_id\`);`)
      yield* tx.run(`CREATE INDEX \`lightbulb_worker_launch_worker_idx\` ON \`lightbulb_worker_launch_attempt\` (\`worker_id\`);`)
      yield* tx.run(`CREATE INDEX \`lightbulb_worker_launch_task_packet_idx\` ON \`lightbulb_worker_launch_attempt\` (\`task_packet_id\`);`)
      yield* tx.run(`CREATE UNIQUE INDEX \`lightbulb_worker_launch_account_id_idx\` ON \`lightbulb_worker_launch_attempt\` (\`account_id\`,\`id\`);`)
      yield* tx.run(`CREATE UNIQUE INDEX \`lightbulb_worker_launch_active_key_idx\` ON \`lightbulb_worker_launch_attempt\` (\`active_key\`);`)
    })
  },
} satisfies DatabaseMigration.Migration
