---
name: find-comparables
description: Research mature comparable repositories, language standards, and books to extract best practices for a project or rewrite. Use when the user wants to find comparables, benchmark a codebase against production repositories, choose implementation shapes, or migrate/rewrite across languages or frameworks.
---

# Find Comparables

Use this skill to turn "what should this look like?" into grounded evidence
from high-quality repositories, language guidance, and durable written sources.

## Workflow

1. Frame the target:
   - What is being built or rewritten?
   - Current stack and target stack.
   - Domain, scale, deployment model, data shape, user/API surface, and hard constraints.
2. Build a comparison frame:
   - Language/runtime fit
   - Domain and product fit
   - Repository maturity
   - Architecture and file-division clarity
   - Infrastructure, release, testing, and operations relevance
3. Find sources:
   - Prefer primary sources: official docs, live repository trees, design docs, ADRs, talks by maintainers, and canonical books.
   - Use current web/GitHub search when repo state, releases, popularity, or language guidance may have changed.
   - Include at least 3 candidate repositories when possible, plus 2-4 language or architecture references.
   - For books, extract high-level practices with citations. Do not quote long passages.
   - For rewrites, compare both the source stack and the target stack so migration risks are visible.
4. Score comparables:
   - Rank candidates with a points table before deep analysis.
   - Explain why each source is comparable, where it is not comparable, and what parts should not be copied.
   - Prefer a smaller set of high-fit sources over a broad survey.
5. Extract implementation shapes:
   - File and package/module division
   - Command/app entrypoints
   - Configuration and environment ownership
   - Dependency boundaries
   - Data access, migrations, background jobs, and integrations
   - Testing layout, fixtures, CI, releases, observability, and operational scripts
6. Map practices back to the local project:
   - What to emulate now
   - What to defer
   - What to avoid
   - What decision would change if scale, team size, or deployment model changes

## Scoring

Use a 0-5 score for each criterion, then total the score:

- Domain fit
- Target language/framework fit
- Production maturity
- Architecture clarity
- Infrastructure/operations relevance
- Testing and quality bar
- Documentation and maintainability signal

Do not let stars or popularity dominate the score. A smaller repository can win
if its architecture and constraints match the user's project better.

## Source Selection

- Include large production repositories only when their relevant subsystem is
  comparable to the user's system.
- Include smaller focused repositories when they better match the domain or
  deployment shape.
- For Go rewrites, examples to consider after scoring include Grafana,
  Kubernetes, Prometheus, Terraform, official Go docs, Go Code Review Comments,
  Effective Go, and books such as 100 Go Mistakes and How to Avoid Them.
- For any language, find the equivalent official guides, high-signal books, and
  production repositories instead of reusing the Go list by default.

## Output

Use [references/report-template.md](references/report-template.md) for the
default report shape.

Always include:

- A ranked comparables table with points
- Source links and access dates for web sources
- Concrete file/path examples from comparable repos
- Book or standards-derived practices summarized in your own words
- Recommended local architecture or implementation shape
- Explicit caveats about mismatch, scale, and copying risk
