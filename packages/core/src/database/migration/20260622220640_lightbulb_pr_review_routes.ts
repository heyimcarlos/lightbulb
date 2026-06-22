import { Effect } from "effect"
import type { DatabaseMigration } from "../migration"

export default {
  id: "20260622220640_lightbulb_pr_review_routes",
  up(tx) {
    return Effect.gen(function* () {
      yield* tx.run(`
        CREATE TABLE \`lightbulb_pr_review_route\` (
          \`id\` text PRIMARY KEY,
          \`account_id\` text NOT NULL,
          \`candidate_id\` text NOT NULL,
          \`goal_id\` text NOT NULL,
          \`repository\` text NOT NULL,
          \`pr_number\` integer NOT NULL,
          \`title\` text NOT NULL,
          \`url\` text NOT NULL,
          \`status\` text NOT NULL,
          \`current_stop_id\` text,
          \`latest_evidence\` text,
          \`active_worker\` text,
          \`blocked_reason\` text,
          \`next_wake_source\` text,
          \`merge_ready\` integer NOT NULL,
          \`last_wake_at\` integer,
          \`metadata\` text,
          \`time_created\` integer NOT NULL,
          \`time_updated\` integer NOT NULL,
          CONSTRAINT \`fk_lightbulb_pr_review_route_account_id_lightbulb_account_id_fk\` FOREIGN KEY (\`account_id\`) REFERENCES \`lightbulb_account\`(\`id\`) ON DELETE CASCADE,
          CONSTRAINT \`fk_lightbulb_pr_review_route_candidate_id_lightbulb_pr_review_candidate_id_fk\` FOREIGN KEY (\`candidate_id\`) REFERENCES \`lightbulb_pr_review_candidate\`(\`id\`) ON DELETE CASCADE,
          CONSTRAINT \`fk_lightbulb_pr_review_route_goal_id_lightbulb_goal_id_fk\` FOREIGN KEY (\`goal_id\`) REFERENCES \`lightbulb_goal\`(\`id\`) ON DELETE CASCADE,
          CONSTRAINT \`lightbulb_pr_review_route_account_route_fk\` FOREIGN KEY (\`account_id\`,\`id\`) REFERENCES \`lightbulb_route\`(\`account_id\`,\`id\`) ON DELETE CASCADE,
          CONSTRAINT \`lightbulb_pr_review_route_account_goal_fk\` FOREIGN KEY (\`account_id\`,\`goal_id\`) REFERENCES \`lightbulb_goal\`(\`account_id\`,\`id\`) ON DELETE CASCADE,
          CONSTRAINT \`lightbulb_pr_review_route_account_current_stop_fk\` FOREIGN KEY (\`account_id\`,\`current_stop_id\`) REFERENCES \`lightbulb_route_stop\`(\`account_id\`,\`id\`) ON DELETE SET NULL
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`lightbulb_pr_review_route_wake\` (
          \`id\` text PRIMARY KEY,
          \`account_id\` text NOT NULL,
          \`route_id\` text NOT NULL,
          \`source\` text NOT NULL,
          \`summary\` text NOT NULL,
          \`evidence\` text NOT NULL,
          \`active_worker\` text,
          \`blocked_reason\` text,
          \`next_wake_source\` text,
          \`current_stop_id\` text,
          \`merge_ready\` integer NOT NULL,
          \`metadata\` text,
          \`time_created\` integer NOT NULL,
          \`time_updated\` integer NOT NULL,
          CONSTRAINT \`fk_lightbulb_pr_review_route_wake_account_id_lightbulb_account_id_fk\` FOREIGN KEY (\`account_id\`) REFERENCES \`lightbulb_account\`(\`id\`) ON DELETE CASCADE,
          CONSTRAINT \`fk_lightbulb_pr_review_route_wake_route_id_lightbulb_pr_review_route_id_fk\` FOREIGN KEY (\`route_id\`) REFERENCES \`lightbulb_pr_review_route\`(\`id\`) ON DELETE CASCADE,
          CONSTRAINT \`lightbulb_pr_review_route_wake_account_route_fk\` FOREIGN KEY (\`account_id\`,\`route_id\`) REFERENCES \`lightbulb_pr_review_route\`(\`account_id\`,\`id\`) ON DELETE CASCADE,
          CONSTRAINT \`lightbulb_pr_review_route_wake_account_current_stop_fk\` FOREIGN KEY (\`account_id\`,\`current_stop_id\`) REFERENCES \`lightbulb_route_stop\`(\`account_id\`,\`id\`) ON DELETE SET NULL
        );
      `)
      yield* tx.run(`CREATE INDEX \`lightbulb_pr_review_route_account_idx\` ON \`lightbulb_pr_review_route\` (\`account_id\`);`)
      yield* tx.run(`CREATE INDEX \`lightbulb_pr_review_route_repository_idx\` ON \`lightbulb_pr_review_route\` (\`account_id\`,\`repository\`,\`status\`);`)
      yield* tx.run(`CREATE UNIQUE INDEX \`lightbulb_pr_review_route_candidate_idx\` ON \`lightbulb_pr_review_route\` (\`account_id\`,\`candidate_id\`);`)
      yield* tx.run(`CREATE UNIQUE INDEX \`lightbulb_pr_review_route_account_id_idx\` ON \`lightbulb_pr_review_route\` (\`account_id\`,\`id\`);`)
      yield* tx.run(`CREATE INDEX \`lightbulb_pr_review_route_wake_account_idx\` ON \`lightbulb_pr_review_route_wake\` (\`account_id\`);`)
      yield* tx.run(`CREATE INDEX \`lightbulb_pr_review_route_wake_route_idx\` ON \`lightbulb_pr_review_route_wake\` (\`route_id\`,\`time_created\`);`)
    })
  },
} satisfies DatabaseMigration.Migration
