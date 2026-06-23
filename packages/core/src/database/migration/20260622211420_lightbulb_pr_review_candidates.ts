import { Effect } from "effect"
import type { DatabaseMigration } from "../migration"

export default {
  id: "20260622211420_lightbulb_pr_review_candidates",
  up(tx) {
    return Effect.gen(function* () {
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
      yield* tx.run(`CREATE INDEX \`lightbulb_pr_review_candidate_account_idx\` ON \`lightbulb_pr_review_candidate\` (\`account_id\`);`)
      yield* tx.run(`CREATE INDEX \`lightbulb_pr_review_candidate_repository_idx\` ON \`lightbulb_pr_review_candidate\` (\`account_id\`,\`repository\`);`)
      yield* tx.run(`CREATE UNIQUE INDEX \`lightbulb_pr_review_candidate_identity_idx\` ON \`lightbulb_pr_review_candidate\` (\`account_id\`,\`repository\`,\`pr_number\`);`)
    })
  },
} satisfies DatabaseMigration.Migration
