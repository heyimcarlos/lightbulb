import { Buffer } from "buffer"
import { and, asc, eq, inArray, or } from "drizzle-orm"
import { Effect } from "effect"
import { fileURLToPath } from "url"
import type { Database } from "../database/database"
import { Hash } from "../util/hash"
import { isAbsolute, join } from "path"
import { LightbulbArtifactEdgeTable, LightbulbArtifactTable, LightbulbGateTable, LightbulbRunTable } from "./sql"
import type {
  AccountID,
  ArtifactDecisionSummary,
  ArtifactHandle,
  ArtifactID,
  ArtifactIntegritySummary,
  ArtifactRetentionDecision,
  ArtifactRetentionPolicy,
  ArtifactStatus,
  ArtifactType,
  DecisionStatus,
  GateStatus,
  RunID,
  RunStatus,
} from "../lightbulb"

type ArtifactMetadata = {
  readonly integrity?: {
    readonly algorithm?: "sha256"
    readonly sizeBytes?: number
    readonly checkedAt?: number
    readonly uncheckedReason?: string
  }
  readonly retention?: {
    readonly unresolvedDependencyIDs?: readonly string[]
  }
  readonly decision?: {
    readonly title?: string
    readonly status?: DecisionStatus
    readonly owner?: string
    readonly reviewer?: string
    readonly supersedesArtifactID?: ArtifactID
    readonly supersededByArtifactID?: ArtifactID
  }
}

export function readIssueArtifactsInDb(
  db: Database.Interface["db"],
  input: {
    readonly accountID: AccountID
    readonly issueRef: string
    readonly type?: ArtifactType
  },
) {
  return Effect.gen(function* () {
    const issueRef = input.issueRef.trim()
    if (!issueRef) return []
    const artifacts = yield* db
      .select()
      .from(LightbulbArtifactTable)
      .where(
        input.type
          ? and(
              eq(LightbulbArtifactTable.account_id, input.accountID),
              eq(LightbulbArtifactTable.source_issue_ref, issueRef),
              eq(LightbulbArtifactTable.type, input.type),
            )
          : and(eq(LightbulbArtifactTable.account_id, input.accountID), eq(LightbulbArtifactTable.source_issue_ref, issueRef)),
      )
      .orderBy(asc(LightbulbArtifactTable.time_created), asc(LightbulbArtifactTable.id))
      .all()
      .pipe(Effect.orDie)
    const now = Date.now()
    const handles = yield* Effect.all(
      artifacts.map((artifact) =>
        readArtifactHandle(db, {
          artifactID: artifact.id,
          now,
          liveCheck: false,
        }),
      ),
    )
    return handles.filter((artifact): artifact is ArtifactHandle => artifact !== undefined)
  })
}

export function integrityForRegistration(input: {
  readonly uri: string
  readonly baseDirectory?: string
  readonly checksum?: string
  readonly sizeBytes?: number
  readonly uncheckedReason?: string
  readonly now: number
}) {
  return Effect.gen(function* () {
    if (input.checksum) {
      return {
        checksum: input.checksum,
        metadata: {
          algorithm: "sha256" as const,
          checkedAt: input.now,
          sizeBytes: input.sizeBytes,
        },
      }
    }

    if (input.uncheckedReason) {
      return {
        checksum: null,
        metadata: {
          checkedAt: input.now,
          uncheckedReason: input.uncheckedReason,
        },
      }
    }

    const filePath = artifactFilePath(input.uri, input.baseDirectory)
    if (!filePath) {
      return {
        checksum: null,
        metadata: {
          checkedAt: input.now,
          uncheckedReason: "artifact uri is not a local file",
        },
      }
    }

    const file = Bun.file(filePath)
    const exists = yield* Effect.promise(() => file.exists())
    if (!exists) {
      return {
        checksum: null,
        metadata: {
          checkedAt: input.now,
          uncheckedReason: "artifact content missing during registration",
        },
      }
    }

    const content = Buffer.from(yield* Effect.promise(() => file.arrayBuffer()))
    return {
      checksum: `sha256:${Hash.sha256(content)}`,
      metadata: {
        algorithm: "sha256" as const,
        checkedAt: input.now,
        sizeBytes: content.byteLength,
      },
    }
  })
}

export function checkArtifactIntegrity(
  row: typeof LightbulbArtifactTable.$inferSelect,
  baseDirectory: string | undefined,
  now: number,
) {
  return Effect.gen(function* () {
    const metadata = artifactMetadata(row.metadata)
    if (!row.checksum) return uncheckedIntegrity(metadata, "checksum not recorded")

    const filePath = artifactFilePath(row.uri, baseDirectory)
    if (!filePath) return uncheckedIntegrity(metadata, "artifact uri is not a local file", row.checksum, now)

    const file = Bun.file(filePath)
    const exists = yield* Effect.promise(() => file.exists())
    if (!exists) {
      return {
        status: "missing" as const,
        checksum: row.checksum,
        checkedAt: now,
        uncheckedReason: null,
        expectedSizeBytes: metadata.integrity?.sizeBytes ?? null,
        actualChecksum: null,
        actualSizeBytes: null,
      }
    }

    const content = Buffer.from(yield* Effect.promise(() => file.arrayBuffer()))
    const actualChecksum = `sha256:${Hash.sha256(content)}`
    return {
      status: actualChecksum === row.checksum ? ("verified" as const) : ("changed" as const),
      checksum: row.checksum,
      checkedAt: now,
      uncheckedReason: null,
      expectedSizeBytes: metadata.integrity?.sizeBytes ?? null,
      actualChecksum,
      actualSizeBytes: content.byteLength,
    }
  })
}

export function storedArtifactIntegrity(row: typeof LightbulbArtifactTable.$inferSelect): ArtifactIntegritySummary {
  const metadata = artifactMetadata(row.metadata)
  if (!row.checksum) return uncheckedIntegrity(metadata, "checksum not recorded")
  return {
    status: "unchecked",
    checksum: row.checksum,
    checkedAt: metadata.integrity?.checkedAt ?? null,
    uncheckedReason: "live artifact content not checked",
    expectedSizeBytes: metadata.integrity?.sizeBytes ?? null,
    actualChecksum: null,
    actualSizeBytes: null,
  }
}

export function decisionForArtifact(row: typeof LightbulbArtifactTable.$inferSelect): ArtifactDecisionSummary | undefined {
  const decision = artifactMetadata(row.metadata).decision
  if (!decision?.status) return
  return {
    title: decision.title ?? null,
    status: decision.status,
    owner: decision.owner ?? null,
    reviewer: decision.reviewer ?? null,
    supersedesArtifactID: decision.supersedesArtifactID ?? null,
    supersededByArtifactID: decision.supersededByArtifactID ?? null,
  }
}

export function retentionDecisionFor(
  row: typeof LightbulbArtifactTable.$inferSelect,
  input: {
    readonly consumerRuns: (typeof LightbulbRunTable.$inferSelect)[]
    readonly gates: (typeof LightbulbGateTable.$inferSelect)[]
    readonly now: number
    readonly producerRun: typeof LightbulbRunTable.$inferSelect | undefined
  },
): ArtifactRetentionDecision {
  if (input.gates.some((gate) => isHoldingGateStatus(gate.status))) return "hold-for-gate"
  if ([input.producerRun, ...input.consumerRuns].some((run) => run && isActiveRunStatus(run.status)))
    return "hold-for-active-run"
  if ((artifactMetadata(row.metadata).retention?.unresolvedDependencyIDs?.length ?? 0) > 0) return "hold-for-dependency"
  if (row.status === "superseded") return "supersede"
  if (row.status === "expired") return "expire"

  const policy = parseRetentionPolicy(row.retention_policy)
  if (policy.mode === "supersede") return "supersede"
  if (policy.mode === "expire" && policy.expiresAt <= input.now) return "expire"
  return "keep"
}

export function statusForRetentionDecision(decision: ArtifactRetentionDecision): ArtifactStatus | undefined {
  if (decision === "expire") return "expired"
  if (decision === "supersede") return "superseded"
  return
}

export function readArtifactHandle(
  db: Database.Interface["db"],
  input: {
    readonly artifactID: ArtifactID
    readonly baseDirectory?: string
    readonly now: number
    readonly liveCheck: boolean
  },
) {
  return Effect.gen(function* () {
    const artifact = yield* db
      .select()
      .from(LightbulbArtifactTable)
      .where(eq(LightbulbArtifactTable.id, input.artifactID))
      .get()
      .pipe(Effect.orDie)
    if (!artifact) return

    const gates = yield* db
      .select()
      .from(LightbulbGateTable)
      .where(
        artifact.source_gate_id
          ? and(
              eq(LightbulbGateTable.account_id, artifact.account_id),
              or(eq(LightbulbGateTable.artifact_id, artifact.id), eq(LightbulbGateTable.id, artifact.source_gate_id)),
            )
          : and(eq(LightbulbGateTable.account_id, artifact.account_id), eq(LightbulbGateTable.artifact_id, artifact.id)),
      )
      .all()
      .pipe(Effect.orDie)
    const edges = yield* db
      .select()
      .from(LightbulbArtifactEdgeTable)
      .where(eq(LightbulbArtifactEdgeTable.artifact_id, artifact.id))
      .all()
      .pipe(Effect.orDie)
    const retentionRunIDs = [
      ...new Set([artifact.producer_run_id, artifact.source_run_id, ...edges.map((edge) => edge.consumer_run_id)])
    ].filter((runID): runID is RunID => !!runID)
    const relatedRuns = retentionRunIDs.length
      ? yield* db
          .select()
          .from(LightbulbRunTable)
          .where(inArray(LightbulbRunTable.id, retentionRunIDs))
          .all()
          .pipe(Effect.orDie)
      : []
    const consumerRuns = relatedRuns.filter(
      (run) => edges.some((edge) => edge.consumer_run_id === run.id) || run.id === artifact.source_run_id,
    )

    const integrity = input.liveCheck
      ? yield* checkArtifactIntegrity(artifact, input.baseDirectory, input.now)
      : storedArtifactIntegrity(artifact)

    return toArtifactHandle(artifact, edges, {
      integrity,
      retentionDecision: retentionDecisionFor(artifact, {
        consumerRuns,
        gates,
        now: input.now,
        producerRun: relatedRuns.find((run) => run.id === artifact.producer_run_id),
      }),
    })
  })
}

export function toArtifactHandle(
  row: typeof LightbulbArtifactTable.$inferSelect,
  edges: readonly (typeof LightbulbArtifactEdgeTable.$inferSelect)[] = [],
  input?: {
    readonly integrity: ArtifactIntegritySummary
    readonly retentionDecision: ArtifactRetentionDecision
  },
): ArtifactHandle {
  const decision = decisionForArtifact(row)
  return {
    id: row.id,
    type: row.type,
    uri: row.uri,
    summary: row.summary,
    status: row.status,
    integrity: input?.integrity ?? storedArtifactIntegrity(row),
    retentionPolicy: parseRetentionPolicy(row.retention_policy),
    retentionDecision: input?.retentionDecision ?? "keep",
    producerKind: row.producer_kind,
    producerRunID: row.producer_run_id,
    producerWorkerID: row.producer_worker_id,
    source: {
      ...(row.source_issue_ref ? { issueRef: row.source_issue_ref } : {}),
      ...(row.source_goal_id ? { goalID: row.source_goal_id } : {}),
      ...(row.source_loop_id ? { loopID: row.source_loop_id } : {}),
      ...(row.source_run_id ? { runID: row.source_run_id } : {}),
      ...(row.source_gate_id ? { gateID: row.source_gate_id } : {}),
    },
    lineage: edges.map((edge) => ({
      relation: edge.relation,
      runID: edge.consumer_run_id,
      workerID: edge.consumer_worker_id ?? null,
      summary: edge.summary,
    })),
    ...(decision ? { decision } : {}),
  }
}

export function serializeRetentionPolicy(policy: ArtifactRetentionPolicy) {
  if (policy.mode === "keep") return "keep"
  if (policy.mode === "expire") return `expire_at:${policy.expiresAt}`
  if (policy.supersededByArtifactID) return `supersede:${policy.supersededByArtifactID}`
  return "supersede"
}

export function parseRetentionPolicy(value: string): ArtifactRetentionPolicy {
  if (value === "keep") return { mode: "keep" }
  if (value === "expire") return { mode: "expire", expiresAt: 0 }
  if (value === "supersede") return { mode: "supersede" }
  if (value.startsWith("supersede:")) return { mode: "supersede", supersededByArtifactID: value.slice(10) as ArtifactID }
  if (value.startsWith("expire_at:")) {
    const expiresAt = Number(value.slice(10))
    if (Number.isFinite(expiresAt)) return { mode: "expire", expiresAt }
  }
  return { mode: "keep" }
}

function uncheckedIntegrity(
  metadata: ArtifactMetadata,
  fallbackReason: string,
  checksum: string | null = null,
  checkedAt?: number,
): ArtifactIntegritySummary {
  return {
    status: "unchecked",
    checksum,
    checkedAt: checkedAt ?? metadata.integrity?.checkedAt ?? null,
    uncheckedReason: metadata.integrity?.uncheckedReason ?? fallbackReason,
    expectedSizeBytes: metadata.integrity?.sizeBytes ?? null,
    actualChecksum: null,
    actualSizeBytes: null,
  }
}

function isActiveRunStatus(status: RunStatus) {
  return status === "queued" || status === "running" || status === "blocked"
}

function isHoldingGateStatus(status: GateStatus) {
  return status === "pending" || status === "running" || status === "blocked"
}

function artifactFilePath(uri: string, baseDirectory: string | undefined) {
  if (uri.startsWith("file://")) return fileURLToPath(uri)
  if (uri.includes("://")) return
  if (isAbsolute(uri) || !baseDirectory) return uri
  return join(baseDirectory, uri)
}

function artifactMetadata(metadata: Record<string, unknown> | null | undefined): ArtifactMetadata {
  if (!isRecord(metadata)) return {}

  const integrity = isRecord(metadata.integrity)
    ? {
        algorithm: metadata.integrity.algorithm === "sha256" ? ("sha256" as const) : undefined,
        checkedAt: typeof metadata.integrity.checkedAt === "number" ? metadata.integrity.checkedAt : undefined,
        sizeBytes: typeof metadata.integrity.sizeBytes === "number" ? metadata.integrity.sizeBytes : undefined,
        uncheckedReason:
          typeof metadata.integrity.uncheckedReason === "string" ? metadata.integrity.uncheckedReason : undefined,
      }
    : undefined
  const unresolvedDependencyIDs =
    isRecord(metadata.retention) && Array.isArray(metadata.retention.unresolvedDependencyIDs)
      ? metadata.retention.unresolvedDependencyIDs.filter((value): value is string => typeof value === "string")
      : undefined
  const decision = isRecord(metadata.decision)
    ? {
        title:
          typeof metadata.decision.title === "string" && metadata.decision.title.trim()
            ? metadata.decision.title.trim()
            : undefined,
        status: isDecisionStatus(metadata.decision.status) ? metadata.decision.status : undefined,
        owner:
          typeof metadata.decision.owner === "string" && metadata.decision.owner.trim()
            ? metadata.decision.owner.trim()
            : undefined,
        reviewer:
          typeof metadata.decision.reviewer === "string" && metadata.decision.reviewer.trim()
            ? metadata.decision.reviewer.trim()
            : undefined,
        supersedesArtifactID:
          typeof metadata.decision.supersedesArtifactID === "string"
            ? (metadata.decision.supersedesArtifactID as ArtifactID)
            : undefined,
        supersededByArtifactID:
          typeof metadata.decision.supersededByArtifactID === "string"
            ? (metadata.decision.supersededByArtifactID as ArtifactID)
            : undefined,
      }
    : undefined

  return {
    integrity,
    retention: unresolvedDependencyIDs?.length ? { unresolvedDependencyIDs } : undefined,
    decision,
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value)
}

function isDecisionStatus(value: unknown): value is DecisionStatus {
  return (
    value === "draft" ||
    value === "pending" ||
    value === "accepted" ||
    value === "rejected" ||
    value === "superseded" ||
    value === "needs-rework"
  )
}
