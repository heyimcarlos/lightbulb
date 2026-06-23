import { Effect } from "effect"
import type { Lightbulb } from "../lightbulb"
import type { WorkerLaunchServiceInput } from "./worker-launch"

export type WorkerRuntimeKind = "opencode" | "codex" | "local_process" | "flue" | "custom"
export type WorkerRuntimeChannel = "control" | "status" | "stdout" | "stderr" | "artifact" | "eval"
export type WorkerRuntimeSandboxMode = "workspace" | "worktree" | "process" | "container" | "remote"
export type WorkerRuntimeObservationKind = "heartbeat" | "log" | "trace" | "metrics" | "eval"
export type WorkerRuntimeEventType =
  | "runtime.launch.requested"
  | "runtime.launch.started"
  | "runtime.status"
  | "runtime.report.candidate"
  | "runtime.artifact.candidate"
  | "runtime.closed"

export type WorkerRuntimeCapabilities = {
  readonly appendOnlyEvents: boolean
  readonly resumableOffsets: boolean
  readonly explicitClosure: boolean
  readonly idempotentProducers: boolean
  readonly epochFencing: boolean
  readonly structuredResults: boolean
  readonly channels: readonly WorkerRuntimeChannel[]
  readonly sandboxes: readonly WorkerRuntimeSandboxMode[]
  readonly observability: readonly WorkerRuntimeObservationKind[]
  readonly evals: boolean
}

export type WorkerRuntimeDescriptor = {
  readonly kind: WorkerRuntimeKind
  readonly name: string
  readonly summary: string
  readonly default: boolean
  readonly capabilities: WorkerRuntimeCapabilities
}

export type WorkerRuntimeLaunchRequest = {
  readonly accountID: Lightbulb.AccountID
  readonly runID: Lightbulb.RunID
  readonly workerID: Lightbulb.WorkerID
  readonly taskPacketID: Lightbulb.TaskPacketID
  readonly launchAttemptID?: Lightbulb.WorkerLaunchAttemptID
  readonly trigger: Lightbulb.WorkerLaunchTrigger
  readonly command: string
  readonly cwd: string
  readonly worktreeID?: string
  readonly profileID?: string
  readonly issueRef?: string
  readonly workItemRef?: string
  readonly environmentSummary?: Record<string, string | number | boolean | null>
  readonly stream: {
    readonly producerID: string
    readonly epoch: number
    readonly resumeAfterOffset?: string
  }
  readonly metadata?: Record<string, unknown>
}

export type WorkerRuntimeHandle = {
  readonly kind: WorkerRuntimeKind
  readonly runtimeID: string
  readonly nativeSessionID?: string
  readonly processID?: number
  readonly metadata?: Record<string, unknown>
}

export type WorkerRuntimeStreamState = {
  readonly producerID: string
  readonly epoch: number
  readonly lastOffset: string
  readonly closed: boolean
}

export type WorkerRuntimeEvent = {
  readonly type: WorkerRuntimeEventType
  readonly channel: WorkerRuntimeChannel
  readonly producerID: string
  readonly epoch: number
  readonly offset: string
  readonly sequence: number
  readonly idempotencyKey: string
  readonly summary: string
  readonly timeCreated: number
  readonly data?: Record<string, unknown>
}

export type WorkerRuntimeReportCandidate = {
  readonly status: "candidate"
  readonly uri: string
  readonly summary: string
  readonly format: "markdown" | "json" | "text"
  readonly metadata?: Record<string, unknown>
}

export type WorkerRuntimeArtifactCandidate = {
  readonly status: "candidate"
  readonly type: Lightbulb.ArtifactType
  readonly uri: string
  readonly summary: string
  readonly metadata?: Record<string, unknown>
}

export type WorkerRuntimeLaunchResult = {
  readonly status: Lightbulb.WorkerLaunchStatus
  readonly handle: WorkerRuntimeHandle
  readonly stream: WorkerRuntimeStreamState
  readonly events: readonly WorkerRuntimeEvent[]
  readonly report?: WorkerRuntimeReportCandidate
  readonly artifacts?: readonly WorkerRuntimeArtifactCandidate[]
}

export type WorkerRuntimeReadResult = Omit<WorkerRuntimeLaunchResult, "handle"> & {
  readonly handle?: WorkerRuntimeHandle
}

export type WorkerRuntimeAdapter = {
  readonly descriptor: WorkerRuntimeDescriptor
  readonly launch: (request: WorkerRuntimeLaunchRequest) => Effect.Effect<WorkerRuntimeLaunchResult>
  readonly read: (request: WorkerRuntimeLaunchRequest) => Effect.Effect<WorkerRuntimeReadResult>
  readonly stop?: (request: WorkerRuntimeLaunchRequest) => Effect.Effect<WorkerRuntimeReadResult>
}

export type WorkerRuntimeConformanceCode =
  | "empty_event_stream"
  | "producer_mismatch"
  | "epoch_mismatch"
  | "offset_not_monotonic"
  | "missing_idempotency_key"
  | "duplicate_idempotency_key"
  | "stream_offset_mismatch"
  | "closed_stream_missing_event"
  | "authoritative_runtime_id"
  | "authoritative_candidate_id"

export type WorkerRuntimeConformanceViolation = {
  readonly code: WorkerRuntimeConformanceCode
  readonly summary: string
}

export type WorkerRuntimeConformanceResult = {
  readonly valid: boolean
  readonly violations: readonly WorkerRuntimeConformanceViolation[]
}

export const OpenCodeNativeWorkerRuntime = {
  kind: "opencode",
  name: "OpenCode native worker runtime",
  summary: "Default Lightbulb worker runtime built on OpenCode sessions, tools, agents, subagents, skills, and permissions.",
  default: true,
  capabilities: {
    appendOnlyEvents: true,
    resumableOffsets: true,
    explicitClosure: true,
    idempotentProducers: true,
    epochFencing: true,
    structuredResults: true,
    channels: ["control", "status", "stdout", "stderr", "artifact", "eval"],
    sandboxes: ["workspace", "worktree", "process"],
    observability: ["heartbeat", "log", "trace", "eval"],
    evals: true,
  },
} satisfies WorkerRuntimeDescriptor

export const LocalProcessWorkerRuntime = {
  kind: "local_process",
  name: "Local process worker runtime",
  summary: "Replaceable local command runner shape for tests, recovery tools, and non-agent process execution.",
  default: false,
  capabilities: {
    appendOnlyEvents: true,
    resumableOffsets: true,
    explicitClosure: true,
    idempotentProducers: true,
    epochFencing: true,
    structuredResults: true,
    channels: ["control", "status", "stdout", "stderr", "artifact"],
    sandboxes: ["process", "worktree"],
    observability: ["heartbeat", "log"],
    evals: false,
  },
} satisfies WorkerRuntimeDescriptor

export const FlueComparableWorkerRuntime = {
  kind: "flue",
  name: "Flue comparable worker runtime",
  summary: "Optional future adapter/comparable for workflow admission, durable streams, channels, sandboxes, observability, and evals.",
  default: false,
  capabilities: {
    appendOnlyEvents: true,
    resumableOffsets: true,
    explicitClosure: true,
    idempotentProducers: true,
    epochFencing: true,
    structuredResults: true,
    channels: ["control", "status", "stdout", "stderr", "artifact", "eval"],
    sandboxes: ["workspace", "worktree", "container", "remote"],
    observability: ["heartbeat", "log", "trace", "metrics", "eval"],
    evals: true,
  },
} satisfies WorkerRuntimeDescriptor

export function validateWorkerRuntimeResult(result: WorkerRuntimeLaunchResult | WorkerRuntimeReadResult) {
  const violations = [
    ...eventStreamViolations(result),
    ...runtimeIDViolations(result),
    ...candidateViolations(result.report ? [result.report, ...(result.artifacts ?? [])] : (result.artifacts ?? [])),
  ]
  return {
    valid: violations.length === 0,
    violations,
  } satisfies WorkerRuntimeConformanceResult
}

export function toWorkerLaunchServiceInput(
  request: WorkerRuntimeLaunchRequest,
  result: WorkerRuntimeLaunchResult,
  now: number,
) {
  return {
    accountID: request.accountID,
    workerID: request.workerID,
    taskPacketID: request.taskPacketID,
    trigger: request.trigger,
    now,
    status: launchServiceStatus(result.status),
    issueRef: request.issueRef,
    workItemRef: request.workItemRef,
    environmentSummary: request.environmentSummary,
    summary: result.events.at(-1)?.summary ?? "Worker runtime returned launch state.",
    cwd: request.cwd,
    worktreeID: request.worktreeID,
    command: request.command,
    profileID: request.profileID,
    sessionID: result.handle.nativeSessionID,
    processID: result.handle.processID,
    heartbeatURI: runtimeMetadataString(result.handle.metadata, "heartbeatURI"),
    logURI: runtimeMetadataString(result.handle.metadata, "logURI"),
    reportURI: result.report?.uri,
    failureReason: result.status === "launch_failed" ? result.events.at(-1)?.summary : undefined,
    metadata: {
      ...(request.metadata ?? {}),
      runtime_kind: result.handle.kind,
      runtime_id: result.handle.runtimeID,
      runtime_native_session_id: result.handle.nativeSessionID ?? null,
      runtime_stream: result.stream,
      runtime_artifact_candidates: result.artifacts ?? [],
      runtime_report_candidate: result.report ?? null,
    },
  } satisfies WorkerLaunchServiceInput
}

function eventStreamViolations(result: WorkerRuntimeLaunchResult | WorkerRuntimeReadResult) {
  if (result.events.length === 0) {
    return [{ code: "empty_event_stream", summary: "Runtime result must include at least one normalized event." }] satisfies WorkerRuntimeConformanceViolation[]
  }
  const idempotencyKeys = result.events.map((event) => event.idempotencyKey).filter((key) => key.length > 0)
  const duplicateKeys = idempotencyKeys.filter((key, index) => idempotencyKeys.indexOf(key) !== index)
  return result.events
    .flatMap((event, index) => [
      event.producerID === result.stream.producerID
        ? undefined
        : {
            code: "producer_mismatch",
            summary: `Event ${event.offset} producer does not match stream producer.`,
          },
      event.epoch === result.stream.epoch
        ? undefined
        : {
            code: "epoch_mismatch",
            summary: `Event ${event.offset} epoch does not match stream epoch.`,
          },
      event.sequence > (result.events[index - 1]?.sequence ?? 0)
        ? undefined
        : {
            code: "offset_not_monotonic",
            summary: `Event sequence ${event.sequence} is not strictly monotonic.`,
          },
      event.idempotencyKey.length > 0
        ? undefined
        : {
            code: "missing_idempotency_key",
            summary: `Event ${event.offset} has no idempotency key.`,
          },
    ])
    .filter((violation): violation is WorkerRuntimeConformanceViolation => violation !== undefined)
    .concat(
      duplicateKeys.map((key) => ({
        code: "duplicate_idempotency_key",
        summary: `Runtime event idempotency key is duplicated: ${key}.`,
      })),
      result.events.at(-1)?.offset === result.stream.lastOffset
        ? []
        : [{ code: "stream_offset_mismatch", summary: "Stream lastOffset must equal the last event offset." }],
      result.stream.closed && result.events.at(-1)?.type !== "runtime.closed"
        ? [{ code: "closed_stream_missing_event", summary: "Closed streams must end with runtime.closed." }]
        : [],
    )
}

function runtimeIDViolations(result: WorkerRuntimeLaunchResult | WorkerRuntimeReadResult) {
  const handle = result.handle
  if (!handle) return []
  return [handle.runtimeID, handle.nativeSessionID]
    .filter((id): id is string => id !== undefined)
    .filter(isLightbulbAuthoritativeID)
    .map((id) => ({
      code: "authoritative_runtime_id",
      summary: `Runtime-native identifier must stay opaque and cannot be an authoritative Lightbulb ID: ${id}.`,
    })) satisfies WorkerRuntimeConformanceViolation[]
}

function candidateViolations(candidates: readonly (WorkerRuntimeReportCandidate | WorkerRuntimeArtifactCandidate)[]) {
  return candidates
    .filter((candidate) => ["id", "artifactID", "gateID", "runID"].some((key) => Object.hasOwn(candidate, key)))
    .map((candidate) => ({
      code: "authoritative_candidate_id",
      summary: `Runtime candidate ${candidate.uri} contains an authoritative Lightbulb ID field.`,
    })) satisfies WorkerRuntimeConformanceViolation[]
}

function runtimeMetadataString(metadata: Record<string, unknown> | undefined, key: string) {
  const value = metadata?.[key]
  if (typeof value === "string") return value
  return undefined
}

function launchServiceStatus(status: Lightbulb.WorkerLaunchStatus) {
  if (status === "requested" || status === "launching" || status === "running" || status === "launch_failed" || status === "blocked") return status
  return undefined
}

function isLightbulbAuthoritativeID(id: string) {
  return /^lb(acc|goal|loop|run|worker|packet|launch|artifact|gate|event|route|stop|steer|prcand|prwake)_/.test(id)
}
