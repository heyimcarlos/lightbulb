# Issue 31 Worker Report

## Summary

- Added the account loop profile bootstrap seam in `packages/core/src/lightbulb/loop-profile.ts`.
- Exposed `Lightbulb.Service.bootstrapLoopProfiles(...)`, standard account loop profile definitions, default policy, stable loop ID helper, and fakeable storage adapter types.
- The database-backed adapter creates/adopts one stable loop row per profile, persists schedule/budget envelopes in loop metadata, and writes `lightbulb.loop_profile.created` operator events only on first creation.
- Bootstrap returns compact created/adopted/skipped/held/invalid handles with bounded reasons and no prompt or worker transcript fields.
- Updated Lightbulb docs with how account loop profiles relate to goals, scheduler wakeups, budgets, and worker dispatch.

## Files Changed

- `packages/core/src/lightbulb.ts`
- `packages/core/src/lightbulb/loop-profile.ts`
- `packages/core/test/lightbulb.loop-profile.test.ts`
- `docs/lightbulb/README.md`
- `.lightbulb/runs/issue-31-worker-report.md`

## Verification

- Command: `git diff --check`
  - Result: passed.

- Command: `bun test test/lightbulb.loop-profile.test.ts` from `packages/core`
  - Result: failed before tests ran because this worktree has no installed dependencies.
  - Output:

```text
bun test v1.3.12 (700fc117)

test/lightbulb.loop-profile.test.ts:

# Unhandled error between tests
-------------------------------
error: Cannot find package 'drizzle-orm' from '/home/cyberjanitor/worktrees/lightbulb-issue-31/packages/core/test/lightbulb.loop-profile.test.ts'
-------------------------------

0 pass
1 fail
1 error
Ran 1 test across 1 file. [21.00ms]
```

- Command: `bun typecheck` from `packages/core`
  - Result: failed because the package-local typecheck runner dependency is not installed.
  - Output:

```text
$ tsgo --noEmit
/usr/bin/bash: line 1: tsgo: command not found
error: script "typecheck" exited with code 127
```

- Dependency install attempt: `BUN_INSTALL=/tmp/bun-install BUN_TMPDIR=/tmp/bun-tmp bun install --offline` from repo root
  - Result: failed under restricted network/incomplete cache. Representative output included `ConnectionRefused downloading package manifest drizzle-orm` and `drizzle-orm@catalog: failed to resolve`.

## Blockers

- The worktree has no `node_modules` and offline install cannot resolve required package manifests with network restricted. Focused tests and `bun typecheck` could not execute past dependency/tool resolution.

## Internal Thermo-Nuclear Self-Review

- Confirmed the loop-profile logic lives in the core Lightbulb account-state layer, not the session runner or opencode UI layer.
- Fixed result ordering so valid and invalid handles follow the input profile order.
- Tightened the DB adapter so conflict adoption and updates are scoped by loop ID, account ID, and goal ID.
- Kept schedule/budget in loop metadata for this first bootstrap slice instead of adding premature schema tables.
- `loop-profile.ts` is 742 lines, below the repo's explicit 1000-line review threshold, and is cohesive around one seam: contracts, pure bootstrap flow, and the DB storage adapter.

## Parent Review Instructions

- Inspect `packages/core/src/lightbulb/loop-profile.ts` first, especially idempotency, custom-policy preservation, and bounded reason semantics.
- After dependencies are available, run from `packages/core`:
  - `bun test test/lightbulb.loop-profile.test.ts`
  - `bun typecheck`
- Verify no live workers, GitHub calls, or model calls are launched by the tests.
