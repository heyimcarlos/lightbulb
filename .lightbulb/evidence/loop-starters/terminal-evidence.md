# Loop Starters Evidence

Issue: https://github.com/heyimcarlos/lightbulb/issues/82

## Focused Verification

```bash
cd packages/core && bun test test/lightbulb-loop-starters.test.ts test/lightbulb.loop-profile.test.ts
```

Result: pass, 14 tests.

```bash
cd packages/core && bun typecheck
```

Result: pass.

```bash
cd packages/opencode && bun test test/cli/lightbulb.test.ts
```

Result: pass, 12 tests.

```bash
cd packages/opencode && bun typecheck
```

Result: pass.

```bash
git diff --check
```

Result: pass.

## CLI Smoke

```bash
./packages/opencode/bin/lightbulb loop-starters --format json
```

Result summary:

```json
{"count":6,"first":"system-discovery","last":"trace-eval","readiness":["human_gate","human_gate","human_gate","human_gate","human_gate","human_gate"]}
```

```bash
OPENCODE_DB=/tmp/lightbulb-loop-starters-smoke.db \
  ./packages/opencode/bin/lightbulb loop-starters --bootstrap --seed --format json
```

Result summary:

```json
{"starters":6,"skipped":6,"first":"system-discovery","loop":"lbloop_ef9f7331a002GoiAfhkoEhva2E_system_discovery","promoted":false,"routeStops":2}
```

Desktop screenshot: not applicable for this slice. It adds core starter metadata/bootstrap and a CLI command; it does
not change the desktop stable-v0 visual surface.
