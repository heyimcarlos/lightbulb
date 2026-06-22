# PR 48 Verification

## Policy

The final policy is full local removal, not a shim:

- `packages/opencode/package.json` exposes only `lightbulb -> ./bin/lightbulb`.
- `packages/opencode/bin/opencode` is removed.
- `packages/core/package.json` no longer declares a stale `opencode` bin.
- The old nested Lightbulb path is rejected before yargs can treat it as a project path.

## Commands

```text
$ cd packages/opencode && bun test test/cli/lightbulb.test.ts
9 pass, 0 fail

$ cd packages/opencode && bun test test/cli/help/help-snapshots.test.ts
1 pass, 0 fail, 34 snapshots

$ cd packages/opencode && bun typecheck
tsgo --noEmit

$ cd packages/opencode && ./bin/lightbulb --help
Commands include: lightbulb dashboard

$ cd packages/opencode && ./bin/lightbulb dashboard --help
lightbulb dashboard
show the Lightbulb account work graph

$ test ! -e packages/opencode/bin/opencode
packages/opencode/bin/opencode absent

$ git diff --check origin/dev...HEAD
pass
```

## Grep Classification

Required package metadata grep:

```text
$ git grep -n '"opencode"' -- package.json 'packages/**/package.json'
packages/opencode/package.json:4:  "name": "opencode",
packages/web/package.json:39:    "opencode": "workspace:*",
```

Classification:

- `packages/opencode/package.json` package name is an explicitly deferred substrate/package identity.
- `packages/web/package.json` dependency is the workspace link to the runtime package, not an executable bin.
- No `opencode` package bin entry remains in `package.json`, `packages/opencode/package.json`, or `packages/core/package.json`.

Required text grep:

```text
$ git grep -n "opencode " -- ':!node_modules' ':!bun.lock' ':!**/*.lock'
3766 matches
```

Classification:

- Historical `.lightbulb/evidence/**` files still describe the previous compatibility path and should remain immutable evidence.
- `docs/lightbulb/rebrand-and-cleanup-inventory.md` now records #48's removal decision.
- `packages/opencode/script/**`, `nix/**`, `install`, Docker, VS Code, web/docs, and localized content are deferred distribution or upstream substrate surfaces.
- `packages/opencode/test/cli/lightbulb.test.ts` remaining matches are negative assertions proving `opencode lightbulb ...` is not shown.
- `OPENCODE_*`, `.opencode`, package names, imports, headers, and storage paths remain out of scope for this executable-surface slice.
