# Lightbulb

Lightbulb is an account-level goal and loop orchestration harness for long-running agent work. It is built on a fork of OpenCode, which remains the execution/session substrate for the TUI, provider plumbing, tools, diffs, and local runtime.

Lightbulb owns the account-level control plane: durable goals, recurring loops, isolated workers, task packets, gates, run trees, and artifacts that move between parent orchestration and child workers.

## Current Status

This repository is the Lightbulb fork. Local development uses the `lightbulb` command from `packages/opencode` after the binary alias work from issue #44. The external release, installer, package manager, desktop, action, and hosted documentation channels have not been rebranded for Lightbulb yet, so this README does not send contributors to upstream install paths as the primary setup path.

## Local Command

From the runtime package:

```bash
cd packages/opencode
./bin/lightbulb --help
./bin/lightbulb dashboard --help
```

The `opencode` command and many `opencode` names may still appear internally. Treat those as compatibility or substrate names unless the rebrand inventory says otherwise.

## Development

Install dependencies from the repository root, then run package-local commands from the package that owns the work:

```bash
bun install
cd packages/opencode
bun typecheck
```

Tests are guarded at the repository root. Run tests from package directories such as `packages/opencode`.

## Lightbulb Docs

Start here for the Lightbulb-specific product and architecture context:

- [Lightbulb harness domain](docs/lightbulb/README.md)
- [Account orchestration harness PRD](docs/lightbulb/prd/account-orchestration-harness.md)
- [ADR 0001: Fork OpenCode as the Execution Substrate](docs/lightbulb/adr/0001-fork-opencode.md)
- [Rebrand and cleanup inventory](docs/lightbulb/rebrand-and-cleanup-inventory.md)

## Compatibility Boundary

Lightbulb is honest about its fork lineage. OpenCode remains the substrate for execution/session behavior while Lightbulb layers account orchestration on top. That is why names such as `packages/opencode`, `@opencode-ai/*`, `.opencode`, `OPENCODE_*`, and the `opencode` compatibility command are still present.

Do not rename those surfaces casually. Runtime storage, environment names, generated SDKs, package namespaces, and distribution channels need explicit compatibility slices before they move.

## Contributing

Use GitHub Issues as the request and triage surface. Ready implementation work should be scoped as a vertical slice, verified from the owning package directory, and returned with artifact handles for parent review.

See [CONTRIBUTING.md](CONTRIBUTING.md) for the inherited contribution mechanics and [docs/agents](docs/agents) for the Lightbulb agent workflow.
