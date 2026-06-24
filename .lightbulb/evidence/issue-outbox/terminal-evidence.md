# Issue Mutation Outbox Evidence

## Verification

- `cd packages/core && bun test test/lightbulb-issue-mutation-outbox.test.ts` - passed, 9 tests and 44 assertions.
- `cd packages/core && bun typecheck` - passed with `tsgo --noEmit`.
- `cd packages/core && bun run script/migration.ts --check` - passed, no incremental schema changes.
- `git diff --check` - passed with no whitespace errors.

## Notes

- Tests use temporary local SQLite databases and fake issue snapshots/results.
- Core outbox code records proposals and fake apply outcomes only; it does not call GitHub.
