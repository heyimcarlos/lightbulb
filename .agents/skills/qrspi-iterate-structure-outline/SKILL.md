---
name: qrspi-iterate-structure-outline
description: Adjust phase ordering, boundaries, or verification checkpoints in the structure outline.
disable-model-invocation: true
model: opus
---

# Iterate Structure Outline

You are adjusting the structural outline based on user feedback. Your job is to modify phase ordering, boundaries, or scope while maintaining the vertical slice constraint.

## Getting Started

When this skill is triggered:

1. **If a file path and feedback were provided**: Read the structure document fully and process the feedback.
2. **If only a file path was provided**: Read it and ask what needs adjustment.
3. **If neither**: Find the most recent `thoughts/shared/structure/` document, read it, and ask for direction.

## Process

### Step 1: Read and Understand

Read the structure document and the user's feedback. Common adjustment types:
- **Reorder phases**: Change the execution sequence
- **Split a phase**: Break a large phase into smaller ones
- **Merge phases**: Combine phases that are too granular
- **Adjust boundaries**: Move files/components between phases
- **Update scope**: Add or remove items from "What We're NOT Doing"
- **Fix verification**: Improve or change how a phase is verified

### Step 2: Validate Against Constraints

Before making changes, check that the result still satisfies:
- **Vertical slices**: Each phase still produces a verifiable increment (not a horizontal layer)
- **Phase size**: Each phase is still ~300-400 lines of change
- **First phase**: Still produces something runnable/testable end-to-end
- **Verification**: Every phase still has both automated and manual verification

If the user's requested change would violate these constraints, flag it:
```
That change would make Phase 2 a horizontal layer (all DB changes with nothing verifiable).
Instead, I'd suggest: [alternative that preserves vertical slicing].
Shall I proceed with the alternative, or do you want the horizontal approach?
```

### Step 3: Surgical Update

Use the Edit tool to update the structure document:
- Update the phase overview table
- Update individual phase sections
- Recalculate estimated line counts if phases were split/merged
- Update the "What We're NOT Doing" section if scope changed

### Step 3b: Refresh sibling HTML if it exists

After updating the markdown, check whether a sibling `.html` file exists at the same path. Apply the rule from `skills/qrspi/HTML-OUTPUT.md`:

- **Sibling `.html` exists**: Refresh the phase overview table AND the SVG timeline — both must reflect the new ordering / counts. Add, remove, or split per-phase slides as needed. Update the "What We're NOT Doing" slide if scope changed. Append an "Updated" `<aside class="meta">` to the title slide.
- **No sibling, no flag**: Skip — markdown stays canonical.
- **No sibling but `--output=html` was passed**: Generate a fresh deck per the structure documented in `qrspi-create-structure-outline`'s Step 4b.

### Step 4: Present Changes

```
Updated the structure outline:
- [What changed]
[If HTML was refreshed: HTML deck refreshed at `thoughts/shared/structure/...html`]

Phase sequence is now:
1. [Phase 1 summary] — ~[lines] lines
2. [Phase 2 summary] — ~[lines] lines
...

Does this look right, or further adjustments needed?

When approved, run the qrspi-create-plan skill.
```

## Guidelines

- Preserve the vertical slice principle even when the user pushes back. Explain why if needed.
- Don't rewrite the entire document — surgical edits only.
- If the change is architectural (not just reordering), suggest going back to the qrspi-iterate-design-discussion skill.
