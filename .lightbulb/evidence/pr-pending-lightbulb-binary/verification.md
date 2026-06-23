# Lightbulb binary evidence

- Branch: `lightbulb-binary`
- Issues: #43, #44
- Captured: 2026-06-21T17:08:25Z

## Behavior evidence

- `packages/opencode/bin/lightbulb --help` prints a Lightbulb-rooted command list including `lightbulb dashboard`.
- `packages/opencode/bin/lightbulb dashboard --help` prints `lightbulb dashboard`, not `opencode lightbulb dashboard`.
- `OPENCODE_DB=:memory: packages/opencode/bin/lightbulb dashboard --seed --format json` returned one seeded goal and one artifact handle.
- Compatibility path is covered by `packages/opencode/test/cli/lightbulb.test.ts`: `opencode lightbulb dashboard --help` still works.

## Gate results

From `packages/opencode`:

- `bun test test/cli/lightbulb.test.ts` — passed: 5 pass, 0 fail.
- `bun typecheck` — passed.
- `OPENCODE_CLI_NAME=lightbulb bun run --conditions=browser src/index.ts --help` — passed.
- `OPENCODE_CLI_NAME=lightbulb bun run --conditions=browser src/index.ts dashboard --help` — passed.
- `OPENCODE_DB=:memory: OPENCODE_CLI_NAME=lightbulb bun run --conditions=browser src/index.ts dashboard --seed --format json` — passed.
- `./bin/lightbulb --help` — passed.
- `./bin/lightbulb dashboard --help` — passed.
- `OPENCODE_DB=:memory: ./bin/lightbulb dashboard --seed --format json` — passed.
- `git diff --check` — passed.

Build gate:

- `PATH=/tmp/bun-1.3.14/bun-linux-x64:$PATH bun run build --single --skip-embed-web-ui` — passed; smoke test passed for `dist/opencode-linux-x64/bin/opencode --version`.
- Parent review also materialized the missing `bun.lock` bin entry for `lightbulb` after running Bun 1.3.14.

## Evidence artifacts

- `lightbulb-help.txt`
- `lightbulb-dashboard-help.txt`
- `lightbulb-dashboard.json`
- `terminal-screenshot.svg`
- `explainer.html`
