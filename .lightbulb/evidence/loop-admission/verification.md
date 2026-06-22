# Loop Admission Verification

## Scope

This evidence packet covers the first traceable-loop runtime slice:

- durable loop-run admission before worker/model execution
- skipped admission trace events for paused accounts and held goals
- scheduler tick event recording
- dashboard read-model exposure through bounded `operations.schedulerTicks`
- CLI text rendering of bounded scheduler operations state

## Verification Commands

```text
cd packages/core && bun test test/lightbulb-loop-run.test.ts test/lightbulb-scheduler.test.ts && bun typecheck
```

Result: pass. Eight focused tests passed and `tsgo --noEmit` completed.

```text
cd packages/opencode && bun test test/cli/lightbulb.test.ts && bun typecheck
```

Result: pass. Seven CLI/dashboard tests passed and `tsgo --noEmit` completed.

```text
git diff --check
```

Result: pass.

```text
git diff --check origin/dev...HEAD
```

Result: pass.

## Review Fixes

- Admission now skips queued run creation when the parent Lightbulb account is not active, while preserving a `lightbulb.loop_run.skipped` event with `reason: account_not_active` and `account_status`.
- The inactive-goal guard remains covered by `does not admit active loops for non-active goals`.
- Dashboard account graph loading now reads only the five newest `lightbulb.scheduler_tick.completed` events for the account instead of materializing the full account event log.

## CLI Evidence

Command:

```text
OPENCODE_DB=/tmp/lightbulb-loop-admission-ops.db bun --conditions=browser -e '[script admitted scheduled loop runs and rendered formatLightbulbDashboard]'
```

Output excerpt:

```text
Operations
  scheduler tick lbevent_eee6c37cf001X0xdFgLpZ3h0eb trigger=schedule admitted=1 skipped=1 outcomes=2
    source cron_id=evidence-heartbeat
    loop lbloop_eee6c37bf001KS8l0FR0REt1uk_due implementation [admitted] classification=due reason=none run=lbrun_eee6c37cd001wQAACdQQi0gAs0
    loop lbloop_eee6c37bf001KS8l0FR0REt1uk_future status [skipped] classification=not_due reason=next_due_at_in_future run=none
```
