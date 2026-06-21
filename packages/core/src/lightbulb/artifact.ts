import { Buffer } from "buffer"
import { Effect } from "effect"
import { fileURLToPath } from "url"
import { Hash } from "../util/hash"
import { isAbsolute, join } from "path"
import { LightbulbArtifactTable, LightbulbGateTable, LightbulbRunTable } from "./sql"
import type {
  ArtifactID,
  ArtifactIntegritySummary,
  ArtifactRetentionDecision,
  ArtifactRetentionPolicy,
  ArtifactStatus,
  GateStatus,
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
}

export function integrityForRegistration(input: {
  readonly uri: string
  readonly baseDirectory?: string
  readonly uncheckedReason?: string
  readonly now: number
}) {
  return Effect.gen(function* () {
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

  return {
    integrity,
    retention: unresolvedDependencyIDs?.length ? { unresolvedDependencyIDs } : undefined,
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value)
}
