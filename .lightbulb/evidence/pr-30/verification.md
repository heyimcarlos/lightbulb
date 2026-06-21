# PR 30 verification

Evidence packet for decision artifact routing.

## Behavior proven

- Decision artifacts carry ADR/PRD/design status and owner metadata as durable artifact handles.
- Issue classification distinguishes `ready_for_afk`, `held_for_decision`, and `decision_rejected`.
- Worker dispatch skips held/rejected decision work with bounded artifact and gate references.
- Superseded decisions resolve only through visible accepted replacements.
- Missing required decision artifact IDs create explicit holds instead of accidental dispatch.
- Text dashboard output surfaces `decision=<status>` for operator review.

## Verification commands run

- `packages/core: bun test test/lightbulb-decision-artifact.test.ts test/lightbulb.test.ts` — passed.
- `packages/core: bun typecheck` — passed.
- `packages/core: bun run script/migration.ts --check` — passed.
- `packages/opencode: bun test test/cli/lightbulb.test.ts` — passed.
- `packages/opencode: bun typecheck` — passed.
- `git diff --check origin/dev...HEAD` — passed.

## Visual artifact

- `deck.html` — explainer deck for PR #30.
- `verification.svg` — terminal-style screenshot of the verification surface.
