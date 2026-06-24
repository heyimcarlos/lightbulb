import { Effect } from "effect"
import type { DatabaseMigration } from "../migration"

export default {
  id: "20260624153000_lightbulb_human_inbox",
  up(tx) {
    return Effect.gen(function* () {
      yield* tx.run(`
        CREATE TABLE \`lightbulb_human_inbox_item\` (
          \`id\` text PRIMARY KEY,
          \`account_id\` text NOT NULL,
          \`item_key\` text NOT NULL,
          \`type\` text NOT NULL,
          \`status\` text NOT NULL,
          \`priority\` text NOT NULL,
          \`summary\` text NOT NULL,
          \`reason\` text NOT NULL,
          \`suggested_decision\` text NOT NULL,
          \`last_action\` text NOT NULL,
          \`source\` text NOT NULL,
          \`first_seen_at\` integer NOT NULL,
          \`last_seen_at\` integer NOT NULL,
          \`resolved_at\` integer,
          \`metadata\` text,
          \`time_created\` integer NOT NULL,
          \`time_updated\` integer NOT NULL,
          CONSTRAINT \`fk_lightbulb_human_inbox_item_account_id_lightbulb_account_id_fk\` FOREIGN KEY (\`account_id\`) REFERENCES \`lightbulb_account\`(\`id\`) ON DELETE CASCADE
        );
      `)
      yield* tx.run(`CREATE INDEX \`lightbulb_human_inbox_item_account_idx\` ON \`lightbulb_human_inbox_item\` (\`account_id\`);`)
      yield* tx.run(`CREATE INDEX \`lightbulb_human_inbox_item_status_idx\` ON \`lightbulb_human_inbox_item\` (\`account_id\`,\`status\`,\`priority\`);`)
      yield* tx.run(`CREATE INDEX \`lightbulb_human_inbox_item_type_idx\` ON \`lightbulb_human_inbox_item\` (\`account_id\`,\`type\`,\`status\`);`)
      yield* tx.run(`CREATE UNIQUE INDEX \`lightbulb_human_inbox_item_key_idx\` ON \`lightbulb_human_inbox_item\` (\`account_id\`,\`item_key\`);`)
      yield* tx.run(`CREATE UNIQUE INDEX \`lightbulb_human_inbox_item_account_id_idx\` ON \`lightbulb_human_inbox_item\` (\`account_id\`,\`id\`);`)
    })
  },
} satisfies DatabaseMigration.Migration
