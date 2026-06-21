---
name: qrspi-create-structure-outline
description: Translate an approved design into a phased structural outline with vertical slices and verification checkpoints.
disable-model-invocation: true
model: opus
---

# Structure Outline

You are defining the structural execution strategy for an approved design. Your job is to translate the design into a phased sequence of work with clear boundaries and verification checkpoints. This is Step 4 (Structure) in the QRSPI framework.

**This is the "C header file" for the implementation.** It defines signatures, phases, and order — not the implementation details. The Plan phase will fill in the tactical steps.

## Getting Started

When this skill is triggered:

1. **If a design file path was provided**: Read it fully. Scan the args for the literal token `--output=html` and remember it for Step 4b. Begin structuring.
2. **If no input was provided**, respond with:
   ```
   I'll create a structural outline from the approved design.

   Please provide the path to the approved design document (e.g., `thoughts/shared/design/YYYY-MM-DD-[ticket-id]-design.md`).

   Append `--output=html` to also emit a reveal.js slide deck alongside the markdown.
   ```
   Then wait for input.

## Process

### Step 1: Read and Verify Design is Approved

1. Read the design document fully.
2. Verify it has a clear approved approach (not still deciding between options). If the design still has unresolved open questions, stop and suggest running the qrspi-qrspi-iterate-design-discussion skill first.
3. Read the research document referenced in the design for file-level context.

### Step 2: Define Phases Using Vertical Slices

**CRITICAL: Structure work as vertical slices, not horizontal layers.**

- **Wrong (horizontal)**: Phase 1: all DB changes → Phase 2: all service changes → Phase 3: all API changes → Phase 4: all frontend changes. Nothing is verifiable until the end.
- **Right (vertical/tracer bullet)**: Phase 1: wire end-to-end with mock data → Phase 2: add real logic for slice A → Phase 3: add real logic for slice B. Each phase produces a verifiable, working increment.

The tracer bullet approach: get something working end-to-end first (even with stubs/mocks), then add depth in subsequent passes. This gives you verifiable checkpoints after each phase instead of a wall of code at the end.

Each phase should be completable in ~300-400 lines of code change. If a phase is larger, split it.

### Step 3: Define Boundaries

For each phase, define:
- **What it includes**: Specific files and components
- **What it does NOT include**: Explicit exclusions to prevent scope creep
- **Verification checkpoint**: How you know this phase worked before moving to the next

### Step 4: Write Structure Document

Write to `thoughts/shared/structure/YYYY-MM-DD-[ticket-id]-structure.md`:

````markdown
# [Feature/Task Name] Structure Outline

## Design Reference
`thoughts/shared/design/[filename]`

## What We're NOT Doing
[Explicit scope exclusions — things that are related but deliberately out of scope]
- [Exclusion 1 and why]
- [Exclusion 2 and why]

## Phase Overview

| Phase | Description | ~Lines | Verification |
|-------|-------------|--------|--------------|
| 1 | [Tracer bullet: end-to-end wiring with stubs] | ~200 | [How to verify] |
| 2 | [Add real logic for slice A] | ~300 | [How to verify] |
| 3 | [Add real logic for slice B] | ~250 | [How to verify] |
| 4 | [Tests and edge cases] | ~200 | [How to verify] |

## Phase 1: [Tracer Bullet / End-to-End Wiring]

### Goal
[What this phase accomplishes — a working skeleton]

### Files Involved
- `path/to/file.ext` — [what changes]
- `path/to/file2.ext` — [what changes]

### Verification Checkpoint
- **Automated**: [Command that proves it works, e.g., `make test`, `npm run build`]
- **Manual**: [What the human should check visually or via manual test]

### Boundary
- Does NOT include: [explicit exclusions for this phase]

## Phase 2: [Slice A — Real Logic]

### Goal
[What this phase adds on top of Phase 1]

### Files Involved
- `path/to/file.ext` — [what changes]

### Verification Checkpoint
- **Automated**: [Command]
- **Manual**: [What to check]

### Boundary
- Does NOT include: [exclusions]

## Phase N: [Final phase]
...

## Testing Strategy
- **Unit tests**: [What gets unit tested and where]
- **Integration tests**: [What gets integration tested]
- **Manual verification**: [End-to-end scenarios the human should test after all phases]

## References
- Design: `thoughts/shared/design/[filename]`
- Research: `thoughts/shared/research/[filename]`
````

### Step 4b: Emit HTML if requested

If the input args contained `--output=html`, also write a sibling deck at `thoughts/shared/structure/YYYY-MM-DD-[ticket-id]-structure.html` following the conventions in `skills/qrspi/HTML-OUTPUT.md`.

Phase-specific slide structure for this skill:
- **Title slide**: feature, design link, date, link to markdown source.
- **What we're NOT doing**: high-contrast slide listing exclusions with rationale (use `bad`/`warn` badges to make exclusions visually obvious).
- **Phase overview**: the same table as the markdown plus an inline SVG timeline — horizontal lanes per phase, each labeled with name/line-estimate, ending in a checkpoint diamond.
- **Per-phase slides**: one slide each. Use a `card` block per phase with goal / files / verification (automated + manual side-by-side via `grid-2`) / boundary. `info` badge for tracer-bullet phases, `ok` for verified.
- **Testing strategy**: final slide with unit/integration/manual blocks side-by-side.

If `--output=html` is not present, skip this step. Markdown remains the default.

### Step 5: Present for Review

```
Structure outline written to:
`thoughts/shared/structure/YYYY-MM-DD-[ticket-id]-structure.md`
[If HTML was emitted: `thoughts/shared/structure/YYYY-MM-DD-[ticket-id]-structure.html`]

[Total phases]: [N] phases, ~[total lines] estimated lines of change

Phase sequence:
1. [Phase 1 summary] — verifiable after ~[lines] lines
2. [Phase 2 summary] — verifiable after ~[lines] lines
...

Does the ordering and scope of each phase look right? This is the last review point before the plan gets written.

Once approved, run the qrspi-create-plan skill.
```

## Guidelines

- Keep the outline to ~2 pages. If it's longer, the scope is too big.
- Every phase must have a verification checkpoint. If you can't define how to verify a phase, it's not well-defined enough.
- The first phase should always produce something runnable/testable, even if it's just stubs returning hardcoded values.
- Phase boundaries should align with natural commit points — each phase is a reasonable PR or commit.
- Don't write implementation details here. "Add the handler for X" is correct. Code snippets belong in the Plan phase.
