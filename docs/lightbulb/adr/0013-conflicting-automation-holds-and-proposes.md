# ADR 0013: Conflicting Automation Holds and Proposes

- Status: Accepted
- Date: 2026-06-22

## Context

Modern models can make useful reroute and next-action proposals when automation conflicts with human steering. That
usefulness should not erase the simple product boundary: a human route edit, hold, or risk constraint remains the
top-level signal unless a human explicitly approves applying the change.

## Decision

When automation conflicts with human steering, Lightbulb holds the conflicting automated action, records the conflict, and
may create a reroute or next-action proposal in the inbox. It does not execute the proposal unless the current human
steering explicitly approves it.

## Consequences

- Automation can still use model judgment to suggest useful route changes.
- Human steering remains authoritative unless explicitly changed.
- The inbox becomes the review surface for proposed reroutes and next actions that automation cannot safely apply.
