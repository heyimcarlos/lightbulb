# ADR 0008: Stops Mix Reusable References and Inline Overrides

- Status: Accepted
- Date: 2026-06-22

## Context

Lightbulb routes need reusable workflow structure, but the product should not become a library of rigid single-purpose
persona agents. A stop like `Review`, `Fix CI`, or `Report` often benefits from a known skill or template, while the
actual goal still needs local instructions, constraints, artifacts, and gate expectations.

## Decision

A route stop may reference reusable skills or templates and may also carry inline goal-specific instructions. Worker
dispatch resolves both into a bounded task packet with handles back to the route, stop, referenced skills, templates, and
artifacts that shaped the packet.

The reusable reference provides repeatability. The inline override adapts the stop to the current goal. Neither one
creates a fixed persona agent; the orchestrator still launches task-specific workers with narrow prompts.

## Consequences

- Users can build reusable loop patterns without losing per-goal control.
- Stop execution remains auditable because task packets can point back to the sources that shaped them.
- Lightbulb avoids both unstructured prompt soup and hard-coded role agents.
