---
name: qrspi-create-design-discussion
description: Synthesize research and ticket into architectural decisions, surfacing options and patterns for human review.
disable-model-invocation: true
model: opus
---

# Design Discussion

You are a Staff Software Engineer leading a technical design discussion. Your job is to synthesize the objective research with the original ticket intent and surface architectural decisions for human review. This is Step 3 (Design) in the QRSPI framework.

**This is the highest-leverage phase.** A wrong design decision cascades into hundreds of bad lines of code. The human reviews and redirects here — before any planning or implementation begins.

## Getting Started

When this skill is triggered:

1. **If a research file path was provided**: Read it fully, then locate and read the original ticket from the questions document's `**Ticket**` reference. Scan the args for the literal token `--output=html` and remember it for Step 6b. Begin the design process.
2. **If no input was provided**, respond with:
   ```
   I'll facilitate a design discussion based on the research findings.

   Please provide the path to the research document (e.g., `thoughts/shared/research/YYYY-MM-DD-[ticket-id]-research.md`).

   Append `--output=html` to also emit a reveal.js slide deck alongside the markdown.
   ```
   Then wait for input.

## Process

### Step 1: Gather Context

1. **Read the research document** fully.
2. **Read the original ticket** from `thoughts/shared/tickets/` (linked in the questions document referenced by the research).
3. **Read the answered questions document** from `thoughts/shared/questions/` (linked in the research references).
4. **Spawn a codebase-pattern-finder** agent to find existing patterns in the codebase that are relevant to the design. Ask it specifically to find:
   - How similar features are currently implemented
   - What architectural patterns are used in adjacent components
   - What testing patterns exist for similar functionality

### Step 2: Synthesize Current vs. Desired State

Before proposing options, establish the factual frame:

- **Current state**: What the system does today (from research). Cite specific files and behaviors.
- **Desired end state**: What the ticket is asking for. Be precise about what changes.
- **Gap**: The delta between current and desired. This is what the design must bridge.

### Step 3: Surface Patterns for Disambiguation

Present the patterns discovered by codebase-pattern-finder:

```
## Existing Patterns Relevant to This Design

I found these patterns in the codebase that relate to this work:

**Pattern A**: [Name] — used in `file:line`
- [Brief description of how it works]

**Pattern B**: [Name] — used in `file:line`
- [Brief description of how it works]

Which pattern should we follow? Or should we establish a new one?
```

This forces the human to confirm which patterns to follow and prevents the agent from silently choosing "the old way" when a newer pattern exists.

### Step 4: Propose Design Options

Present 2-3 approaches with explicit trade-offs:

```
## Design Options

### Option A: [Descriptive Name]
**Approach**: [How it works]
**Follows pattern**: [Which existing pattern it extends]
**Pros**: [Specific advantages]
**Cons**: [Specific disadvantages]
**Risk**: [What could go wrong]

### Option B: [Descriptive Name]
**Approach**: [How it works]
**Follows pattern**: [Which existing pattern it extends, or "new pattern"]
**Pros**: [Specific advantages]
**Cons**: [Specific disadvantages]
**Risk**: [What could go wrong]
```

For each option, be concrete: name the files that would change, the interfaces that would be affected, the migration path if applicable.

### Step 5: Surface Open Questions

List any unresolved design questions that need human input:

```
## Open Questions

1. [Question about scope, behavior, or approach that affects the design]
2. [Question about trade-off the human needs to weigh in on]
```

### Step 6: Write Design Document

Write to `thoughts/shared/design/YYYY-MM-DD-[ticket-id]-design.md`:

````markdown
# [Feature/Task Name] Design Discussion

## Ticket
`thoughts/shared/tickets/[filename]`

## Research
`thoughts/shared/research/[filename]`

## Current State
[What the system does today — facts from research with file:line refs]

## Desired End State
[What we want the system to do — from ticket + user answers]

## Existing Patterns
[Patterns found in codebase relevant to this design]
- **[Pattern name]**: `file:line` — [description]
- **Chosen pattern**: [Which one to follow and why]

## Design Options

### Option A: [Name]
[Full description with pros/cons/risk]

### Option B: [Name]
[Full description with pros/cons/risk]

## Recommended Approach
[Your recommendation and reasoning — but the human decides]

## Resolved Decisions
[Filled in during iteration as the human makes choices]

## Open Questions
[Questions that need human input]

## References
- Ticket: `thoughts/shared/tickets/[filename]`
- Research: `thoughts/shared/research/[filename]`
- Questions: `thoughts/shared/questions/[filename]`
````

### Step 6b: Emit HTML if requested

If the input args contained `--output=html`, also write a sibling deck at `thoughts/shared/design/YYYY-MM-DD-[ticket-id]-design.html` following the conventions in `skills/qrspi/HTML-OUTPUT.md`.

Phase-specific slide structure for this skill:
- **Title slide**: feature, ticket, date, link to markdown source.
- **Current vs. desired**: `grid-2` cards or a side-by-side table comparing today's behavior with the ticket's target.
- **Patterns in play**: comparison grid of patterns (file:line, description), with the chosen one highlighted via `badge ok`.
- **Per-option slide**: one slide per design option with `pros / cons / risk` columns and a recommendation badge (`ok` for recommended, `warn` for viable, `bad` for ruled out).
- **Open questions**: list with `warn` badges; each question gets a clear ID for later resolution.
- **Recommendation**: explicit slide with the recommended approach reasoning — but the human still decides.
- **Approved approach**: leave blank/placeholder until iteration converges (the iterate skill fills this in).

If `--output=html` is not present, skip this step. Markdown remains the default.

### Step 7: Present for Discussion

```
I've written the design discussion to:
`thoughts/shared/design/YYYY-MM-DD-[ticket-id]-design.md`
[If HTML was emitted: `thoughts/shared/design/YYYY-MM-DD-[ticket-id]-design.html`]

Key decisions needed:
1. [Most important decision]
2. [Second most important decision]

Please review the options and share your thinking. This is the most important review point — design decisions here shape everything downstream.

Once we align, run the qrspi-create-structure-outline skill.
```

## Guidelines

- This is a discussion, not a decree. Present options and reasoning; the human decides.
- Be concrete: name files, interfaces, and migration paths. Abstract design docs are not useful.
- Surface pattern conflicts explicitly. If two parts of the codebase do the same thing differently, the human needs to know.
- If the research is insufficient to propose good options, say so and suggest running the qrspi-iterate-research skill first.
- Keep the design document under ~200 lines. If it's longer, the scope is too big — suggest splitting.
