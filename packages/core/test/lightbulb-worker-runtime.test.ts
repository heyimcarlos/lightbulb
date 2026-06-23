import { describe, expect, test } from "bun:test"
import { Effect } from "effect"
import { Lightbulb } from "@opencode-ai/core/lightbulb"

const now = Date.UTC(2026, 5, 23)

describe("Lightbulb worker runtime adapter contract", () => {
  test("accepts OpenCode-native launch results without giving the adapter persistence authority", async () => {
    const observedRequests: Lightbulb.WorkerRuntimeLaunchRequest[] = []
    const adapter = {
      descriptor: Lightbulb.OpenCodeNativeWorkerRuntime,
      launch: (request) => {
        observedRequests.push(request)
        return Effect.succeed({
          status: "running",
          handle: {
            kind: "opencode",
            runtimeID: "opc_run_22",
            nativeSessionID: "ses_worker_22",
            processID: 42_022,
            metadata: {
              heartbeatURI: ".lightbulb/workers/issue-22/heartbeat.json",
              logURI: ".lightbulb/workers/issue-22/launch.log",
            },
          },
          stream: {
            producerID: request.stream.producerID,
            epoch: request.stream.epoch,
            lastOffset: "0000000002",
            closed: false,
          },
          events: [
            runtimeEvent(request, 1, "runtime.launch.requested", "Worker runtime accepted launch request."),
            runtimeEvent(request, 2, "runtime.launch.started", "OpenCode-native worker session started."),
          ],
          report: {
            status: "candidate",
            uri: ".lightbulb/runs/issue-22-worker.md",
            summary: "Expected final worker report.",
            format: "markdown",
          },
          artifacts: [
            {
              status: "candidate",
              type: "log",
              uri: ".lightbulb/workers/issue-22/launch.log",
              summary: "Worker launch log candidate.",
            },
          ],
        } satisfies Lightbulb.WorkerRuntimeLaunchResult)
      },
      read: (request) =>
        Effect.succeed({
          status: "running",
          stream: {
            producerID: request.stream.producerID,
            epoch: request.stream.epoch,
            lastOffset: request.stream.resumeAfterOffset ?? "0000000002",
            closed: false,
          },
          events: [],
        }),
    } satisfies Lightbulb.WorkerRuntimeAdapter

    const request = workerRuntimeRequest("opencode")
    const result = await Effect.runPromise(adapter.launch(request))
    const conformance = Lightbulb.validateWorkerRuntimeResult(result)
    const launchInput = Lightbulb.toWorkerLaunchServiceInput(request, result, now)

    expect(conformance).toEqual({ valid: true, violations: [] })
    expect(Object.keys(observedRequests[0] ?? {})).not.toContain("db")
    expect(Object.keys(observedRequests[0] ?? {})).not.toContain("database")
    expect(adapter.descriptor.default).toBe(true)
    expect(launchInput).toMatchObject({
      accountID: request.accountID,
      workerID: request.workerID,
      taskPacketID: request.taskPacketID,
      trigger: "scheduler",
      now,
      status: "running",
      cwd: "/home/ren/wt/lightbulb/issue-22",
      command: "opencode run --agent lightbulb-worker --format json",
      sessionID: "ses_worker_22",
      processID: 42_022,
      heartbeatURI: ".lightbulb/workers/issue-22/heartbeat.json",
      logURI: ".lightbulb/workers/issue-22/launch.log",
      reportURI: ".lightbulb/runs/issue-22-worker.md",
      metadata: {
        runtime_kind: "opencode",
        runtime_id: "opc_run_22",
        runtime_native_session_id: "ses_worker_22",
      },
    })
    expect(JSON.stringify(launchInput.metadata)).not.toContain("lbartifact_")
  })

  test("rejects non-monotonic offsets, duplicate producers, and authoritative runtime IDs", () => {
    const request = workerRuntimeRequest("opencode")
    const result = {
      status: "running",
      handle: {
        kind: "opencode",
        runtimeID: Lightbulb.RunID.create(),
      },
      stream: {
        producerID: request.stream.producerID,
        epoch: request.stream.epoch,
        lastOffset: "0000000005",
        closed: false,
      },
      events: [
        runtimeEvent(request, 2, "runtime.launch.requested", "Out of order launch request."),
        { ...runtimeEvent(request, 1, "runtime.launch.started", "Out of order launch start."), idempotencyKey: "duplicate" },
        { ...runtimeEvent(request, 3, "runtime.status", "Missing idempotency key."), idempotencyKey: "" },
        {
          ...runtimeEvent(request, 4, "runtime.status", "Wrong producer."),
          producerID: "runtime-other",
          idempotencyKey: "duplicate",
        },
      ],
    } satisfies Lightbulb.WorkerRuntimeLaunchResult

    expect(Lightbulb.validateWorkerRuntimeResult(result).violations.map((violation) => violation.code)).toEqual([
      "offset_not_monotonic",
      "missing_idempotency_key",
      "producer_mismatch",
      "duplicate_idempotency_key",
      "stream_offset_mismatch",
      "authoritative_runtime_id",
    ])
  })

  test("keeps report and artifact outputs as route-runner candidates only", () => {
    const request = workerRuntimeRequest("local_process")
    const result = {
      status: "complete",
      handle: {
        kind: "local_process",
        runtimeID: "local_22",
      },
      stream: {
        producerID: request.stream.producerID,
        epoch: request.stream.epoch,
        lastOffset: "0000000002",
        closed: true,
      },
      events: [
        runtimeEvent(request, 1, "runtime.report.candidate", "Worker report candidate is ready."),
        runtimeEvent(request, 2, "runtime.closed", "Local process runtime closed explicitly."),
      ],
      report: {
        status: "candidate",
        uri: ".lightbulb/runs/issue-22-worker.md",
        summary: "Candidate report for route-runner persistence.",
        format: "markdown",
      },
      artifacts: [
        {
          status: "candidate",
          type: "test_result",
          uri: ".lightbulb/runs/issue-22-test-result.json",
          summary: "Candidate test result for later artifact registration.",
        },
      ],
    } satisfies Lightbulb.WorkerRuntimeLaunchResult

    expect(Lightbulb.validateWorkerRuntimeResult(result)).toEqual({ valid: true, violations: [] })
    expect(Object.hasOwn(result.report, "id")).toBe(false)
    expect(Object.hasOwn(result.artifacts[0] ?? {}, "artifactID")).toBe(false)
    expect(Lightbulb.toWorkerLaunchServiceInput(request, result, now).metadata).toMatchObject({
      runtime_artifact_candidates: [
        {
          status: "candidate",
          type: "test_result",
          uri: ".lightbulb/runs/issue-22-test-result.json",
        },
      ],
      runtime_report_candidate: {
        status: "candidate",
        uri: ".lightbulb/runs/issue-22-worker.md",
      },
    })
  })

  test("fits local and Flue-shaped adapters without changing Lightbulb authority boundaries", async () => {
    const local = fakeAdapter(Lightbulb.LocalProcessWorkerRuntime, "local_process", "local_worker_90")
    const flue = fakeAdapter(Lightbulb.FlueComparableWorkerRuntime, "flue", "flue_workflow_90")
    const localResult = await Effect.runPromise(local.launch(workerRuntimeRequest("local_process")))
    const flueResult = await Effect.runPromise(flue.launch(workerRuntimeRequest("flue")))

    expect(local.descriptor.default).toBe(false)
    expect(flue.descriptor.default).toBe(false)
    expect(Lightbulb.validateWorkerRuntimeResult(localResult)).toEqual({ valid: true, violations: [] })
    expect(Lightbulb.validateWorkerRuntimeResult(flueResult)).toEqual({ valid: true, violations: [] })
    expect(localResult.handle.runtimeID).toBe("local_worker_90")
    expect(flueResult.handle.runtimeID).toBe("flue_workflow_90")
    expect(JSON.stringify(flueResult)).not.toContain("lbrun_")
  })
})

function workerRuntimeRequest(kind: Lightbulb.WorkerRuntimeKind): Lightbulb.WorkerRuntimeLaunchRequest {
  return {
    accountID: Lightbulb.AccountID.create(),
    runID: Lightbulb.RunID.create(),
    workerID: Lightbulb.WorkerID.create(),
    taskPacketID: Lightbulb.TaskPacketID.create(),
    launchAttemptID: Lightbulb.WorkerLaunchAttemptID.create(),
    trigger: "scheduler",
    command: kind === "opencode" ? "opencode run --agent lightbulb-worker --format json" : `${kind} run worker`,
    cwd: "/home/ren/wt/lightbulb/issue-22",
    worktreeID: "issue-22",
    profileID: "implementation",
    issueRef: "#22",
    environmentSummary: {
      runtime: kind,
    },
    stream: {
      producerID: `runtime-${kind}-issue-22`,
      epoch: 7,
    },
  }
}

function runtimeEvent(
  request: Lightbulb.WorkerRuntimeLaunchRequest,
  sequence: number,
  type: Lightbulb.WorkerRuntimeEventType,
  summary: string,
): Lightbulb.WorkerRuntimeEvent {
  return {
    type,
    channel: type.includes("artifact") || type.includes("report") ? "artifact" : "status",
    producerID: request.stream.producerID,
    epoch: request.stream.epoch,
    offset: sequence.toString().padStart(10, "0"),
    sequence,
    idempotencyKey: `${request.stream.producerID}:${sequence}`,
    summary,
    timeCreated: now + sequence,
  }
}

function fakeAdapter(
  descriptor: Lightbulb.WorkerRuntimeDescriptor,
  kind: Lightbulb.WorkerRuntimeKind,
  runtimeID: string,
): Lightbulb.WorkerRuntimeAdapter {
  return {
    descriptor,
    launch: (request) =>
      Effect.succeed({
        status: "running",
        handle: {
          kind,
          runtimeID,
        },
        stream: {
          producerID: request.stream.producerID,
          epoch: request.stream.epoch,
          lastOffset: "0000000001",
          closed: false,
        },
        events: [runtimeEvent(request, 1, "runtime.launch.started", `${descriptor.name} returned a launch handle.`)],
      }),
    read: (request) =>
      Effect.succeed({
        status: "running",
        stream: {
          producerID: request.stream.producerID,
          epoch: request.stream.epoch,
          lastOffset: request.stream.resumeAfterOffset ?? "0000000001",
          closed: false,
        },
        events: [],
      }),
  }
}
