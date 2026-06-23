# PR #41 verification — install agent skills

## Evidence

- Deck: `.lightbulb/evidence/pr-41/deck.html`
- Terminal visual: `.lightbulb/evidence/pr-41/verification.svg`

## Parent-side checks

Run from `/home/cyberjanitor/worktrees/lightbulb-adapt-agents` unless noted.

- `BUN_INSTALL=/home/cyberjanitor/.bun BUN_TMPDIR=/tmp bun install --frozen-lockfile --ignore-scripts` — passed, no lockfile changes.
- `npx skills@latest list --json | jq 'length as $n | (map(.name) | unique | length) as $u | {listed:$n, unique:$u, duplicates: ($n-$u)}'` — `{ listed: 20, unique: 20, duplicates: 0 }`.
- `bun typecheck` from `packages/opencode` — passed (`tsgo --noEmit`).
- `bun test test/skill/discovery.test.ts --timeout 30000` from `packages/opencode` — 6 pass, 0 fail.
- `git diff --check origin/dev...HEAD` — passed.

## Thermo review

This is a generated skills-install diff, not new runtime logic. It removes the manually adapted `.opencode/agents/*` copies and moves the project to canonical `.agents/skills/*` content plus `skills-lock.json`. No changed file crosses 1k lines, and the diff does not add runtime branching, casts, special-case conditionals, or feature logic in shared code.
