# Readiness Audit Evidence

Date: 2026-06-24

## Scope

Issue #76 adds a native Lightbulb loop readiness audit over durable account graph state. This slice is CLI/dashboard
read-model work and does not change the desktop route implementation.

## Verification

```bash
cd packages/core && bun test test/lightbulb-loop-readiness.test.ts
```

Result: 1 pass, 0 fail.

```bash
cd packages/core && bun typecheck
```

Result: pass.

```bash
cd packages/opencode && bun test test/cli/lightbulb.test.ts
```

Result: 11 pass, 0 fail.

```bash
cd packages/opencode && bun typecheck
```

Result: pass.

## Local Smoke

```bash
OPENCODE_DB=/tmp/lightbulb-readiness-json.db ./packages/opencode/bin/lightbulb readiness-audit --seed --format json
```

Result: pass. The seeded tracer graph rendered one draft loop with bounded missing reasons:
`missing_profile_metadata`, `missing_state_read_model`, `missing_budget_policy`, and `missing_safe_write_policy`.

```bash
OPENCODE_DB=/tmp/lightbulb-readiness-text.db ./packages/opencode/bin/lightbulb readiness-audit --seed
```

Result: pass. The text output showed the account readiness level and per-loop missing reasons.

```bash
OPENCODE_DB=/tmp/lightbulb-dashboard-readiness.db ./packages/opencode/bin/lightbulb dashboard --seed
```

Result: pass. The dashboard rendered the new `Readiness` section plus the `lightbulb readiness-audit --account ...`
operator command.

## Desktop Evidence

Not applicable for this slice. It exposes a read-only readiness projection through core and the Lightbulb CLI/dashboard
text surface only; no desktop route files or visual components changed.
