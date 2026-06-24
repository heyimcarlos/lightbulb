# Issue 81 Thermo Review

## Verdict

No blocking maintainability findings.

## Findings

- `packages/core/src/lightbulb/human-inbox.ts` is a new 618-line module, which triggered the deterministic reviewer large-file warning. It stays below the repo's 1k-line hard bar and owns one cohesive read-model boundary: projection, idempotent persistence, digest formatting, and source-specific draft builders.
- The module does not add hidden automation, model execution, raw transcript storage, or runtime-provider secret handling.
- The added casts are limited to branded ID recovery from existing JSON event/source metadata, matching neighboring Lightbulb read-model patterns.
- Splitting the file now would mostly create pass-through modules around single-use draft builders. That would increase navigation cost without reducing the stable-v0 surface area.

## Residual Risk

- Future inbox action controls should not be added to this projection file. Once approvals, suppression actions, or notification delivery exist, they should live behind separate command/action modules and leave `human-inbox.ts` as the read-model projection boundary.
