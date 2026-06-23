import { Effect } from "effect"
import type { DatabaseMigration } from "../migration"

export default {
  id: "20260622201812_lightbulb_scheduler_supervisor_pass",
  up(tx) {
    return Effect.gen(function* () {
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
      yield* tx.run(`CREATE INDEX \`lightbulb_scheduler_supervisor_pass_account_idx\` ON \`lightbulb_scheduler_supervisor_pass\` (\`account_id\`);`)
      yield* tx.run(`CREATE INDEX \`lightbulb_scheduler_supervisor_pass_event_idx\` ON \`lightbulb_scheduler_supervisor_pass\` (\`event_id\`);`)
    })
  },
} satisfies DatabaseMigration.Migration
