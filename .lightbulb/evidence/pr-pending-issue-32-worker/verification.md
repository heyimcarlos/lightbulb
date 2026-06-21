# Issue #32 verification — bounded worker context bundle assembly

## Evidence

- Deck: `.lightbulb/evidence/pr-pending-issue-32-worker/deck.html`
- Terminal visual: `.lightbulb/evidence/pr-pending-issue-32-worker/verification.svg`
- Worker report: `.lightbulb/runs/issue-32-worker-report.md`

## Parent-side recovery

The worker reported missing dependencies. Parent materialized dependencies with:

- `BUN_INSTALL=/home/cyberjanitor/.bun BUN_TMPDIR=/tmp bun install --frozen-lockfile --ignore-scripts` — passed.

Parent rebased the worker branch onto current `origin/dev` after PR #41 merged, then fixed a TypeScript narrowing error in `context-bundle.ts` so filtered source excerpts narrow to manifest-safe `summary | excerpt` kinds.

## Checks

From `packages/core`:

- `bun test test/lightbulb-context-bundle.test.ts` — 9 pass, 0 fail, 40 assertions.
- `bun typecheck` — pass (`tsgo --noEmit`).

From repo root:

- `git diff --check origin/dev...HEAD` — pass.
- `git diff --check` — pass.

## Thermo review

- Structural shape is acceptable: the new policy/assembly logic lives in `packages/core/src/lightbulb/context-bundle.ts`, not as ad-hoc branches scattered through `lightbulb.ts`.
- The main service file remains below the 1k-line guardrail: `packages/core/src/lightbulb.ts` is 977 lines after the diff (base was 948).
- The new module is 712 lines and owns a real concept: pre-dispatch context bundle assembly, policy holds, fingerprinting, manifest storage, and spawn-ready packet creation.
- No runtime feature logic is hidden in the docs/evidence changes.
