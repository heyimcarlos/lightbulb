# Operator Exports Evidence

Issue: https://github.com/heyimcarlos/lightbulb/issues/75
Branch: `operator-exports`

## Visual Evidence

Not applicable for this slice. The implementation adds a core read model and CLI/dashboard text access paths; it does
not change the desktop/app rendered stable-v0 loop surface. Runtime proof is terminal evidence from the actual
`lightbulb` binary.

## Runtime Smoke

```bash
OPENCODE_DB=/tmp/lightbulb-operator-export-cli.db \
  ./packages/opencode/bin/lightbulb operator-export --seed --format json
```

Result: passed. The JSON export included `state`, `budget`, and `runLog` sections plus access paths:

```text
lightbulb operator-export --account <lbacc_...>
lightbulb operator-export --account <lbacc_...> --section state
lightbulb operator-export --account <lbacc_...> --section budget
lightbulb operator-export --account <lbacc_...> --section run-log
```

```bash
OPENCODE_DB=/tmp/lightbulb-operator-export-cli-state.db \
  ./packages/opencode/bin/lightbulb operator-export --seed --section state
```

Result: passed. Text output rendered high-priority/active, watch, human inbox, noise/ignored, and resolved/recent
sections.

```bash
OPENCODE_DB=/tmp/lightbulb-operator-dashboard.db \
  ./packages/opencode/bin/lightbulb dashboard --seed
```

Result: passed. The dashboard text printed an `Operator Exports` section with the `operator-export` commands above.

## Verification

```bash
cd packages/core && bun test test/lightbulb-operator-export.test.ts
```

Result: 1 pass, 0 fail.

```bash
cd packages/core && bun test test/lightbulb-operator-export.test.ts test/lightbulb-budget-ledger.test.ts test/lightbulb-operations-snapshot.test.ts
```

Result: 8 pass, 0 fail.

```bash
cd packages/opencode && bun test test/cli/lightbulb.test.ts
```

Result: 10 pass, 0 fail.

```bash
cd packages/core && bun typecheck
```

Result: pass.

```bash
cd packages/opencode && bun typecheck
```

Result: pass.
