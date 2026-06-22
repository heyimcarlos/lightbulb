import { Effect } from "effect"
import type { DatabaseMigration } from "../migration"

export default {
  id: "20260622221630_lightbulb_pr_review_route_active_key",
  up(tx) {
    return Effect.gen(function* () {
      yield* tx.run(`ALTER TABLE \`lightbulb_pr_review_route\` ADD \`active_repository_key\` text;`)
      yield* tx.run(`CREATE UNIQUE INDEX \`lightbulb_pr_review_route_active_repository_idx\` ON \`lightbulb_pr_review_route\` (\`account_id\`,\`active_repository_key\`);`)
    })
  },
} satisfies DatabaseMigration.Migration
