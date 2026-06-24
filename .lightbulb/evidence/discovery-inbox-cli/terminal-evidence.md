# Discovery Inbox CLI Evidence

PR: https://github.com/heyimcarlos/lightbulb/pull/109
Issue: https://github.com/heyimcarlos/lightbulb/issues/77

## Rendered Queue Line

`packages/opencode/test/cli/lightbulb.test.ts` verifies the Lightbulb dashboard formatter renders discovery candidates in the operator queue:

```text
- issue-candidate #77 top [open] score=90 action=create_pickup_packet System discovery candidate inbox
```

## Fresh Dashboard Smoke

```bash
OPENCODE_DB=/tmp/lightbulb-discovery-inbox-smoke.db ./packages/opencode/bin/lightbulb dashboard --seed --format json >/tmp/lightbulb-discovery-inbox-smoke.json
jq '.account.status, (.goals | length), (.inbox.discoveryCandidates.topActionable | length)' /tmp/lightbulb-discovery-inbox-smoke.json
```

```text
"active"
1
0
```

The seeded tracer graph has no projected discovery candidates, so `topActionable` is expected to be `0`. The dedicated core test projects issue candidates and verifies grouped dashboard state.
