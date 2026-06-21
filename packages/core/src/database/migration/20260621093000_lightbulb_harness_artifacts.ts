import { Effect } from "effect"
import type { DatabaseMigration } from "../migration"

export default {
  id: "20260621093000_lightbulb_harness_artifacts",
  up(tx) {
    return Effect.gen(function* () {
      yield* tx.run(`CREATE TEMP TABLE \`__lightbulb_artifact_edge_backup\` AS SELECT * FROM \`lightbulb_artifact_edge\`;`)
      yield* tx.run(`CREATE TEMP TABLE \`__lightbulb_gate_artifact_backup\` AS SELECT \`id\`, \`artifact_id\` FROM \`lightbulb_gate\` WHERE \`artifact_id\` IS NOT NULL;`)
      yield* tx.run(`PRAGMA foreign_keys=OFF;`)
      yield* tx.run(`
        CREATE TABLE \`__new_lightbulb_artifact\` (
          \`id\` text PRIMARY KEY,
          \`account_id\` text NOT NULL,
          \`producer_run_id\` text,
          \`producer_worker_id\` text,
          \`task_packet_id\` text,
          \`producer_kind\` text NOT NULL,
          \`source_issue_ref\` text,
          \`source_goal_id\` text,
          \`source_loop_id\` text,
          \`source_run_id\` text,
          \`source_gate_id\` text,
          \`type\` text NOT NULL,
          \`uri\` text NOT NULL,
          \`checksum\` text,
          \`status\` text NOT NULL,
          \`summary\` text NOT NULL,
          \`metadata\` text,
          \`retention_policy\` text NOT NULL,
          \`time_created\` integer NOT NULL,
          \`time_updated\` integer NOT NULL,
          CONSTRAINT \`fk_lightbulb_artifact_account_id_lightbulb_account_id_fk\` FOREIGN KEY (\`account_id\`) REFERENCES \`lightbulb_account\`(\`id\`) ON DELETE CASCADE,
          CONSTRAINT \`fk_lightbulb_artifact_producer_run_id_lightbulb_run_id_fk\` FOREIGN KEY (\`producer_run_id\`) REFERENCES \`lightbulb_run\`(\`id\`) ON DELETE CASCADE,
          CONSTRAINT \`fk_lightbulb_artifact_producer_worker_id_lightbulb_worker_id_fk\` FOREIGN KEY (\`producer_worker_id\`) REFERENCES \`lightbulb_worker\`(\`id\`) ON DELETE CASCADE,
          CONSTRAINT \`fk_lightbulb_artifact_task_packet_id_lightbulb_task_packet_id_fk\` FOREIGN KEY (\`task_packet_id\`) REFERENCES \`lightbulb_task_packet\`(\`id\`) ON DELETE CASCADE,
          CONSTRAINT \`fk_lightbulb_artifact_source_goal_id_lightbulb_goal_id_fk\` FOREIGN KEY (\`source_goal_id\`) REFERENCES \`lightbulb_goal\`(\`id\`) ON DELETE SET NULL,
          CONSTRAINT \`fk_lightbulb_artifact_source_loop_id_lightbulb_loop_id_fk\` FOREIGN KEY (\`source_loop_id\`) REFERENCES \`lightbulb_loop\`(\`id\`) ON DELETE SET NULL,
          CONSTRAINT \`fk_lightbulb_artifact_source_run_id_lightbulb_run_id_fk\` FOREIGN KEY (\`source_run_id\`) REFERENCES \`lightbulb_run\`(\`id\`) ON DELETE SET NULL,
          CONSTRAINT \`lightbulb_artifact_account_run_fk\` FOREIGN KEY (\`account_id\`,\`producer_run_id\`) REFERENCES \`lightbulb_run\`(\`account_id\`,\`id\`) ON DELETE CASCADE,
          CONSTRAINT \`lightbulb_artifact_producer_worker_run_fk\` FOREIGN KEY (\`producer_worker_id\`,\`producer_run_id\`) REFERENCES \`lightbulb_worker\`(\`id\`,\`run_id\`) ON DELETE CASCADE,
          CONSTRAINT \`lightbulb_artifact_account_task_packet_fk\` FOREIGN KEY (\`account_id\`,\`task_packet_id\`) REFERENCES \`lightbulb_task_packet\`(\`account_id\`,\`id\`) ON DELETE CASCADE,
          CONSTRAINT \`lightbulb_artifact_task_packet_worker_fk\` FOREIGN KEY (\`task_packet_id\`,\`producer_worker_id\`) REFERENCES \`lightbulb_task_packet\`(\`id\`,\`worker_id\`) ON DELETE CASCADE,
          CONSTRAINT \`lightbulb_artifact_producer_kind_fields\` CHECK ((
            \`producer_kind\` = 'harness'
            AND \`producer_run_id\` IS NULL
            AND \`producer_worker_id\` IS NULL
            AND \`task_packet_id\` IS NULL
          ) OR (
            \`producer_kind\` = 'worker'
            AND \`producer_run_id\` IS NOT NULL
            AND \`producer_worker_id\` IS NOT NULL
            AND \`task_packet_id\` IS NOT NULL
          ))
        );
      `)
      yield* tx.run(`
        INSERT INTO \`__new_lightbulb_artifact\`(
          \`id\`,
          \`account_id\`,
          \`producer_run_id\`,
          \`producer_worker_id\`,
          \`task_packet_id\`,
          \`producer_kind\`,
          \`source_issue_ref\`,
          \`source_goal_id\`,
          \`source_loop_id\`,
          \`source_run_id\`,
          \`source_gate_id\`,
          \`type\`,
          \`uri\`,
          \`checksum\`,
          \`status\`,
          \`summary\`,
          \`metadata\`,
          \`retention_policy\`,
          \`time_created\`,
          \`time_updated\`
        )
        SELECT
          \`id\`,
          \`account_id\`,
          \`producer_run_id\`,
          \`producer_worker_id\`,
          \`task_packet_id\`,
          'worker',
          NULL,
          NULL,
          NULL,
          NULL,
          NULL,
          \`type\`,
          \`uri\`,
          \`checksum\`,
          \`status\`,
          \`summary\`,
          \`metadata\`,
          \`retention_policy\`,
          \`time_created\`,
          \`time_updated\`
        FROM \`lightbulb_artifact\`;
      `)
      yield* tx.run(`DROP TABLE \`lightbulb_artifact\`;`)
      yield* tx.run(`ALTER TABLE \`__new_lightbulb_artifact\` RENAME TO \`lightbulb_artifact\`;`)
      yield* tx.run(`CREATE UNIQUE INDEX \`lightbulb_artifact_account_id_idx\` ON \`lightbulb_artifact\` (\`account_id\`,\`id\`);`)
      yield* tx.run(`
        INSERT OR IGNORE INTO \`lightbulb_artifact_edge\`(
          \`account_id\`,
          \`artifact_id\`,
          \`consumer_run_id\`,
          \`consumer_worker_id\`,
          \`relation\`,
          \`summary\`,
          \`time_created\`
        )
        SELECT
          \`account_id\`,
          \`artifact_id\`,
          \`consumer_run_id\`,
          \`consumer_worker_id\`,
          \`relation\`,
          \`summary\`,
          \`time_created\`
        FROM \`__lightbulb_artifact_edge_backup\`;
      `)
      yield* tx.run(`
        UPDATE \`lightbulb_gate\`
        SET \`artifact_id\` = (
          SELECT \`artifact_id\`
          FROM \`__lightbulb_gate_artifact_backup\`
          WHERE \`__lightbulb_gate_artifact_backup\`.\`id\` = \`lightbulb_gate\`.\`id\`
        )
        WHERE \`id\` IN (SELECT \`id\` FROM \`__lightbulb_gate_artifact_backup\`);
      `)
      yield* tx.run(`DROP TABLE \`__lightbulb_artifact_edge_backup\`;`)
      yield* tx.run(`DROP TABLE \`__lightbulb_gate_artifact_backup\`;`)
      yield* tx.run(`PRAGMA foreign_keys=ON;`)
      yield* tx.run(`CREATE INDEX \`lightbulb_artifact_account_idx\` ON \`lightbulb_artifact\` (\`account_id\`);`)
      yield* tx.run(`CREATE INDEX \`lightbulb_artifact_producer_run_idx\` ON \`lightbulb_artifact\` (\`producer_run_id\`);`)
      yield* tx.run(`CREATE INDEX \`lightbulb_artifact_producer_worker_idx\` ON \`lightbulb_artifact\` (\`producer_worker_id\`);`)
      yield* tx.run(`CREATE INDEX \`lightbulb_artifact_task_packet_idx\` ON \`lightbulb_artifact\` (\`task_packet_id\`);`)
      yield* tx.run(`CREATE INDEX \`lightbulb_artifact_source_goal_idx\` ON \`lightbulb_artifact\` (\`source_goal_id\`);`)
      yield* tx.run(`CREATE INDEX \`lightbulb_artifact_source_loop_idx\` ON \`lightbulb_artifact\` (\`source_loop_id\`);`)
      yield* tx.run(`CREATE INDEX \`lightbulb_artifact_source_run_idx\` ON \`lightbulb_artifact\` (\`source_run_id\`);`)
      yield* tx.run(`CREATE INDEX \`lightbulb_artifact_source_gate_idx\` ON \`lightbulb_artifact\` (\`source_gate_id\`);`)
    })
  },
} satisfies DatabaseMigration.Migration
