# Issue #18 Verification

## Local Commands

- `cd packages/core && bun test test/lightbulb-worker-report.test.ts` - pass, 4 tests.
- `cd packages/core && bun test test/lightbulb-worker-report.test.ts test/lightbulb-worker-launch.test.ts test/lightbulb-review-gate.test.ts test/lightbulb.test.ts` - pass, 37 tests.
- `cd packages/core && bun typecheck` - pass.
- `git diff --check` - pass.

## Read-Model Evidence

This slice is core control-plane state. The focused test verifies that worker final-report ingestion:

- transitions run, worker, task packet, and launch attempt state without a live model call
- registers worker-produced report artifacts and exposes only handles in parent summaries
- records usage totals in durable metadata and append-only `lightbulb.worker_report.ingested` events
- opens a review gate and dashboard inbox item for `needs-review` reports
- rejects missing verification evidence, wrong worker/run lineage, raw transcript content, and invalid usage totals

## Scope Notes

- No schema migration is required; final-report metadata and usage totals are stored in existing row metadata fields.
- Raw child transcripts are not accepted by the ingestion API.
- Report artifacts use the existing artifact registration and lineage tables.
