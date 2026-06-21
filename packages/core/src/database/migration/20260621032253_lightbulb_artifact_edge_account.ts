import { Effect } from "effect"
import type { DatabaseMigration } from "../migration"

export default {
  id: "20260621032253_lightbulb_artifact_edge_account",
  up(tx) {
    return Effect.gen(function* () {
      yield* tx.run(`PRAGMA foreign_keys=OFF;`)
      yield* tx.run(`
        CREATE TABLE \`__new_lightbulb_artifact_edge\` (
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
      yield* tx.run(`INSERT INTO \`__new_lightbulb_artifact_edge\`(\`account_id\`, \`artifact_id\`, \`consumer_run_id\`, \`consumer_worker_id\`, \`relation\`, \`summary\`, \`time_created\`) SELECT \`lightbulb_artifact\`.\`account_id\`, \`lightbulb_artifact_edge\`.\`artifact_id\`, \`lightbulb_artifact_edge\`.\`consumer_run_id\`, \`lightbulb_artifact_edge\`.\`consumer_worker_id\`, \`lightbulb_artifact_edge\`.\`relation\`, \`lightbulb_artifact_edge\`.\`summary\`, \`lightbulb_artifact_edge\`.\`time_created\` FROM \`lightbulb_artifact_edge\` INNER JOIN \`lightbulb_artifact\` ON \`lightbulb_artifact_edge\`.\`artifact_id\` = \`lightbulb_artifact\`.\`id\`;`)
      yield* tx.run(`DROP TABLE \`lightbulb_artifact_edge\`;`)
      yield* tx.run(`ALTER TABLE \`__new_lightbulb_artifact_edge\` RENAME TO \`lightbulb_artifact_edge\`;`)
      yield* tx.run(`PRAGMA foreign_keys=ON;`)
      yield* tx.run(`CREATE INDEX \`lightbulb_artifact_edge_account_idx\` ON \`lightbulb_artifact_edge\` (\`account_id\`);`)
      yield* tx.run(`CREATE INDEX \`lightbulb_artifact_edge_consumer_run_idx\` ON \`lightbulb_artifact_edge\` (\`consumer_run_id\`);`)
      yield* tx.run(`CREATE UNIQUE INDEX \`lightbulb_artifact_account_id_idx\` ON \`lightbulb_artifact\` (\`account_id\`,\`id\`);`)
    })
  },
} satisfies DatabaseMigration.Migration
