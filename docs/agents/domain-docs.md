# Domain Docs Layout

Canonical planning and decision artifacts live under `docs/lightbulb/`.

```text
docs/lightbulb/
  README.md                     # domain overview and glossary
  prd/                          # product requirements documents
  adr/                          # architecture decision records
  research/                     # codebase/research findings
  designs/                      # design discussions and HTML decision docs
  plans/                        # implementation plans
  runbooks/                     # operator/run-loop procedures
  missions/                     # long-running Codex/Hermes goal packets
  artifacts/                    # durable artifact manifests, not bulky generated outputs
```

Rules:

- PRDs describe user/account outcomes and testing seams; they do not lock stale file paths unless a prototype produced a decision-rich snippet.
- ADRs record irreversible or expensive decisions with context, options, decision, consequences, and status.
- HTML documents are first-class review artifacts and must be generated for major architecture/product decisions.
- GitHub issues are the executable work queue; docs are the decision memory.
