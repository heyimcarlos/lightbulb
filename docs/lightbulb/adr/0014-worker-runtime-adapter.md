# ADR 0014: Worker Runtime Is Replaceable and OpenCode-Native by Default

- Status: Accepted
- Date: 2026-06-23

## Context

Lightbulb needs fresh worker contexts, subagent delegation, durable workflow/run state, event streams, sandboxes, channels, observability, and structured worker reports. Because Lightbulb is a fork of OpenCode, it already owns many execution primitives: sessions, subagents, task delegation, tools, permissions, skills, plugins, model routing, server APIs, and durable V2 session events. Flue still provides strong missing or sharper primitives, especially Durable Streams-style run streams, workflow admission, channel blueprints, sandbox integrations, observability, evals, and structured workflow ergonomics.

## Decision

Lightbulb owns a worker-runtime adapter boundary. The OpenCode-native runtime is the default path for delegated execution because it is already inside the fork and best fits local-first Lightbulb development. The route runner, TUI, desktop app, scheduler, gates, and durable Lightbulb graph depend only on Lightbulb concepts: goals, routes, stops, pickup packets, worker profiles, run events, stream offsets, reports, artifacts, gates, and human inbox items.

Lightbulb should adopt the parts Flue and Durable Streams provide that OpenCode does not yet provide cleanly: append-only worker/run streams with resumable offsets and explicit closure, idempotent producer writes, epoch fencing, workflow-style admission, channel adapter patterns, sandbox provider patterns, observability hooks, eval harness shape, and structured workflow results.

The rule is OpenCode first, Flue where OpenCode cannot yet fill the need. Prefer adapting Flue primitives at the missing capability boundary over replacing OpenCode-native sessions, tools, agents, permissions, or UI surfaces.

A Flue-backed adapter may use Flue agents, workflows, subagents, channels, sandboxes, and durable streams internally. It must return normalized Lightbulb handles rather than making Flue-native state authoritative in the Lightbulb domain. OpenCode-native execution, Codex, local process execution, Flue, or a future in-house Flue replacement can implement the same adapter contract.

The adapter does not write authoritative Lightbulb route, run, gate, or artifact state directly. It returns normalized runtime events, stream offsets, status, reports, and artifact candidates; the Lightbulb route runner persists those into the durable Lightbulb graph.

## Consequences

- Lightbulb can use OpenCode-native execution immediately while still stealing Flue and Durable Streams primitives where they are stronger.
- Replacing Flue later means implementing the adapter and stream/report contract, not rewriting goal, route, gate, TUI, or desktop surfaces.
- The first integration should be an OpenCode-native adapter behind the contract, followed by a Flue-backed spike for the missing primitives.
- Adapter conformance tests become important because they protect Lightbulb from runtime-specific behavior leaking into the control plane.
- Runtime adapters remain side-effect boundaries for worker execution, while Lightbulb remains the only authority for control-plane state transitions.
