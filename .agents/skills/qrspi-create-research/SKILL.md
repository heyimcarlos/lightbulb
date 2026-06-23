---
name: qrspi-create-research
description: Document codebase as-is using parallel sub-agents, guided only by the research questions document.
disable-model-invocation: true
model: opus
---

# Codebase Research

You are tasked with conducting comprehensive research across the codebase based on a set of clarified research questions.

## CRITICAL: Your only job is to document and explain the codebase as it exists today

- DO NOT suggest improvements or changes
- DO NOT perform root cause analysis
- DO NOT propose future enhancements
- DO NOT identify problems
- DO NOT critique the implementation
- DO NOT recommend refactoring, optimization, or architectural changes

The Design phase is where solutions get proposed. The research phase is pure documentation of current reality.

## Getting Started

When this skill is triggered:

1. **If a file path was provided** (e.g., `thoughts/shared/questions/YYYY-MM-DD-ENG-XXXX-questions.md`):
   - Read it fully using the Read tool (no limit/offset).
   - Scan the args for the literal token `--output=html` and remember it for Step 5b.
   - Begin the research process immediately.

2. **If no input was provided**, respond with:
   ```
   I'll execute the Research phase to map out the codebase objectively.

   Please provide the path to the questions document from the Question phase
   (e.g., `thoughts/shared/questions/YYYY-MM-DD-ENG-XXXX-questions.md`).

   Append `--output=html` to also emit a reveal.js slide deck alongside the markdown.
   ```
   Then wait for input.

## Process

### Step 1: Input Analysis

1. **Read the questions document fully** using the Read tool without limit/offset.
2. **Extract research targets**: Identify the specific components, concepts, data flows, and constraints implied by the questions.
3. **Formulate a search plan**: List the specific codebase areas that require investigation.

### Step 2: Parallel Sub-agent Research

Spawn research agents in parallel to gather facts efficiently. Each agent operates in its own context window — the expensive investigation stays isolated, and only compressed results come back to you.

Launch these agents simultaneously:

- **codebase-locator**: Find all files related to the identified components. Be extremely specific about directories to focus on. Request file paths grouped by purpose (implementation, tests, config, types).
- **codebase-analyzer**: Trace how the current implementation works for each identified component. Request specific file:line references, data flow paths, and function signatures.
- **codebase-pattern-finder**: Find existing patterns in the codebase that relate to the components under investigation. Request concrete code examples with file:line references.
- **thoughts-locator**: Search `thoughts/` for any existing research, plans, or decisions related to the identified components.

**Agent spawning constraints**:
- Be specific about which directories and components each agent should investigate.
- Request file:line references in all agent responses.
- Ask agents to identify integrations, dependencies, and external calls.

### Step 3: Verify and Deepen

1. **Wait for all agents to complete** before proceeding.
2. **Read all critical files** identified by agents directly into your main context. Never rely solely on an agent's summary for files central to the investigation.
3. **Trace loose ends**: If a function calls an interface, find the concrete implementations. If a config value is referenced, find where it's set.

### Step 4: Present Initial Findings

Before writing the final report, present a summary for scope confirmation:

```
Based on the questions document, I've mapped the relevant codebase areas.

Key findings:
- [Current implementation detail with file:line reference]
- [Data flow mapping summary]
- [Key dependencies discovered]
- [Patterns found: how similar problems are solved elsewhere]

Does this cover the right scope, or should I investigate additional areas before writing the report?
```

### Step 5: Write Research Report

After scope confirmation, write to `thoughts/shared/research/YYYY-MM-DD-[ticket-id]-research.md`:

````markdown
# [Feature/Task Name] Codebase Research

## Overview

[Brief summary of the research objective based on the questions document]

## Affected Areas & File Map

### Primary Components
- `path/to/file1.ext`: [Role and relevance]
- `path/to/file2.ext`: [Role and relevance]

### Integration Points
- `path/to/integration.ext`: [Where this system connects to other systems]

### Test Coverage
- `path/to/test.ext`: [What's currently tested]

## Current Data Flow & Architecture

[Trace the path of data or execution through the system]
- Step 1: `file.ext:function()` at line N does X
- Step 2: `file2.ext:handler()` at line N does Y
- Step 3: ...

## Existing Patterns

[Patterns discovered by codebase-pattern-finder relevant to this area]
- **Pattern**: [Name] — found in `file:line`
  - [How it works, with code reference]

## Dependencies & Constraints

### Internal Dependencies
- [Component A] relies on [Component B] — `file:line`

### External Dependencies
- [Library/Service] used for [Purpose]

### Discovered Constraints
- [Hardcoded limits, architectural rules, or invariants found in code]

## References

- Source Questions: `thoughts/shared/questions/YYYY-MM-DD-[ticket-id]-questions.md`
- [Any thoughts/ documents found by thoughts-locator]
````

### Step 5b: Emit HTML if requested

If the input args contained `--output=html`, also write a sibling deck at `thoughts/shared/research/YYYY-MM-DD-[ticket-id]-research.html` following the conventions in `skills/qrspi/HTML-OUTPUT.md`.

Phase-specific slide structure for this skill:
- **Title slide**: ticket, scope, date, link to markdown source.
- **TL;DR slide**: 3–5 bullets answering the questions in plain language.
- **File map**: SVG diagram OR a `grid-2`/`grid-3` of cards grouping files by purpose (implementation, tests, config, types) with `path:line` references.
- **Per-question findings** (one slide per question or merged where related): bullet findings with `file:line` cites; annotate code blocks via `<mark>`/margin notes.
- **Data flow**: SVG showing how data moves through the relevant components, numbered steps with directional arrows.
- **Existing patterns**: `grid-2`/`grid-3` comparison cards (name, file:line, brief description, current usage).
- **Discrepancies**: table of "ticket assumes / codebase actually does" with `warn`/`bad` badges.

If `--output=html` is not present, skip this step. Markdown remains the default.

### Step 6: Present and Iterate

```
Research report written to:
`thoughts/shared/research/YYYY-MM-DD-[ticket-id]-research.md`
[If HTML was emitted: `thoughts/shared/research/YYYY-MM-DD-[ticket-id]-research.html`]

Please review. Does this provide a complete and accurate picture of the current system?

When ready, run the qrspi-create-design-discussion skill with the research path.
```

Be ready to spawn follow-up agents if the user identifies gaps. Use the Edit tool to update the report.

## Guidelines

1. **Be objective**: Document what exists, not what should be. Solutions belong in Design.
2. **Be thorough**: Every claim needs a file:line reference. Track down loose ends.
3. **Be efficient with context**: Sub-agents do the expensive searching; you receive compressed results. Read critical files yourself but don't read everything an agent found.
4. **Spawn agents in parallel**: Multiple Agent tool calls in a single message for maximum efficiency.
5. **Verify agent results**: Agents compress information. For files central to the task, read them yourself to catch what agents may have summarized away.
