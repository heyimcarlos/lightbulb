# ADR 0002: Use SQLite Local-First Durable State for v0

- Status: Accepted
- Date: 2026-06-20

## Context

Lightbulb needs durable state for account-level goals, loops, runs, workers, gates, task packets, and artifacts. OpenCode already uses SQLite/Drizzle locally for session/runtime state. Temporal and DBOS are useful references but too heavy for the local-first fork spike.

## Decision

Use SQLite/Drizzle for v0, with Lightbulb tables in a separate namespace/prefix. Keep the schema portable enough that a Postgres/server mode can be added later.

## Consequences

- Durable local orchestration without adding infrastructure.
- Easier integration with the existing OpenCode database/tooling.
- Requires a clean boundary between OpenCode session state and Lightbulb account work state.
