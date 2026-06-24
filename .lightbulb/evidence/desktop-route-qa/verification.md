Desktop route QA evidence for the route-aware capture harness.

Commands run from `packages/desktop`:

```bash
bun run qa:browser -- --out ../../.lightbulb/evidence/desktop-browser-qa
OPENCODE_DESKTOP_QA_ROUTE=/lightbulb/pr-review bun run qa:browser -- --out ../../.lightbulb/evidence/desktop-lightbulb-pr-review-qa
bun typecheck
git diff --check
```

Results:

- Browser route captured with selector `[data-page='browser-surface']`.
- Lightbulb PR-review route captured with selector `[data-page='lightbulb-pr-review']`.
- Desktop typecheck passed.
- Whitespace check passed.

Artifacts:

- `.lightbulb/evidence/desktop-browser-qa/browser-surface.png`
- `.lightbulb/evidence/desktop-browser-qa/browser-surface.json`
- `.lightbulb/evidence/desktop-lightbulb-pr-review-qa/lightbulb-pr-review.png`
- `.lightbulb/evidence/desktop-lightbulb-pr-review-qa/lightbulb-pr-review.json`
