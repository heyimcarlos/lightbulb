# PR 47 Verification

Issue: https://github.com/heyimcarlos/lightbulb/issues/47

## Summary

This slice makes Lightbulb command paths canonical without removing the inherited `opencode` executable yet.

- `lightbulb` remains the primary package command.
- `./bin/opencode lightbulb dashboard --help` is preserved as the explicit compatibility path until #48 decides removal or shim behavior.
- The direct `./bin/opencode` wrapper now works when Node treats extensionless package bins as ESM.
- `CONTRIBUTING.md` now teaches `lightbulb` for production command examples.
- `docs/lightbulb/rebrand-and-cleanup-inventory.md` classifies the remaining `opencode` command surface.

## Command Evidence

```text
$ cd packages/opencode
$ ./bin/lightbulb --help
Commands:
  lightbulb completion          generate shell completion script
  lightbulb acp                 start ACP (Agent Client Protocol) server
  lightbulb mcp                 manage MCP (Model Context Protocol) servers
  lightbulb [project]           start opencode tui
  lightbulb attach <url>        attach to a running opencode server
  lightbulb run [message..]     run opencode with a message
  lightbulb dashboard           show the Lightbulb account work graph
```

```text
$ ./bin/lightbulb dashboard --help
lightbulb dashboard

show the Lightbulb account work graph
```

```text
$ ./bin/opencode lightbulb dashboard --help
opencode lightbulb dashboard

show the Lightbulb account work graph
```

## Verification

```text
$ cd packages/opencode && bun test test/cli/lightbulb.test.ts
8 pass
0 fail

$ cd packages/opencode && bun typecheck
pass

$ git diff --check origin/dev...HEAD
pass
```

## Remaining `opencode` Command Grep

Required command:

```bash
git grep -n "opencode lightbulb\|opencode dashboard\|opencode --help" -- ':!node_modules' ':!bun.lock' ':!**/*.lock'
```

Remaining hits are intentional:

- Historical `.lightbulb/evidence/**` and `.lightbulb/loops/**` artifacts from earlier PRs.
- `docs/lightbulb/rebrand-and-cleanup-inventory.md` compatibility allowlist and #48 retirement notes.
- `packages/opencode/test/cli/help/help-snapshots.test.ts` comments describing inherited OpenCode help snapshot coverage.
- `packages/opencode/test/cli/lightbulb.test.ts` assertions proving the primary command avoids the nested prefix and the compatibility command still works deliberately.
