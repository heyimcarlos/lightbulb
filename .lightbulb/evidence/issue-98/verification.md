# Issue 98 Verification

## Scope

Register the ACP stdin EOF/error wait before async server setup so immediate stdin closure cannot race past the final shutdown wait on Windows.

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

## Visual Evidence

Not applicable. This is a CLI subprocess lifecycle race fix; proof is terminal verification plus Windows CI.
