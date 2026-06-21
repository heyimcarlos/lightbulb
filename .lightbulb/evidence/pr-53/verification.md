# Verification: schedule-budgets

Issue: #8 Slice 6: recurring loop schedules and budgets
Branch: `schedule-budgets`
Base: `origin/dev` at `4396ba4fc feat(cli): add primary lightbulb binary (#51)`

Commands run:

```text
BUN_INSTALL=/home/cyberjanitor/.bun BUN_TMPDIR=/tmp bun install --frozen-lockfile --ignore-scripts
cd packages/core && bun test test/lightbulb-scheduler.test.ts test/lightbulb.test.ts
cd packages/core && bun typecheck
cd packages/core && bun script/migration.ts --check
git diff --check
```

Results:

```text
bun install: 4638 packages installed
bun test: 24 pass, 0 fail
bun typecheck: exit 0
migration check: no schema changes, full migration generated successfully
git diff --check: exit 0
```

Thermo-nuclear review notes:

- Scheduler logic is isolated in `packages/core/src/lightbulb/scheduler.ts` instead of adding scheduler branches to the Lightbulb service monolith.
- The slice reuses existing loop-profile metadata rather than adding a new table/migration.
- `packages/core/src/lightbulb.ts` was kept at 999 lines after parent-side cleanup; the PR does not push it over the 1k-line guard.
