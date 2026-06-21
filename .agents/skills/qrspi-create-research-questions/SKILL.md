---
name: qrspi-create-research-questions
description: Analyze a ticket to generate targeted research questions before any codebase investigation begins.
disable-model-invocation: true
model: opus
---

# Research Questions Generation

You are tasked with analyzing a ticket and generating targeted research questions that will guide the research agent's codebase investigation.

## Why This Phase Exists

The research agent that runs after this phase receives ONLY the questions document you produce — never the original ticket. This separation is intentional: it prevents the researcher from forming implementation opinions before documenting how the codebase actually works. The questions are research directives — assignments for the research agent to investigate by reading code, config, and tests.

If ticket intent leaks into the questions, the research phase inherits bias instead of producing clean facts. The questions must describe what to investigate about the system, not what needs to change.

## CRITICAL: Do not leak implementation intent into the questions document

This is the single most important constraint of this phase.

- Questions must ask about how the codebase works TODAY, not about what needs to change
- Do not embed the ticket's desired outcome into question framing
- Do not suggest solutions, approaches, or modifications in questions
- The Context Summary must describe the area under investigation objectively — not state what the ticket wants to achieve
- A researcher reading only your questions should NOT be able to infer what the ticket is asking for

If you catch yourself writing "how would X need to change to support Y" — stop. Reframe as "how does X currently work" and let the Design phase handle the rest.

## Getting Started

When this skill is triggered:

1. **If a ticket input was provided** (a file path, GitHub issue URL, Linear ticket ID, or inline text):
   - Normalize the input (see Step 1 below).
   - Read the ticket fully using the Read tool (no limit/offset).
   - Scan the args for the literal token `--output=html` and remember it for Step 5b.
   - Begin the question generation process immediately.

2. **If no input was provided**, respond with:
   ```
   I'll generate research questions to guide objective codebase investigation.

   Please provide one of:
   - A path to a ticket file (e.g., `thoughts/shared/tickets/ENG-1234.md`)
   - A GitHub issue URL (e.g., `owner/repo#123`)
   - A Linear ticket ID (e.g., `ENG-1234`)
   - A description of the feature or bug inline

   Append `--output=html` to also emit a reveal.js slide deck alongside the markdown.
   ```
   Then wait for input.

## Process

### Step 1: Normalize the Ticket

All inputs get normalized into `thoughts/shared/tickets/` so there's a durable record of what was analyzed.

- **GitHub issue** (`owner/repo#123` or URL): Fetch with `gh issue view <number> --repo <owner/repo> --json title,body,labels,comments` and write to `thoughts/shared/tickets/`.
- **Linear ticket ID** (e.g., `ENG-1234`): Fetch via Linear CLI or API and write to `thoughts/shared/tickets/`.
- **Inline text**: Write to `thoughts/shared/tickets/YYYY-MM-DD-brief-description.md`.
- **Existing file path**: Read it directly.

Ticket files should have this header:

```markdown
# [Title]

**Source**: [Linear ENG-1234 | GitHub owner/repo#123 | Manual]
**Date**: YYYY-MM-DD

---

[Body content]
```

### Step 2: Analyze the Ticket

Read the ticket and identify:
- What is being requested (feature, bug fix, refactor, investigation)
- What components or systems are mentioned or implied
- What assumptions are embedded in the ticket
- What areas of the codebase the research agent would need to map

Do not look at the codebase. This phase is pure requirements analysis. The codebase investigation happens in the Research phase, guided by the questions you produce here.

### Step 3: Generate Research Questions

Formulate questions that direct the research agent's codebase investigation. Each question should target something the agent needs to discover by reading code, config, tests, or documentation.

Think about what a researcher mapping the system would need to find: where things live, how data flows, what components interact, what constraints exist, what happens at boundaries. Some tickets need heavy focus on data flow, others on edge cases, others on system boundaries.

Keep questions specific and investigable — avoid vague "what do you think about X" questions. If a question can't be answered by reading code, config files, or tests, it probably doesn't belong here.

If the ticket is ambiguous enough that you can't generate useful questions, say so and ask the user to clarify the ticket first. More than 15 questions usually means the ticket should be split.

### Step 4: Write the Questions Document

Write to `thoughts/shared/questions/YYYY-MM-DD-[ticket-id]-questions.md`:

```markdown
# Research Questions: [Brief Title]

**Ticket**: `thoughts/shared/tickets/[filename]`
**Generated**: YYYY-MM-DD
**Status**: draft

---

## Context Summary

[2-3 sentence summary of the area under investigation, framed objectively. This gives the research agent minimal framing without the full ticket. Do NOT include the ticket's desired outcome or implementation goals here — describe the system area, not the change.]

## Research Questions

1. [Question]
2. [Question]
3. [Question]

...
```

### Step 5a: Emit HTML if requested

If the input args contained `--output=html`, also write a sibling deck at `thoughts/shared/questions/YYYY-MM-DD-[ticket-id]-questions.html` following the conventions in `skills/qrspi/HTML-OUTPUT.md` (reveal.js via CDN, rich slides, color-coded badges).

Phase-specific slide structure for this skill:
- **Title slide**: ticket title, source, date, status, link back to the markdown source.
- **Context summary**: the objective context paragraph as a single readable slide.
- **Question map**: SVG or grid grouping questions by category (data flow, boundaries, components, constraints) with counts.
- **Per-question slides** (or per-category if many): numbered with `info` badges; use vertical sub-slides for clarifications.
- **Coverage check**: table mapping ticket-mentioned areas → questions covering them so gaps are visible.

If `--output=html` is not present, skip this step. Markdown remains the default.

### Step 5b: Present for Review

```
I've generated research questions at:
`thoughts/shared/questions/YYYY-MM-DD-[ticket-id]-questions.md`
[If HTML was emitted: `thoughts/shared/questions/YYYY-MM-DD-[ticket-id]-questions.html`]

Please review the questions. You can:
- Ask me to add, remove, or reframe questions
- Run the qrspi-iterate-research-questions skill with specific refinements
- Tell me if any questions leak ticket intent or contain bias

Once you're satisfied, I'll mark the document as ready-for-research.
```

## Guidelines

- Questions are directives for the research agent, not a questionnaire for the user.
- 5-15 questions is the sweet spot.
- Every question should be investigable by reading code, config, tests, or documentation.
- Questions that require human judgment or product decisions don't belong here — that context enters at the Design phase.
