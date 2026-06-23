# Issue 96 Verification

## Scope

Fix `opencode acp` subprocess shutdown on stdin EOF so Windows CI does not keep the ACP command alive after the protocol input stream closes.

## Commands

```sh
cd packages/opencode && bun test --timeout 30000 test/cli/acp/lifecycle.test.ts
```

Result: 6 pass, 0 fail.

```sh
cd packages/opencode && bun typecheck
```

Result: pass.

```sh
git diff --check
```

Result: pass.

```sh
git push -u origin acp-shutdown
```

Result: pre-push `bun turbo typecheck` passed, 23 successful.

## Visual Evidence

Not applicable. This is a CLI subprocess lifecycle fix; the proof is terminal verification plus the Windows CI unit job.
