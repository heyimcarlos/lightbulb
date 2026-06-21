import { Effect } from "effect"
import type { DatabaseMigration } from "../migration"

export default {
  id: "20260621090000_lightbulb_goal_lifecycle",
  up(tx) {
    return Effect.gen(function* () {
      yield* tx.run("ALTER TABLE lightbulb_goal ADD objective text NOT NULL DEFAULT '';")
      yield* tx.run("ALTER TABLE lightbulb_goal ADD source_ref text;")
      yield* tx.run("ALTER TABLE lightbulb_goal ADD owner_id text;")
      yield* tx.run("ALTER TABLE lightbulb_goal ADD hold_reason text;")
      yield* tx.run("ALTER TABLE lightbulb_goal ADD completion_reason text;")
      yield* tx.run("ALTER TABLE lightbulb_goal ADD completed_at integer;")
      yield* tx.run("UPDATE lightbulb_goal SET objective = summary WHERE objective = '';")
      yield* tx.run(
        [
          "UPDATE lightbulb_goal",
          "SET status = CASE status",
          "WHEN 'open' THEN 'active'",
          "WHEN 'blocked' THEN 'held'",
          "WHEN 'verified' THEN 'completed'",
          "ELSE status END;",
        ].join(" "),
      )
      yield* tx.run(
        "UPDATE lightbulb_goal SET completed_at = time_updated WHERE status IN ('completed', 'cancelled', 'stopped');",
      )
      yield* tx.run(
        "CREATE UNIQUE INDEX lightbulb_goal_account_source_ref_idx ON lightbulb_goal (account_id,source_ref);",
      )
    })
  },
} satisfies DatabaseMigration.Migration
