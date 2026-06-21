---
name: qrspi-iterate-design-discussion
description: Refine design options and converge on an architectural decision through collaborative discussion.
disable-model-invocation: true
model: opus
---

# Iterate Design Discussion

You are refining a technical design through collaborative discussion with the human. Your goal is to narrow options, resolve open questions, and converge on a single approved approach.

## Getting Started

When this skill is triggered:

1. **If a file path and feedback were provided**: Read the design document fully and process the feedback.
2. **If only a file path was provided**: Read it and ask what the user wants to discuss or change.
3. **If neither**: Find the most recent `thoughts/shared/design/` document, read it, and ask for direction.

## Process

### Step 1: Understand the Direction

Read the design document and the user's feedback. Determine what's happening:
- **Option selected**: User chose an approach — flesh it out, retire the others
- **Option rejected**: User ruled something out — document why and refine remaining options
- **Question answered**: User resolved an open question — update the document and trace implications
- **New constraint**: User introduced something not in the original design — assess impact on all options
- **Pattern override**: User says "don't follow pattern X, use Y instead" — update the chosen pattern and trace implications

### Step 2: Update the Design Document

Use the Edit tool to surgically update `thoughts/shared/design/`:

- Move the chosen approach to `## Approved Design` (replacing `## Design Options`)
- Record rejected options and reasoning under `## Resolved Decisions`
- Move answered questions from `## Open Questions` to `## Resolved Decisions`
- If a new constraint changes the design significantly, update the approach description and flag what changed

### Step 2b: Refresh sibling HTML if it exists

After updating the markdown, check whether a sibling `.html` file exists at the same path. Apply the rule from `skills/qrspi/HTML-OUTPUT.md`:

- **Sibling `.html` exists**: Refresh affected slides. Specifically: move rejected option slides into a "Resolved Decisions" section (don't delete them), promote the chosen option to a clearly-marked "Approved" slide with `badge ok`, move resolved questions out of the "Open Questions" slide, and update the recommendation. Append an "Updated" `<aside class="meta">` to the title slide.
- **No sibling, no flag**: Skip — markdown stays canonical.
- **No sibling but `--output=html` was passed**: Generate a fresh deck per the structure documented in `qrspi-create-design-discussion`'s Step 6b.

### Step 3: Validate Completeness

Before declaring the design done, check:
- [ ] All open questions are resolved
- [ ] A single approach is approved
- [ ] The chosen pattern is documented
- [ ] The gap between current and desired state is fully bridged by the design
- [ ] No contradictions between resolved decisions

If gaps remain, surface them.

### Step 4: Present Status

If consensus is reached:
```
Design approved. The document reflects the agreed approach:
`thoughts/shared/design/YYYY-MM-DD-[ticket-id]-design.md`
[If HTML was refreshed: `thoughts/shared/design/YYYY-MM-DD-[ticket-id]-design.html`]

Key decisions:
- [Decision 1]
- [Decision 2]

Next step: run the qrspi-create-structure-outline skill.
```

If still iterating:
```
Updated the design based on your feedback. Remaining open items:
1. [Open question or unresolved decision]

What's your thinking on these?
```

## Guidelines

- Preserve the discussion history. Don't delete rejected options — move them to `## Resolved Decisions` with the reasoning.
- If the user's feedback contradicts the research findings, flag it: "The research found X at `file:line` — your preference is Y. Should we proceed with Y knowing this?"
- If the user wants to investigate something the research didn't cover, suggest running the qrspi-iterate-research skill before finalizing the design.
- Keep the design document under ~200 lines. If it's growing past that, the scope needs splitting.
