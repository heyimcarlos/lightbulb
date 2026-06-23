import { Effect } from "effect"
import type { DatabaseMigration } from "../migration"

export default {
  id: "20260623224954_lightbulb_discovery_candidates",
  up(tx) {
    return Effect.gen(function* () {
      yield* tx.run(`
        CREATE TABLE \`lightbulb_discovery_candidate\` (
          \`id\` text PRIMARY KEY,
          \`account_id\` text NOT NULL,
          \`source_kind\` text NOT NULL,
          \`source_id\` text NOT NULL,
          \`title\` text NOT NULL,
          \`url\` text NOT NULL,
          \`status\` text NOT NULL,
          \`section\` text NOT NULL,
          \`score\` integer NOT NULL,
          \`reason\` text NOT NULL,
          \`suggested_action\` text NOT NULL,
          \`source_handles\` text NOT NULL,
          \`duplicate_refs\` text NOT NULL,
          \`labels\` text NOT NULL,
          \`last_seen_at\` integer NOT NULL,
          \`last_projected_at\` integer NOT NULL,
          \`metadata\` text,
          \`time_created\` integer NOT NULL,
          \`time_updated\` integer NOT NULL,
          CONSTRAINT \`fk_lightbulb_discovery_candidate_account_id_lightbulb_account_id_fk\` FOREIGN KEY (\`account_id\`) REFERENCES \`lightbulb_account\`(\`id\`) ON DELETE CASCADE
        );
      `)
      yield* tx.run(`CREATE INDEX \`lightbulb_discovery_candidate_account_idx\` ON \`lightbulb_discovery_candidate\` (\`account_id\`);`)
      yield* tx.run(`CREATE INDEX \`lightbulb_discovery_candidate_section_idx\` ON \`lightbulb_discovery_candidate\` (\`account_id\`,\`section\`,\`score\`);`)
      yield* tx.run(`CREATE UNIQUE INDEX \`lightbulb_discovery_candidate_identity_idx\` ON \`lightbulb_discovery_candidate\` (\`account_id\`,\`source_kind\`,\`source_id\`);`)
    })
  },
} satisfies DatabaseMigration.Migration
