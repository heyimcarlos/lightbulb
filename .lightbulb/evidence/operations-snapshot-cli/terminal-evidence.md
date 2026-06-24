# Operations Snapshot CLI Evidence

Issue: https://github.com/heyimcarlos/lightbulb/issues/33

## Snapshot Coverage

`packages/core/test/lightbulb-operations-snapshot.test.ts` verifies the durable operations snapshot feed with real SQLite state:

```text
3 pass, 0 fail
```

Covered states:

- empty account snapshot
- seeded dogfood route with issue #33, worker launch, review gate, and report artifact handles
- no-op scheduler tick state
- budget hold and exhausted budget reason
- dependency release evidence
- stale worker and recovery-required holds
- retry/idempotency without duplicate snapshot rows or publish events

## Operator Output

`packages/opencode/test/cli/lightbulb.test.ts` verifies the Lightbulb dashboard formatter renders operations state without raw transcripts:

```text
9 pass, 0 fail
```

The CLI formatter now prints a durable operations snapshot when present:

```text
Operations
  snapshot lbops_... [attention_required] key=latest
    1 review gate(s) need operator attention.
    nextWake=... hash=sha256:...
    counts ready=1 activeOwners=0 reviewGates=1 budgetHeld=0 dependencyReleased=0
    ready github:issue:33 issue Slice 24: loop operations snapshot feed
    review lbgate_... [pending] Parent review is pending against the report artifact.
```

## Verification

```bash
cd packages/core && bun test test/lightbulb-operations-snapshot.test.ts test/lightbulb.test.ts test/lightbulb-loop-runner-tick.test.ts test/lightbulb-scheduler.test.ts
cd packages/opencode && bun test test/cli/lightbulb.test.ts
cd packages/core && bun typecheck
cd packages/opencode && bun typecheck
cd packages/core && bun script/migration.ts --check
git diff --check
```
