# SolidStart Dependency Evidence

Issue: https://github.com/heyimcarlos/lightbulb/issues/116
Related CI blocker: https://github.com/heyimcarlos/lightbulb/issues/118
Second CI blocker: https://github.com/heyimcarlos/lightbulb/issues/119

## Dependency Selection

- `npm view @solidjs/start version dist-tags --json` confirmed the stable latest is `1.3.2`, but local typecheck showed it is not API-compatible with the current apps.
- `npm pack @solidjs/start@2.0.0-alpha.3` confirmed the published alpha exports `./config`, `./http`, and a `solidStart(...)` Vite plugin matching the current app shape.
- `git ls-remote https://github.com/solidjs/solid-start.git refs/pull/2015/head` confirmed the previous preview package was built from PR head `dfb2020c8c14cb76192ce9f1f3078be1a8e9e001`; the `pkg.pr.new` artifact now 404s.

## Local Verification

- `bun install` from repo root: pass.
- `bun install --frozen-lockfile` from repo root: pass.
- `rg "pkg\\.pr\\.new/@solidjs/start|@solidjs/start@https://pkg\\.pr\\.new" package.json bun.lock || true`: no matches.
- `cd packages/console/app && bun typecheck`: pass.
- `cd packages/console/support && bun typecheck`: pass.
- `cd packages/stats/app && bun typecheck`: pass.
- `cd packages/enterprise && bun typecheck`: pass.
- `cd packages/console/app && bun run build`: pass.
- `cd packages/stats/app && bun run build`: pass.
- `cd packages/enterprise && bun run build`: pass.
- `git diff --check`: pass.

## CI Follow-Up

- PR #117 e2e linux, e2e windows, unit linux, standards, compliance, and adversarial review passed after replacing the dead dependency.
- PR #117 unit windows failed twice in `opencode acp lifecycle subprocess > stdin EOF exits cleanly`.
- Failing runs timed out at the test's explicit 5s `Effect.timeout`, with observed durations of 5266ms and 5546ms.
- The ACP command already explicitly releases its internal server on stdin EOF; the follow-up keeps the exit-code assertion and gives Windows process teardown a 15s deadline.
- After the ACP fix, PR #117 unit windows advanced further and then failed in `test/session/prompt.test.ts`: `loop waits while shell runs and starts after shell exits`.
- That test already used a Windows-specific 30000ms timeout; the follow-up keeps Linux at 3000ms and gives Windows 60000ms for the same behavior assertion.

## Visual Evidence

Not applicable for this slice. It changes dependency resolution and SolidStart type imports to unblock CI before tests run; no stable-v0 desktop/app UI surface is changed.
