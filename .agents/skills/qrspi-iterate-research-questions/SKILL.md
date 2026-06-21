---
name: qrspi-iterate-research-questions
description: Refine research questions by adding, removing, or reframing them based on user feedback.
disable-model-invocation: true
model: opus
---

# Iterate Research Questions

You are tasked with refining the research questions document based on user feedback. The goal is to produce a clean set of research directives — free of bias and implementation intent — ready for the research agent to investigate.

## Why This Phase Exists

The questions document is the ONLY input the Research phase receives. The research agent never sees the original ticket. This iteration step ensures the questions are well-scoped, unbiased, and cover the right areas of the codebase before investigation begins.

## Getting Started

When this skill is triggered:

1. **If a file path was provided**: Read it fully and process immediately.
2. **If the user provided feedback inline** (no file path): Find the most recent `thoughts/shared/questions/` document, read it, and apply the refinements.
3. **If neither**: Ask for the path to the questions document.

## Process

### Step 1: Read the Current Questions

- Read the existing `thoughts/shared/questions/` document completely.
- Understand the current question set and its coverage.

### Step 2: Apply User Refinements

Based on the user's feedback:
- **Add questions**: Insert new questions in the appropriate category, or create a new category if needed.
- **Remove questions**: Delete questions the user flags as irrelevant or out of scope.
- **Reframe questions**: If a question leaks implementation intent or contains bias, rewrite it to ask about how the system works today without hinting at desired changes.
- **Reorganize**: Adjust categories or question ordering if the user's feedback changes the shape of the investigation.

Watch for intent contamination in any new or reframed questions — apply the same standard as the original generation.

### Step 3: Update the Document

Use the Edit tool to surgically update the questions document. Renumber questions if removals create gaps.

### Step 3b: Refresh sibling HTML if it exists

After updating the markdown, check whether a sibling `.html` file exists at the same path. Apply the rule from `skills/qrspi/HTML-OUTPUT.md`:

- **Sibling `.html` exists**: Refresh it to match the new markdown. Prefer surgical Edit on the affected slides (added/removed/reframed questions). Rewrite the full file only if changes are widespread. Append `<aside class="meta">Updated YYYY-MM-DD: [reason]</aside>` to the title slide.
- **No sibling, no flag**: Skip — markdown stays canonical.
- **No sibling but `--output=html` was passed**: Generate a fresh deck per the structure documented in `qrspi-create-research-questions`'s Step 5a.

### Step 4: Present the Updated Questions

Show the user what changed and the current state:

```
Updated the questions document:
`thoughts/shared/questions/YYYY-MM-DD-[ticket-id]-questions.md`
[If HTML was refreshed: `thoughts/shared/questions/YYYY-MM-DD-[ticket-id]-questions.html`]

Changes:
- [Added/removed/reframed Q#X: brief description]

Review the updated questions. When you're satisfied, I'll mark the document as ready-for-research and you can proceed to the Research phase.
```

When the user approves, update `**Status**` from `draft` to `complete`.

## Guidelines

- Do not add questions about implementation approach — that belongs in Design.
- Every question should be investigable by reading code, config, tests, or documentation.
- Keep the document self-contained: the research agent should understand the full scope of investigation from this file alone.
- If user feedback introduces intent contamination, flag it and suggest an objective reframing.
