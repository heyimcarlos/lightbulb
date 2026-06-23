---
name: defragance
description: Distill the taste, idioms, and operating habits of strong comparable projects into practical guidance for a target project, event, product, or workflow. Use when the user wants to borrow or steal the fragrance of great open source repos, learn Go/Golang or another language by building, translate comparables into conventions, or turn research into coding guidance.
---

# Defragance

Use this skill after comparable sources have been found, or invoke
`find-comparables` first if the sources are missing. The goal is to reuse what
open source makes reusable, while extracting a sense of taste and converting it
into choices the target project can actually carry.

## Workflow

1. Frame the target and learner intent:
   - What is being built: software project, event, product, workflow, or other artifact.
   - Current stack, target stack, domain, users, deployment or delivery model, and hard constraints.
   - What the user wants to learn or re-learn while building.
2. Select evidence:
   - Use 3-5 high-fit comparable repositories or artifacts.
   - Include official language/framework guidance and durable written references when relevant.
   - Record exact source paths, docs, or examples for every practice worth borrowing.
3. Distill the fragrance:
   - Naming, boundaries, entrypoints, file layout, and dependency direction.
   - Error handling, configuration, state, logging, testing, docs, release, and operations habits.
   - What the work feels like: compact, explicit, boring, sharp, playful, layered, or deliberate.
   - What the comparable refuses to do, not just what it does.
4. Translate instead of clone:
   - For each practice, mark it as adopt, adapt, defer, or avoid.
   - Explain why the target can carry it, or why the comparable's scale makes it a bad fit.
   - Copy code, names, or structures only when the license and attribution expectations allow it.
   - Bind every recommendation to a likely local file, module, ritual, or next slice.
5. Build the learning loop:
   - Start with one tracer-bullet slice that exercises the borrowed style end to end.
   - Turn unfamiliar idioms into small exercises, review prompts, or code-reading checkpoints.
   - Ask the agent to explain language-specific choices before implementing them when the user is learning.
6. Produce working rules:
   - A short project-specific style guide.
   - A first-slice implementation plan.
   - AI collaboration rules that preserve the borrowed taste during future coding sessions.

## Output

Always return:

- Fragrance brief: 5-10 principles that capture the target style.
- Evidence map: source paths or references behind the principles.
- Adoption map: adopt, adapt, defer, and avoid decisions.
- First slice: the smallest buildable path that teaches and proves the style.
- AI rules: prompts or constraints to keep future implementation aligned.

## Guardrails

- Do not praise famous projects without exact evidence.
- Do not import enterprise-scale patterns unless the target has enterprise-scale forces.
- Do not flatten the result into generic best practices.
- For Go, prefer simple packages, clear ownership, explicit errors, table-driven tests, narrow interfaces near consumers, and official Go guidance over framework fashion.
