import { Effect } from "effect"
import type { DatabaseMigration } from "../migration"

export default {
  id: "20260624100400_lightbulb_budget_usage_ledger",
  up(tx) {
    return Effect.gen(function* () {
      yield* tx.run(`
        CREATE TABLE \`lightbulb_budget_usage\` (
          \`id\` text PRIMARY KEY,
          \`account_id\` text NOT NULL,
          \`goal_id\` text NOT NULL,
          \`loop_id\` text NOT NULL,
          \`run_id\` text NOT NULL,
          \`worker_id\` text,
          \`source_kind\` text NOT NULL,
          \`idempotency_key\` text NOT NULL,
          \`source_issue_ref\` text,
          \`source_artifact_id\` text,
          \`source_artifact_uri\` text,
          \`source_artifact_summary\` text,
          \`cost_units\` real NOT NULL,
          \`token_units\` integer NOT NULL,
          \`context_units\` integer NOT NULL,
          \`approval_count\` integer NOT NULL,
          \`usage_at\` integer NOT NULL,
          \`time_created\` integer NOT NULL,
          \`time_updated\` integer NOT NULL,
          CONSTRAINT \`fk_lightbulb_budget_usage_account_id_lightbulb_account_id_fk\` FOREIGN KEY (\`account_id\`) REFERENCES \`lightbulb_account\`(\`id\`) ON DELETE CASCADE,
          CONSTRAINT \`fk_lightbulb_budget_usage_goal_id_lightbulb_goal_id_fk\` FOREIGN KEY (\`goal_id\`) REFERENCES \`lightbulb_goal\`(\`id\`) ON DELETE CASCADE,
          CONSTRAINT \`fk_lightbulb_budget_usage_loop_id_lightbulb_loop_id_fk\` FOREIGN KEY (\`loop_id\`) REFERENCES \`lightbulb_loop\`(\`id\`) ON DELETE CASCADE,
          CONSTRAINT \`fk_lightbulb_budget_usage_run_id_lightbulb_run_id_fk\` FOREIGN KEY (\`run_id\`) REFERENCES \`lightbulb_run\`(\`id\`) ON DELETE CASCADE,
          CONSTRAINT \`fk_lightbulb_budget_usage_worker_id_lightbulb_worker_id_fk\` FOREIGN KEY (\`worker_id\`) REFERENCES \`lightbulb_worker\`(\`id\`) ON DELETE SET NULL,
          CONSTRAINT \`fk_lightbulb_budget_usage_source_artifact_id_lightbulb_artifact_id_fk\` FOREIGN KEY (\`source_artifact_id\`) REFERENCES \`lightbulb_artifact\`(\`id\`) ON DELETE SET NULL,
          CONSTRAINT \`lightbulb_budget_usage_account_goal_fk\` FOREIGN KEY (\`account_id\`,\`goal_id\`) REFERENCES \`lightbulb_goal\`(\`account_id\`,\`id\`) ON DELETE CASCADE,
          CONSTRAINT \`lightbulb_budget_usage_account_loop_fk\` FOREIGN KEY (\`account_id\`,\`loop_id\`) REFERENCES \`lightbulb_loop\`(\`account_id\`,\`id\`) ON DELETE CASCADE,
          CONSTRAINT \`lightbulb_budget_usage_account_run_fk\` FOREIGN KEY (\`account_id\`,\`run_id\`) REFERENCES \`lightbulb_run\`(\`account_id\`,\`id\`) ON DELETE CASCADE,
          CONSTRAINT \`lightbulb_budget_usage_account_worker_fk\` FOREIGN KEY (\`account_id\`,\`worker_id\`) REFERENCES \`lightbulb_worker\`(\`account_id\`,\`id\`) ON DELETE SET NULL
        );
      `)
      yield* tx.run(`CREATE INDEX \`lightbulb_budget_usage_account_idx\` ON \`lightbulb_budget_usage\` (\`account_id\`);`)
      yield* tx.run(`CREATE INDEX \`lightbulb_budget_usage_loop_idx\` ON \`lightbulb_budget_usage\` (\`account_id\`,\`loop_id\`,\`usage_at\`);`)
      yield* tx.run(`CREATE INDEX \`lightbulb_budget_usage_run_idx\` ON \`lightbulb_budget_usage\` (\`account_id\`,\`run_id\`);`)
      yield* tx.run(`CREATE INDEX \`lightbulb_budget_usage_worker_idx\` ON \`lightbulb_budget_usage\` (\`account_id\`,\`worker_id\`);`)
      yield* tx.run(`CREATE UNIQUE INDEX \`lightbulb_budget_usage_idempotency_idx\` ON \`lightbulb_budget_usage\` (\`account_id\`,\`idempotency_key\`);`)
      yield* tx.run(`CREATE UNIQUE INDEX \`lightbulb_budget_usage_account_id_idx\` ON \`lightbulb_budget_usage\` (\`account_id\`,\`id\`);`)
    })
  },
} satisfies DatabaseMigration.Migration
