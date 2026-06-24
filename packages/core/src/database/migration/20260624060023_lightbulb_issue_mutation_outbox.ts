import { Effect } from "effect"
import type { DatabaseMigration } from "../migration"

export default {
  id: "20260624060023_lightbulb_issue_mutation_outbox",
  up(tx) {
    return Effect.gen(function* () {
      yield* tx.run(`
        CREATE TABLE \`lightbulb_issue_mutation_outbox\` (
          \`id\` text PRIMARY KEY,
          \`account_id\` text NOT NULL,
          \`source_goal_id\` text,
          \`source_loop_id\` text,
          \`source_run_id\` text,
          \`repository\` text NOT NULL,
          \`action\` text NOT NULL,
          \`status\` text NOT NULL,
          \`target_issue_number\` integer,
          \`target_issue_ref\` text,
          \`target_issue_url\` text,
          \`desired_labels\` text NOT NULL,
          \`desired_state\` text,
          \`idempotency_key\` text NOT NULL,
          \`source_handles\` text NOT NULL,
          \`rendered_mutation\` text NOT NULL,
          \`hold_reasons\` text NOT NULL,
          \`apply_summary\` text NOT NULL,
          \`apply_result\` text,
          \`metadata\` text,
          \`time_created\` integer NOT NULL,
          \`time_updated\` integer NOT NULL,
          CONSTRAINT \`fk_lightbulb_issue_mutation_outbox_account_id_lightbulb_account_id_fk\` FOREIGN KEY (\`account_id\`) REFERENCES \`lightbulb_account\`(\`id\`) ON DELETE CASCADE,
          CONSTRAINT \`fk_lightbulb_issue_mutation_outbox_source_goal_id_lightbulb_goal_id_fk\` FOREIGN KEY (\`source_goal_id\`) REFERENCES \`lightbulb_goal\`(\`id\`) ON DELETE SET NULL,
          CONSTRAINT \`fk_lightbulb_issue_mutation_outbox_source_loop_id_lightbulb_loop_id_fk\` FOREIGN KEY (\`source_loop_id\`) REFERENCES \`lightbulb_loop\`(\`id\`) ON DELETE SET NULL,
          CONSTRAINT \`fk_lightbulb_issue_mutation_outbox_source_run_id_lightbulb_run_id_fk\` FOREIGN KEY (\`source_run_id\`) REFERENCES \`lightbulb_run\`(\`id\`) ON DELETE SET NULL
        );
      `)
      yield* tx.run(`CREATE INDEX \`lightbulb_issue_mutation_outbox_account_idx\` ON \`lightbulb_issue_mutation_outbox\` (\`account_id\`);`)
      yield* tx.run(`CREATE INDEX \`lightbulb_issue_mutation_outbox_status_idx\` ON \`lightbulb_issue_mutation_outbox\` (\`account_id\`,\`status\`);`)
      yield* tx.run(`CREATE INDEX \`lightbulb_issue_mutation_outbox_target_idx\` ON \`lightbulb_issue_mutation_outbox\` (\`account_id\`,\`repository\`,\`target_issue_number\`);`)
      yield* tx.run(`CREATE UNIQUE INDEX \`lightbulb_issue_mutation_outbox_idempotency_idx\` ON \`lightbulb_issue_mutation_outbox\` (\`account_id\`,\`idempotency_key\`);`)
      yield* tx.run(`CREATE UNIQUE INDEX \`lightbulb_issue_mutation_outbox_account_id_idx\` ON \`lightbulb_issue_mutation_outbox\` (\`account_id\`,\`id\`);`)
    })
  },
} satisfies DatabaseMigration.Migration
