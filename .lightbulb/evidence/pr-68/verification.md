# PR 68 Verification

## Visual Evidence

- `active-route.png` — desktop app route monitor with one blocked PR-review route, compact evidence, active worker, blocked reason, and next wake source.
- `empty-state.png` — same route after the seeded PR-review route was marked complete and the read-only endpoint returned no active routes.

## Runtime Checks

- `curl http://127.0.0.1:4096/lightbulb/pr-review/routes` returned one compact route before `active-route.png`.
- `curl http://127.0.0.1:4096/lightbulb/pr-review/routes` returned `{ "routes": [] }` before `empty-state.png`.

## Local Commands

- `cd packages/core && bun test test/lightbulb-pr-review-route.test.ts`
- `cd packages/app && bun test --preload ./happydom.ts ./src/pages/lightbulb-pr-review-data.test.ts`
- `cd packages/core && bun typecheck`
- `cd packages/opencode && bun typecheck`
- `cd packages/app && bun typecheck`
