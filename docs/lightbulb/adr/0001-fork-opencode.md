# ADR 0001: Fork OpenCode as the Execution Substrate

- Status: Accepted
- Date: 2026-06-20

## Context

Lightbulb needs a capable TUI, provider plumbing, session runtime, diff display, and local-first development substrate. Rebuilding those would burn time on commodity infrastructure instead of the actual product: loop/goal orchestration and artifact flow.

## Options

1. Build a new harness from scratch.
2. Fork OpenCode and add Lightbulb account orchestration beside its runtime.
3. Wrap OpenCode externally without modifying it.

## Decision

Fork OpenCode into `heyimcarlos/lightbulb` and use it as the execution/session shell. Add Lightbulb's account-level domain model as a separate schema and UI surface.

## Consequences

- Faster path to working TUI/session/diff functionality.
- Must preserve upstream mergeability where possible.
- Lightbulb-specific tables/routes must be namespaced and isolated from upstream OpenCode concepts.
- Implementation agents must respect upstream OpenCode style and testing constraints.
