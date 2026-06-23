# Issue 90 Verification

Issue: #90 worker-runtime adapter contract

Worktree: `/home/ren/wt/lightbulb/runtime-adapter`

## Commands

- `cd packages/core && bun test test/lightbulb-worker-runtime.test.ts`
- `cd packages/core && bun typecheck`
- `git diff --check origin/dev...HEAD`

## Results

- Worker-runtime adapter conformance tests: 4 pass, 0 fail, 18 expect calls.
- Core typecheck: passed.
- Whitespace check: passed.

## Contract Evidence

The focused tests verify:

- OpenCode-native execution is the default runtime descriptor.
- Runtime adapters receive a bounded launch request, not a database handle.
- Runtime results return normalized launch handles, events, stream offsets, report candidates, and artifact candidates.
- Event offsets are monotonic and idempotency-friendly.
- Runtime-native IDs stay opaque and do not become authoritative Lightbulb IDs.
- Reports and artifacts stay candidates until the Lightbulb route runner persists them.
- Local-process and Flue-shaped adapters can fit later without changing Lightbulb route/run/gate/artifact authority.

## Visual Evidence

Desktop and browser screenshots are not applicable. This PR changes a core TypeScript contract, focused conformance
tests, and domain documentation only. This terminal evidence card is the committed proof artifact for the slice.
