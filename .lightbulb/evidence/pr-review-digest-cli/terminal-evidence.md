# PR Review Digest CLI Evidence

Issue: https://github.com/heyimcarlos/lightbulb/issues/78

Smoke database:

- `/tmp/lightbulb-pr-digest-smoke-20260623.db`
- account: `lbacc_pr_digest_smoke`

Command:

```bash
OPENCODE_DB=/tmp/lightbulb-pr-digest-smoke-20260623.db ./packages/opencode/bin/lightbulb dashboard --account lbacc_pr_digest_smoke
```

Output:

```text
Lightbulb Status
Account: PR Digest Smoke [active] lbacc_pr_digest_smoke
Totals: 1 goals, 0 loops, 0 runs, 0 gates waiting

Work
- Review heyimcarlos/lightbulb#109 [active] lbgoal_ef6dace49001v0Xa4Ft8uRg6O5
  Read-only PR review route for heyimcarlos/lightbulb#109.
  loops: none

Queue
- pr-candidate heyimcarlos/lightbulb#109 [ready/open] Add discovery candidate inbox base=lightbulb head=discovery-inbox
- pr-route heyimcarlos/lightbulb#109 [active] Add discovery candidate inbox stop=verification:active next=worker_report mergeReady=no
  PR review digest
  - pr-watch heyimcarlos/lightbulb#109 [ci_red] attempts=1/2 stop=verification:active next=worker_report decision=none last=Windows unit check failed on the current head.

Artifacts
- none
```

Evidence checks:

- Renders the PR babysitter digest in the operator dashboard output.
- Shows current status, attempts, route stop, next wake source, human decision, and last action.
- Does not expose the seeded `rawTranscript` field from route wake metadata.
