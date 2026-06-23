# Cobus Greyling Loop Engineering Ingestion

Date: 2026-06-22
Source: https://github.com/cobusgreyling/loop-engineering
Clone inspected: `/tmp/cobus-loop-engineering` at `3083782 chore(loop): daily triage update STATE.md + run log [automated] (#48)`

## Answer: Does It Implement Pickup Packets?

No, not by that name.

The repo has no literal `pickup packet`, `task packet`, or `ready-for-agent` primitive. It implements several weaker
pieces that together serve the same handoff function:

- Pattern state files such as `STATE.md`, `pr-babysitter-state.md`, and `issue-triage-state.md`.
- Triage skill output contracts with priority, why-it-matters, suggested loop action, effort, and state updates.
- Pattern-specific action hints such as `minimal-fix`, `rebase`, `watch`, `patch-in-worktree`, or `escalate-human`.
- Verifier inputs: implementer summary, diff, original issue/CI/comment, test commands, and allowed file scope.
- `LOOP.md` files that document cadence, status, limits, human gates, watched scope, and first command.
- `loop-run-log.md` entries that make each run compactly inspectable.

Lightbulb should treat `pickup packet` as a stronger product primitive that packages these scattered pieces into one
bounded worker handoff. The upstream repo proves the fields are useful; it does not yet promote them into one explicit
object.

## What The Repo Actually Implements

### Pattern Registry

`patterns/registry.yaml` is the most product-shaped asset. Each pattern records:

- `id`, `name`, `file`, `goal`
- `cadence`, `risk`, `tools`
- `skills`, `state`, `phases`, `human_gates`
- `starter`, `week_one_mode`, `token_cost`
- cost estimates: no-op, report, action, daily cap, early-exit requirement

Lightbulb translation: this is a loop profile registry plus a route-template registry. Our profiles should carry the
same operational metadata, but in database rows and exported docs rather than only YAML.

### Starters

`tools/loop-init` scaffolds loop assets. For `pr-babysitter --tool codex --dry-run`, it would create:

- `.codex/skills/pr-review-triage`
- `.codex/agents/verifier.toml`
- `.codex/skills/minimal-fix`
- `.codex/skills/loop-budget`
- `pr-babysitter-state.md`
- `LOOP.md`
- `loop-budget.md`
- `loop-run-log.md`

Lightbulb translation: admitting a loop profile should create/adopt equivalent durable objects: loop profile, route
template, stop instruction references, budget policy, run log/read model, verifier lane, and initial wake command.

### Loop Audit

`tools/loop-audit` is a readiness scorer. It detects:

- state files
- `LOOP.md`
- loop skills
- verifier presence
- triage presence
- `AGENTS.md` or `CLAUDE.md`
- safety docs
- GitHub workflows
- MCP/config mentions
- worktree evidence
- pattern registry
- budget doc, run log, budget skill
- actual loop activity

Running the built auditor against `/home/ren/repos/openbulb` returned score `39`, level `L0`, with useful caveats. The
score is not a product judgment because the auditor expects root-level markdown files and specific generic skill names,
while Lightbulb currently stores most loop design under `docs/lightbulb/` and custom skills under `.agents/skills/`.
Still, its missing-signal list is useful: root/control-plane `LOOP.md`, state/read model export, loop-budget, run-log,
pattern registry, verifier/triage recognition, MCP/capability docs, and worktree evidence.

Lightbulb translation: build a native `lightbulb audit` over the database and repo docs. It should score profile
readiness, not just file presence.

### Loop Cost

`tools/loop-cost` is a budget estimator backed by the pattern registry.

Observed estimates:

- `pr-babysitter`, 10m cadence, L1: 144 runs/day, realistic 1.54M tokens/day, 2M suggested cap, early exit required.
- `issue-triage`, 2h cadence, L1: 12 runs/day, realistic 165.6k tokens/day, above its 80k suggested cap.
- `daily-triage`, 1d cadence, L1: 1 run/day, realistic 23k tokens/day, below its 100k suggested cap.

Lightbulb translation: budget policy needs to be visible before worker dispatch. High-frequency loops should first run a
cheap watch/read phase and only spawn workers when candidate state says action is warranted.

### Dogfood Workflow

`.github/workflows/daily-triage.yml` proves a practical L1 loop:

1. Runs `loop-audit`.
2. Checks workflow health.
3. Rewrites `STATE.md`.
4. Appends a JSON object to `loop-run-log.md`.
5. Opens or updates an automated PR with the state/log changes.
6. Posts required statuses.
7. Opens a weekly loop-report issue.

Lightbulb translation: our scheduler tick/run admission/worker launch attempt spine is the right direction, but we should
also expose a compact human-readable digest and weekly report artifact.

## Fragrance Brief: Principles To Steal

1. Start every new loop at L1 report-only unless the risk is already proven low.
2. A loop pattern is not just a prompt. It includes cadence, risk, skills, state, phases, gates, budget, run log, and
   failure modes.
3. State is the product's operational memory. It must answer: what is active, what happened last time, and what needs a
   human.
4. Triage output must be structured and boring. Narrative paragraphs are an anti-pattern.
5. Cheap triage runs before expensive worker/sub-agent chains.
6. Maker/checker is mandatory before a loop can claim code work is done.
7. Human gates and denylist paths are part of the loop, not an external policy footnote.
8. Loop readiness should be auditable as a score or status, not inferred from vibes.
9. Run logs and budget logs are first-class observability, not debug leftovers.
10. Failure stories are part of the system design, because they teach where gates and budgets belong.

## Adoption Map

### Adopt

- Pattern registry fields as Lightbulb loop profile fields.
- L1/L2/L3 readiness language: report-only, assisted, unattended.
- State/read-model sections: high priority, watch list, noise, human inbox, resolved/recent.
- Pattern-specific state for PR review and issue triage.
- Run log minimum fields: run ID, pattern/profile, duration, items found, actions, escalations, token estimate, outcome,
  workflow/run handle.
- Budget fields: max runs/day, max tokens/day, max worker/sub-agent spawns/run, kill switch.
- Verifier default stance: reject until evidence is strong.
- Attempt caps and escalation after repeated failure.
- Separate state/read model per loop pattern plus shared human inbox.
- Safe write pattern: read -> worktree -> implementer -> verifier -> propose -> record -> human gate.

### Adapt

- `STATE.md` becomes Lightbulb durable read models plus optional markdown exports.
- `LOOP.md` becomes account/project loop profile manifest and dashboard detail.
- `loop-run-log.md` becomes `lightbulb_run` plus exported compact run digest.
- `loop-budget.md` becomes budget policy rows and dashboard cards.
- `loop-init` becomes profile bootstrap/admission, not file copying.
- `loop-audit` becomes a native readiness audit over routes, gates, budgets, launch attempts, connectors, and artifacts.
- `pr-babysitter-state.md` becomes the first PR-review goal route read model.
- `issue-triage-state.md` becomes the System Discovery Loop candidate inbox/read model.

### Defer

- Generic cross-tool starter export.
- Auto-merge allowlists.
- GitHub Actions as the primary orchestration substrate.
- Root-level markdown state as required runtime source of truth.
- L3 unattended code-editing loops.

### Avoid

- Copying their root-file convention directly into Lightbulb's product core.
- Treating the loop-audit score as truth for Lightbulb until we build a native audit.
- Running high-cadence PR loops without early exit.
- Having multiple loops append to one unstructured state file.
- Letting a verifier share the implementer's context.
- Granting broad MCP/GitHub write scopes before the loop has L1 evidence.

## Pickup Packet Shape For Lightbulb

Lightbulb's `Pickup Packet` should synthesize the upstream state, skill output, loop config, and verifier contracts.

Minimum fields:

- Source issue/goal/candidate reference.
- Scope.
- Non-goals.
- Blockers and human gates.
- Affected packages/paths.
- Route stop and suggested loop action.
- Risk and denylist/allowlist notes.
- Context inputs and artifact handles.
- Worker skill/template references.
- Preferred first verification command.
- Full verification commands.
- Acceptance evidence.
- Attempt budget and escalation rule.

This should live as structured Markdown in GitHub issues/comments for now and as a typed Lightbulb object later.

## Gap List For Openbulb/Lightbulb

The upstream audit exposed useful compatibility gaps:

- No root/control-plane `LOOP.md` equivalent visible to generic tools.
- No generic `STATE.md`/pattern-state export for current Lightbulb loops.
- No root `loop-budget.md`/`loop-run-log.md` export, even though durable DB concepts exist.
- No machine-readable `patterns/registry.yaml` equivalent for Lightbulb loop profiles.
- Generic audit does not recognize our `.agents/skills/lightbulb-*` skills.
- Worktree isolation is in design/docs but not visible as root-level evidence to generic tools.

These are not all product blockers. They are useful interoperability and operator-readability gaps.

## Recommended Lightbulb Slices

1. Add a Lightbulb loop profile registry/read model with Cobus-style fields.
2. Add structured `## Pickup packet` to issues promoted to `ready-for-agent`.
3. Add a native `lightbulb audit` or dashboard readiness panel for loop profiles.
4. Add budget/run-log exports from existing durable scheduler/run/worker records.
5. Add a PR-review route state export mirroring the PR babysitter state shape.
6. Add an issue/PR candidate inbox export mirroring the issue-triage state shape.

## Sources

- Repository: https://github.com/cobusgreyling/loop-engineering
- Primitives: https://github.com/cobusgreyling/loop-engineering/blob/main/docs/primitives.md
- Pattern registry: https://github.com/cobusgreyling/loop-engineering/blob/main/patterns/registry.yaml
- PR Babysitter pattern: https://github.com/cobusgreyling/loop-engineering/blob/main/patterns/pr-babysitter.md
- Issue Triage pattern: https://github.com/cobusgreyling/loop-engineering/blob/main/patterns/issue-triage.md
- Loop Design Checklist: https://github.com/cobusgreyling/loop-engineering/blob/main/docs/loop-design-checklist.md
- Operating Loops: https://github.com/cobusgreyling/loop-engineering/blob/main/docs/operating-loops.md
- Safety: https://github.com/cobusgreyling/loop-engineering/blob/main/docs/safety.md
- Safe Write Pattern: https://github.com/cobusgreyling/loop-engineering/blob/main/examples/mcp/safe-write-pattern.md
