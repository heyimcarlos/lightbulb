# Issue 80 Verification

## Scope

- Added a safe-write policy evaluator for issue mutation proposals and apply passes.
- Persisted compact safe-write evaluation handles in proposal/apply metadata.
- Projected safe-write held mutations into the human inbox as conflict actions.
- Documented least-privilege connector expectations and default no auto-merge posture.

## Commands

```bash
cd packages/core
bun test test/lightbulb-safe-write-policy.test.ts test/lightbulb-issue-mutation-outbox.test.ts test/lightbulb-issue-mutation-apply.test.ts test/lightbulb-human-inbox.test.ts
bun typecheck
```

Result: 21 pass, 0 fail; typecheck passed.

```bash
git diff --check
```

Result: passed.

```bash
OPENCODE_DB=/tmp/lightbulb-safe-write-smoke-raw.db ./packages/opencode/bin/lightbulb dashboard --seed --format json > /tmp/lightbulb-safe-write-smoke.json
jq '{account: .account, humanInbox: .inbox.humanInbox.counts, gates: (.inbox.gates | length)}' /tmp/lightbulb-safe-write-smoke.json
```

Result: fresh dashboard seed smoke passed with one approval-needed human inbox action and one pending gate.

```bash
cd packages/desktop
OPENCODE_DB=/tmp/lightbulb-safe-write-smoke-raw.db \
  OPENCODE_DESKTOP_QA_ROUTE=/lightbulb/dashboard \
  OPENCODE_DESKTOP_QA_SELECTOR="[data-page='lightbulb-dashboard']" \
  bun run qa:browser -- --out ../../.lightbulb/evidence/issue-80-desktop-qa
```

Result: desktop QA built the app, launched Electron, and captured the stable loop dashboard.

## Visual Evidence

- `.lightbulb/evidence/issue-80-desktop-qa/lightbulb-dashboard.png`
- `.lightbulb/evidence/issue-80-desktop-qa/lightbulb-dashboard.json`

The screenshot shows the rendered stable-v0 goal, current route, pickup packet, active worker, review gate, latest evidence, and runner tick state.
