# Browser tool registry proof

## Result

Browser/computer-use implementation is now bridged into the OpenCode server tool registry.

## Changed

- Added `packages/opencode/src/tool/browser.ts`.
- Registered `BrowserTool` in `packages/opencode/src/tool/registry.ts`.
- Added registry coverage in `packages/opencode/test/tool/registry.test.ts`:
  - `registry.ids()` contains `browser`.
  - `browser` execution invokes `agent-browser screenshot`.
  - screenshot artifact path is recorded.
- Updated stale dashboard fixture in `packages/opencode/test/cli/lightbulb.test.ts` to current `Lightbulb.ArtifactHandle` and `GoalStatus` shapes.

## Verification commands run

```text
packages/opencode$ BUN_INSTALL=/home/cyberjanitor/.bun BUN_TMPDIR=/tmp bun test test/tool/registry.test.ts test/cli/lightbulb.test.ts
15 pass, 0 fail

packages/opencode$ BUN_INSTALL=/home/cyberjanitor/.bun BUN_TMPDIR=/tmp bun typecheck
exit 0

packages/core$ BUN_INSTALL=/home/cyberjanitor/.bun BUN_TMPDIR=/tmp bun test test/tool-browser.test.ts test/location-layer.test.ts
5 pass, 0 fail

packages/core$ BUN_INSTALL=/home/cyberjanitor/.bun BUN_TMPDIR=/tmp bun typecheck
exit 0

packages/app$ BUN_INSTALL=/home/cyberjanitor/.bun BUN_TMPDIR=/tmp bun test --preload ./happydom.ts ./src/pages/browser-data.test.ts
3 pass, 0 fail

packages/app$ BUN_INSTALL=/home/cyberjanitor/.bun BUN_TMPDIR=/tmp bun typecheck
exit 0
```

## Video evidence

Generated with the `ai-video-production` local proof path.

```text
recording: .lightbulb/evidence/pr-36/recordings/lightbulb-browser-tool-registry-proof.mp4
duration: 8.000000 seconds
size: 119693 bytes
sha256: 2225d8d25cc9793bf18557b3437140d394ae7fa742463a8ec0bda7a99a27ddb1

screenshot: .lightbulb/evidence/pr-36/frames/browser-tool-registry-proof.png
sha256: 395737aad3c149884bbee8e3115c4a98798397e92d2d07b35be9f1676f28a5df
```

## Caveat

I did not restart or disturb the user's existing dev server. A direct `AppRuntime` probe against the current repo state hit an existing local SQLite migration mismatch unrelated to the browser registry change:

```text
SQLiteError: foreign key mismatch - "__new_lightbulb_artifact_edge" referencing "lightbulb_artifact"
```

The registry itself is verified through isolated test runtime coverage and package typechecks.
