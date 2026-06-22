# PR 48 Verification

## Policy

The final policy is full local removal, not a shim:

- `packages/opencode/package.json` exposes only `lightbulb -> ./bin/lightbulb`.
- `packages/opencode/bin/opencode` is removed.
- `packages/core/package.json` no longer declares a stale `opencode` bin.
- `bun.lock` matches those package metadata changes.
- `packages/opencode/script/build.ts` emits `dist/<platform>/bin/lightbulb` and direct build consumers install that executable.
- The old nested Lightbulb path is rejected before yargs can treat it as a project path.

## Commands

```text
$ cd packages/opencode && bun test test/cli/lightbulb.test.ts
9 pass, 0 fail

$ cd packages/opencode && bun test test/cli/help/help-snapshots.test.ts
1 pass, 0 fail, 34 snapshots

$ cd packages/opencode && bun typecheck
tsgo --noEmit

$ bun install --lockfile-only --ignore-scripts
Saved bun.lock

$ cd packages/opencode && bun run build --single --skip-embed-web-ui --skip-install
building opencode-linux-x64
Running smoke test: dist/opencode-linux-x64/bin/lightbulb --version
Smoke test passed: 0.0.0-retire-opencode-202606221913

$ test -x packages/opencode/dist/opencode-linux-x64/bin/lightbulb
pass

$ test ! -e packages/opencode/dist/opencode-linux-x64/bin/opencode
pass

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
- No `opencode` package bin entry remains in `package.json`, `packages/opencode/package.json`, `packages/core/package.json`, or `bun.lock`.

Required text grep:

```text
$ git grep -n "opencode " -- ':!node_modules' ':!bun.lock' ':!**/*.lock'
3766 matches
```

Classification:

- Historical `.lightbulb/evidence/**` files still describe the previous compatibility path and should remain immutable evidence.
- `docs/lightbulb/rebrand-and-cleanup-inventory.md` now records #48's removal decision.
- `packages/opencode/script/build.ts`, `packages/opencode/script/postinstall.mjs`, `packages/opencode/script/publish.ts`, `packages/opencode/Dockerfile`, and `nix/opencode.nix` now install or smoke-test `lightbulb`; package/archive names remain deferred substrate identifiers.
- `install`, VS Code, web/docs, and localized content are deferred distribution or upstream substrate surfaces.
- `packages/opencode/test/cli/lightbulb.test.ts` remaining matches are negative assertions proving `opencode lightbulb ...` is not shown.
- `OPENCODE_*`, `.opencode`, package names, imports, headers, and storage paths remain out of scope for this executable-surface slice.
