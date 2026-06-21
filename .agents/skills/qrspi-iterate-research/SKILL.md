---
name: qrspi-iterate-research
description: Deepen or correct codebase research based on user feedback using targeted sub-agents.
disable-model-invocation: true
model: opus
---

# Iterate Research

You are expanding on existing codebase research based on user feedback. Your job is to surgically update the research document with new findings while maintaining objectivity.

## Getting Started

When this skill is triggered:

1. **If a file path and feedback were provided**: Read the research document fully and begin investigation.
2. **If only a file path was provided**: Read it and ask what areas need deeper investigation.
3. **If neither**: Find the most recent `thoughts/shared/research/` document, read it, and ask for feedback.

## Process

### Step 1: Understand the Gap

Read the existing research document and the user's feedback. Categorize what's needed:
- **Missing area**: A component or data flow not covered at all
- **Shallow coverage**: An area mentioned but not traced deeply enough
- **Incorrect finding**: Something the research got wrong
- **New connection**: A dependency or integration the initial research missed

### Step 2: Targeted Investigation

Spawn only the agents needed for the specific gap:

- **Missing area or new connection**: Spawn **codebase-locator** to find relevant files, then **codebase-analyzer** to trace the implementation.
- **Shallow coverage**: Spawn **codebase-analyzer** on the specific files already identified, asking it to trace deeper (follow interface implementations, find callers, trace config values to their sources).
- **Incorrect finding**: Read the specific files yourself to verify, then correct.
- **Pattern question**: Spawn **codebase-pattern-finder** to find how similar problems are solved.

### Step 3: Surgical Update

Use the Edit tool to update the research document. Do NOT rewrite the entire document.

- Add new findings to the appropriate existing sections.
- If a new section is needed, add it in the logical place within the existing structure.
- Update the `## Discrepancies` section if new reality-vs-assumption gaps were found.
- Add any new file references to the `## Affected Areas & File Map` section.

### Step 3b: Refresh sibling HTML if it exists

After updating the markdown, check whether a sibling `.html` file exists at the same path. Apply the rule from `skills/qrspi/HTML-OUTPUT.md`:

- **Sibling `.html` exists**: Refresh affected slides — file map, per-question findings, data flow diagrams, discrepancies table — to match the new markdown content. Prefer surgical Edit; rewrite the full `.html` only if many slides changed. Append an "Updated" `<aside class="meta">` to the title slide.
- **No sibling, no flag**: Skip — markdown stays canonical.
- **No sibling but `--output=html` was passed**: Generate a fresh deck per the structure documented in `qrspi-create-research`'s Step 5b.

### Step 4: Present Changes

```
Updated the research document with:
- [What was added/changed]
- [New files discovered: file:line]
[If HTML was refreshed: HTML deck refreshed at `thoughts/shared/research/...html`]

Are there other areas that need deeper investigation, or is the research complete?

When ready, run the qrspi-create-design-discussion skill.
```

## Guidelines

- Stay objective. Even during iteration, document what exists, not what should change.
- Only spawn agents for the specific gap — don't re-research everything.
- Every new claim needs a file:line reference.
- If the feedback reveals the research scope was fundamentally wrong, say so rather than patching around it.
