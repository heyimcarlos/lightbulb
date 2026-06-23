## Result
Implemented the #73 loop profile registry/readiness slice in core: loop definitions and stored metadata now carry Cobus-style registry fields, bootstrap handles and dashboard/service read models expose compact profile summaries, malformed registry metadata returns bounded invalid-profile reasons, and docs describe the `patterns/registry.yaml` mapping.

## Evidence
- packages/core/src/lightbulb/loop-profile.ts:18 — adds bounded registry/readiness/token-cost/daily-cap types plus compact profile summary shape.
- packages/core/src/lightbulb/loop-profile.ts:252 — enriches standard Lightbulb profiles with Cobus-style registry metadata.
- packages/core/src/lightbulb/loop-profile.ts:575 — adds DB read model for compact loop profile summaries.
- packages/core/src/lightbulb/loop-profile.ts:676 — validates profile registry fields and returns `invalid_registry_metadata` with bounded `invalidProfileReasons`.
- packages/core/src/lightbulb/loop-profile.ts:959 — parses stored registry metadata without raw parser errors.
- packages/core/src/lightbulb.ts:610 — exposes `readLoopProfileSummaries` on the Lightbulb service.
- packages/core/src/lightbulb/dashboard.ts:150 — includes compact profile summaries on dashboard loops.
- packages/core/test/lightbulb.loop-profile.test.ts:136 — covers PR review, issue triage, daily triage, and status profile summaries.
- packages/core/test/lightbulb.loop-profile.test.ts:591 — covers malformed registry metadata with bounded field reasons and no loop rows.
- docs/lightbulb/README.md:30 — documents the Cobus `patterns/registry.yaml` profile shape.

## Files changed
- packages/core/src/lightbulb/loop-profile.ts — registry metadata types, standard profile metadata, bootstrap validation/storage/read-model parsing.
- packages/core/src/lightbulb.ts — Lightbulb service/dashboard types expose profile summaries.
- packages/core/src/lightbulb/dashboard.ts — dashboard loop read model includes compact profile summary.
- packages/core/test/lightbulb.loop-profile.test.ts — focused registry/readiness and invalid metadata coverage.
- packages/core/test/lightbulb.test.ts — existing dashboard fixture updated for the new profile field.
- docs/lightbulb/README.md — docs connect Lightbulb loop profiles to Cobus-style registry metadata.
- .lightbulb/runs/issue-73-worker-report.md — required worker report artifact.

## Verification
- cd packages/core && bun test test/lightbulb.loop-profile.test.ts test/lightbulb.test.ts — pass, 33 tests / 197 expects.
- cd packages/core && bun typecheck — pass.
- git diff --check — pass.

## Blockers
- none

## Next recommendation
Wire these compact profile summaries into the first route-runner/budget-gate decision path so readiness metadata starts influencing dispatch.
