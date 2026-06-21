# Issue 31 verification

Evidence packet for account loop profile bootstrap.

## Commands run from `packages/core`

- `OPENCODE_DB=/tmp/lightbulb-issue31-core-merged3.sqlite bun test test/lightbulb.loop-profile.test.ts` — 7 pass, 0 fail, 23 assertions.
- `bun typecheck` — passed (`tsgo --noEmit`).
- `bun run script/migration.ts --check` — passed; no incremental schema changes.
- `git diff --check origin/dev...HEAD` — passed.
- `wc -l src/lightbulb.ts` — 994 lines after parent thermo review; kept below 1k.

## Visual artifacts

- `deck.html` — explainer deck for the control-plane behavior.
- `verification.svg` — terminal-style verification screenshot.
