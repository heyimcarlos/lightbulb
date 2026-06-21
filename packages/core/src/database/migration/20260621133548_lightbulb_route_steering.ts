import { Effect } from "effect"
import type { DatabaseMigration } from "../migration"

export default {
  id: "20260621133548_lightbulb_route_steering",
  up(tx) {
    return Effect.gen(function* () {
      yield* tx.run(`
        CREATE TABLE \`lightbulb_route_steer\` (
          \`id\` text PRIMARY KEY,
          \`account_id\` text NOT NULL,
          \`route_id\` text NOT NULL,
          \`reason\` text NOT NULL,
          \`from_stop_id\` text,
          \`to_stop_id\` text,
          \`summary\` text NOT NULL,
          \`instruction\` text,
          \`metadata\` text,
          \`time_created\` integer NOT NULL,
          \`time_updated\` integer NOT NULL,
          CONSTRAINT \`fk_lightbulb_route_steer_account_id_lightbulb_account_id_fk\` FOREIGN KEY (\`account_id\`) REFERENCES \`lightbulb_account\`(\`id\`) ON DELETE CASCADE,
          CONSTRAINT \`fk_lightbulb_route_steer_route_id_lightbulb_route_id_fk\` FOREIGN KEY (\`route_id\`) REFERENCES \`lightbulb_route\`(\`id\`) ON DELETE CASCADE,
          CONSTRAINT \`lightbulb_route_steer_account_route_fk\` FOREIGN KEY (\`account_id\`,\`route_id\`) REFERENCES \`lightbulb_route\`(\`account_id\`,\`id\`) ON DELETE CASCADE,
          CONSTRAINT \`lightbulb_route_steer_account_from_stop_fk\` FOREIGN KEY (\`account_id\`,\`from_stop_id\`) REFERENCES \`lightbulb_route_stop\`(\`account_id\`,\`id\`) ON DELETE SET NULL,
          CONSTRAINT \`lightbulb_route_steer_account_to_stop_fk\` FOREIGN KEY (\`account_id\`,\`to_stop_id\`) REFERENCES \`lightbulb_route_stop\`(\`account_id\`,\`id\`) ON DELETE SET NULL
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`lightbulb_route_stop\` (
          \`id\` text PRIMARY KEY,
          \`account_id\` text NOT NULL,
          \`route_id\` text NOT NULL,
          \`sequence\` integer NOT NULL,
          \`kind\` text NOT NULL,
          \`status\` text NOT NULL,
          \`title\` text NOT NULL,
          \`objective\` text NOT NULL,
          \`evidence\` text NOT NULL,
          \`metadata\` text,
          \`time_created\` integer NOT NULL,
          \`time_updated\` integer NOT NULL,
          CONSTRAINT \`fk_lightbulb_route_stop_account_id_lightbulb_account_id_fk\` FOREIGN KEY (\`account_id\`) REFERENCES \`lightbulb_account\`(\`id\`) ON DELETE CASCADE,
          CONSTRAINT \`fk_lightbulb_route_stop_route_id_lightbulb_route_id_fk\` FOREIGN KEY (\`route_id\`) REFERENCES \`lightbulb_route\`(\`id\`) ON DELETE CASCADE,
          CONSTRAINT \`lightbulb_route_stop_account_route_fk\` FOREIGN KEY (\`account_id\`,\`route_id\`) REFERENCES \`lightbulb_route\`(\`account_id\`,\`id\`) ON DELETE CASCADE
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`lightbulb_route\` (
          \`id\` text PRIMARY KEY,
          \`account_id\` text NOT NULL,
          \`goal_id\` text NOT NULL,
          \`destination\` text NOT NULL,
          \`status\` text NOT NULL,
          \`current_stop_id\` text,
          \`summary\` text NOT NULL,
          \`metadata\` text,
          \`time_created\` integer NOT NULL,
          \`time_updated\` integer NOT NULL,
          CONSTRAINT \`fk_lightbulb_route_account_id_lightbulb_account_id_fk\` FOREIGN KEY (\`account_id\`) REFERENCES \`lightbulb_account\`(\`id\`) ON DELETE CASCADE,
          CONSTRAINT \`fk_lightbulb_route_goal_id_lightbulb_goal_id_fk\` FOREIGN KEY (\`goal_id\`) REFERENCES \`lightbulb_goal\`(\`id\`) ON DELETE CASCADE,
          CONSTRAINT \`lightbulb_route_account_goal_fk\` FOREIGN KEY (\`account_id\`,\`goal_id\`) REFERENCES \`lightbulb_goal\`(\`account_id\`,\`id\`) ON DELETE CASCADE
        );
      `)
      yield* tx.run(`CREATE UNIQUE INDEX \`lightbulb_goal_account_id_idx\` ON \`lightbulb_goal\` (\`account_id\`,\`id\`);`)
      yield* tx.run(`CREATE INDEX \`lightbulb_route_steer_account_idx\` ON \`lightbulb_route_steer\` (\`account_id\`);`)
      yield* tx.run(`CREATE INDEX \`lightbulb_route_steer_route_idx\` ON \`lightbulb_route_steer\` (\`route_id\`);`)
      yield* tx.run(`CREATE INDEX \`lightbulb_route_stop_account_idx\` ON \`lightbulb_route_stop\` (\`account_id\`);`)
      yield* tx.run(`CREATE INDEX \`lightbulb_route_stop_route_idx\` ON \`lightbulb_route_stop\` (\`route_id\`);`)
      yield* tx.run(`CREATE UNIQUE INDEX \`lightbulb_route_stop_route_sequence_idx\` ON \`lightbulb_route_stop\` (\`route_id\`,\`sequence\`);`)
      yield* tx.run(`CREATE UNIQUE INDEX \`lightbulb_route_stop_account_id_idx\` ON \`lightbulb_route_stop\` (\`account_id\`,\`id\`);`)
      yield* tx.run(`CREATE INDEX \`lightbulb_route_account_idx\` ON \`lightbulb_route\` (\`account_id\`);`)
      yield* tx.run(`CREATE INDEX \`lightbulb_route_goal_idx\` ON \`lightbulb_route\` (\`goal_id\`);`)
      yield* tx.run(`CREATE UNIQUE INDEX \`lightbulb_route_account_id_idx\` ON \`lightbulb_route\` (\`account_id\`,\`id\`);`)
    })
  },
} satisfies DatabaseMigration.Migration
