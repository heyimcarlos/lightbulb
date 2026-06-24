import { Effect } from "effect"
import type { DatabaseMigration } from "../migration"

export default {
  id: "20260624041642_lightbulb_operations_snapshot",
  up(tx) {
    return Effect.gen(function* () {
      yield* tx.run(`
        CREATE TABLE \`lightbulb_operations_snapshot\` (
          \`id\` text PRIMARY KEY,
          \`account_id\` text NOT NULL,
          \`snapshot_key\` text NOT NULL,
          \`status\` text NOT NULL,
          \`summary\` text NOT NULL,
          \`source_hash\` text NOT NULL,
          \`generated_at\` integer NOT NULL,
          \`next_wake_at\` integer,
          \`counts\` text NOT NULL,
          \`handles\` text NOT NULL,
          \`metadata\` text,
          \`time_created\` integer NOT NULL,
          \`time_updated\` integer NOT NULL,
          CONSTRAINT \`fk_lightbulb_operations_snapshot_account_id_lightbulb_account_id_fk\` FOREIGN KEY (\`account_id\`) REFERENCES \`lightbulb_account\`(\`id\`) ON DELETE CASCADE
        );
      `)
      yield* tx.run(`CREATE INDEX \`lightbulb_operations_snapshot_account_idx\` ON \`lightbulb_operations_snapshot\` (\`account_id\`);`)
      yield* tx.run(`CREATE INDEX \`lightbulb_operations_snapshot_status_idx\` ON \`lightbulb_operations_snapshot\` (\`account_id\`,\`status\`);`)
      yield* tx.run(`CREATE UNIQUE INDEX \`lightbulb_operations_snapshot_key_idx\` ON \`lightbulb_operations_snapshot\` (\`account_id\`,\`snapshot_key\`);`)
      yield* tx.run(`CREATE UNIQUE INDEX \`lightbulb_operations_snapshot_account_id_idx\` ON \`lightbulb_operations_snapshot\` (\`account_id\`,\`id\`);`)
    })
  },
} satisfies DatabaseMigration.Migration
