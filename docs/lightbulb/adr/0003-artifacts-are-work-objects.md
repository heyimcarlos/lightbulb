# ADR 0003: Artifacts Are Routed Work Objects

- Status: Accepted
- Date: 2026-06-20

## Context

The user explicitly wants the harness itself to create artifacts like files, repos, plans, code, reports, and generated assets, and for artifacts to flow to and from the harness. Treating artifacts as chat attachments would recreate transcript sprawl.

## Decision

Model artifacts as first-class durable objects with type, URI/path, checksum, producer run/worker, consumer runs/workers, status, summary, metadata, retention policy, and lineage edges.

## Consequences

- Parent orchestrators can receive artifact handles instead of raw logs.
- Review/verification loops can consume prior artifacts without rereading huge transcripts.
- The dashboard can show real work products and their state.
- Requires artifact storage rules and cleanup policy early, not as a bolt-on.
