# Issue Mutation Apply Pass Evidence

Issue: https://github.com/heyimcarlos/lightbulb/issues/52

This slice is core-only. It does not change the desktop, app, browser, TUI, or CLI render path, so desktop visual proof is
not applicable for this PR. It unblocks later human-inbox and safe-write UI work by adding the durable apply-pass seam and
focused fake-adapter tests.

## Verification

```text
$ cd packages/core && bun test test/lightbulb-issue-mutation-apply.test.ts test/lightbulb-issue-mutation-outbox.test.ts
14 pass
0 fail
76 expect() calls
Ran 14 tests across 2 files.
```

```text
$ cd packages/core && bun typecheck
$ tsgo --noEmit
```

```text
$ git diff --check
```
