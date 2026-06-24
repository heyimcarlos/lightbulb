# Budget Ledger Evidence

Issue: https://github.com/heyimcarlos/lightbulb/issues/27

Visual evidence: not applicable. This slice changes the Lightbulb core budget ledger/read model and scheduler hold path, not the desktop/app surface.

Verification:

```text
cd packages/core && bun test test/lightbulb-budget-ledger.test.ts
4 pass, 0 fail

cd packages/core && bun test test/lightbulb-budget-ledger.test.ts test/lightbulb-worker-report.test.ts test/lightbulb-scheduler.test.ts test/lightbulb-loop-run.test.ts test/lightbulb-operations-snapshot.test.ts
19 pass, 0 fail

cd packages/core && bun typecheck
pass

cd packages/core && bun run script/migration.ts --check
pass

git diff --check
pass
```
