## Parent

PRD: Account-Level Loop Orchestration Harness

## What to build

Add an operator-visible supervisor/observability slice for long-running workers. The harness should record worker heartbeats/status and provide a concise status report suitable for cron/scheduled updates.

## Acceptance criteria

- [ ] Worker run state includes status and enough timing fields to detect stalled/finished work.
- [ ] A local command or documented query can summarize active workers and recent artifacts.
- [ ] The status report is concise enough for a chat/Discord update.
- [ ] Failure/stall states are distinguishable from successful completion.

## Blocked by

Schema tracer bullet issue.
