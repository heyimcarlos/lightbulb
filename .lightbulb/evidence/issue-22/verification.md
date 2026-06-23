# Issue 22 Verification

Issue: #22 worker launch adapter boundary

Worktree: `/home/ren/wt/lightbulb/worker-launch`

## Commands

- `cd packages/core && bun test test/lightbulb-worker-launch.test.ts test/lightbulb.test.ts test/lightbulb-policy.test.ts`
- `cd packages/core && bun typecheck`
- `git diff --check origin/dev...HEAD`
- `bun run script/adversarial-review.ts --base origin/dev --head HEAD`

## Results

- Worker-launch, core graph, and policy regression tests: 34 pass, 0 fail, 216 expect calls.
- Core typecheck: passed.
- Whitespace check: passed.
- Deterministic adversarial review after #92 base fix: hidden scheduled automation false positive cleared.

## CI Evidence

- #91 head before rebase passed `typecheck`, `nix-eval`, and `test` on Linux and Windows.
- #92 fixed the reviewer schedule heuristic and corrected the HttpApi query-schema fixture from `ws_test` to `wrk_test`; #92 then passed `typecheck`, `nix-eval`, and `test`.
- This branch was rebased onto the #92 merge commit before final verification.

## Runtime Evidence

The durable worker-launch tests verify:

- one active launch attempt per task packet through `active_key`
- idempotent retry of active launch attempts
- requested and launching attempts refresh into running state
- failed or blocked attempts persist terminal evidence and update worker/task/run state
- skipped launch requests record exact held/missing/mismatched dependency reasons
- parent summaries expose compact launch handles without raw child transcripts

## Visual Evidence

Desktop and browser screenshots are not applicable for this slice. The PR changes core persistence,
dashboard read-model data, and CLI formatter fixtures, not a rendered desktop or web page. This
terminal evidence card is the committed proof artifact for the CLI-facing read-model surface.
