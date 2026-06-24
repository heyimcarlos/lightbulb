# SolidStart Dependency Evidence

Issue: https://github.com/heyimcarlos/lightbulb/issues/116

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

## Visual Evidence

Not applicable for this slice. It changes dependency resolution and SolidStart type imports to unblock CI before tests run; no stable-v0 desktop/app UI surface is changed.
