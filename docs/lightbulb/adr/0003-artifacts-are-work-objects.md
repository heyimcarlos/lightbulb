# ADR 0003: Artifacts Are Routed Work Objects

- Status: Accepted
- Date: 2026-06-20

## Context

The user explicitly wants the harness itself to create artifacts like files, repos, plans, code, reports, and generated assets, and for artifacts to flow to and from the harness. Treating artifacts as chat attachments would recreate transcript sprawl.

## Decision

Model artifacts as first-class durable objects with type, URI/path, checksum, producer kind, producer run/worker when applicable, consumer runs/workers, status, summary, metadata, retention policy, and lineage edges.

Artifact handles are the parent-facing representation. A handle carries the artifact ID, type, URI/path, summary, status, producer kind, source references, applicable producer run/worker, and compact lineage edges. Parent summaries must pass handles and concise summaries instead of raw worker logs or full transcripts. Consumers record a lineage edge such as `consumed_by` when they use a handle, so later loops can trace produce/register/consume transitions without reopening raw output by default.

Harness-authored artifacts use the same handle shape as worker-produced artifacts but carry `producerKind: harness` and nullable worker/task producer fields. They are for PRDs, ADRs, plans, run reports, scaffolds, and operator summaries created by the harness itself. When available, they record source issue, goal, loop, run, or gate references on the handle; parent and operator summaries show those handles plus integrity and retention state, not the raw artifact body. Worker-produced artifacts continue to carry `producerKind: worker` with concrete producer run, worker, and task packet lineage.

## Consequences

- Parent orchestrators can receive artifact handles instead of raw logs.
- Review/verification loops can consume prior artifacts without rereading huge transcripts.
- The dashboard can show real work products and their state.
- Requires artifact storage rules and cleanup policy early, not as a bolt-on.

## Integrity and Retention

Registered artifacts must record either a `sha256:` checksum for local file content or an explicit unchecked reason in artifact metadata. Handle readback can re-check local files and report verified, changed, missing, or unchecked state without embedding artifact contents in parent summaries.

Retention is deterministic data-plane policy, not a model call. The cleanup decision is keep, expire, supersede, hold-for-active-run, hold-for-gate, or hold-for-dependency. Hold decisions win before expiry or supersession, so cleanup must not expire artifacts still required by active runs, pending/running/blocked gates, or unresolved dependency metadata.
