import type { Lightbulb } from "../lightbulb"
import { Hash } from "../util/hash"

export type SafeWriteRiskLevel = "low" | "medium" | "high"
export type SafeWriteIssueType = "issue" | "pull_request"
export type SafeWriteConnectorAuthority = "read" | "comment" | "label" | "edit" | "branch_pull_request" | "merge"

export type SafeWriteConnectorCapabilityProfile = {
  readonly connector: string
  readonly authorities: readonly SafeWriteConnectorAuthority[]
  readonly defaultRisk?: SafeWriteRiskLevel
  readonly supportsDryRun?: boolean
}

export type SafeWritePolicyInput = {
  readonly profile: SafeWriteConnectorCapabilityProfile
  readonly risk?: SafeWriteRiskLevel
  readonly maxRisk?: SafeWriteRiskLevel
  readonly issueType?: SafeWriteIssueType
  readonly allowedIssueTypes?: readonly SafeWriteIssueType[]
  readonly deniedIssueTypes?: readonly SafeWriteIssueType[]
  readonly pathRefs?: readonly string[]
  readonly allowedPathPrefixes?: readonly string[]
  readonly deniedPathPrefixes?: readonly string[]
  readonly allowedLabels?: readonly string[]
  readonly deniedLabels?: readonly string[]
}

export type SafeWriteIssueMutationLike = {
  readonly action: Lightbulb.IssueMutationAction
  readonly repository: string
  readonly labels?: readonly string[]
  readonly addLabels?: readonly string[]
  readonly removeLabels?: readonly string[]
}

export type SafeWritePolicyEvaluation = {
  readonly handle: string
  readonly connector: string
  readonly authorities: readonly SafeWriteConnectorAuthority[]
  readonly requiredAuthority: SafeWriteConnectorAuthority
  readonly risk: SafeWriteRiskLevel
  readonly issueType: SafeWriteIssueType
  readonly pathRefs: readonly string[]
  readonly labels: readonly string[]
  readonly holdReasons: readonly Lightbulb.IssueMutationHoldReason[]
}

export function evaluateIssueMutationSafeWritePolicy(input: {
  readonly mutation: SafeWriteIssueMutationLike
  readonly policy?: SafeWritePolicyInput
}): SafeWritePolicyEvaluation | null {
  if (!input.policy) return null

  const requiredAuthority = requiredAuthorityForIssueMutation(input.mutation.action)
  const risk = input.policy.risk ?? input.policy.profile.defaultRisk ?? "low"
  const issueType = input.policy.issueType ?? "issue"
  const pathRefs = normalizeList(input.policy.pathRefs ?? [])
  const labels = normalizeList([
    ...(input.mutation.labels ?? []),
    ...(input.mutation.addLabels ?? []),
    ...(input.mutation.removeLabels ?? []),
  ])
  const authorities = normalizeAuthorities(input.policy.profile.authorities)
  const holdReasons = [
    ...authorityHoldReasons(authorities, requiredAuthority),
    ...issueTypeHoldReasons(input.policy, issueType),
    ...pathHoldReasons(input.policy, pathRefs),
    ...labelHoldReasons(input.policy, labels),
    ...riskHoldReasons(input.policy, risk),
  ].filter(uniqueReason)

  return {
    handle: "lightbulb:safe-write:" + Hash.fast(JSON.stringify({
      connector: input.policy.profile.connector.trim(),
      authorities,
      requiredAuthority,
      risk,
      issueType,
      pathRefs,
      labels,
      holdReasons,
    })),
    connector: input.policy.profile.connector.trim(),
    authorities,
    requiredAuthority,
    risk,
    issueType,
    pathRefs,
    labels,
    holdReasons,
  }
}

export function safeWritePolicyEvaluationMetadata(evaluation: SafeWritePolicyEvaluation) {
  return {
    handle: evaluation.handle,
    connector: evaluation.connector,
    authorities: evaluation.authorities,
    required_authority: evaluation.requiredAuthority,
    risk: evaluation.risk,
    issue_type: evaluation.issueType,
    path_refs: evaluation.pathRefs,
    labels: evaluation.labels,
    hold_reasons: evaluation.holdReasons,
  }
}

function authorityHoldReasons(
  authorities: readonly SafeWriteConnectorAuthority[],
  requiredAuthority: SafeWriteConnectorAuthority,
): readonly Lightbulb.IssueMutationHoldReason[] {
  return authorities.includes(requiredAuthority) ? [] : ["unsupported_adapter_capability"]
}

function issueTypeHoldReasons(
  policy: SafeWritePolicyInput,
  issueType: SafeWriteIssueType,
): readonly Lightbulb.IssueMutationHoldReason[] {
  const allowed = normalizeList(policy.allowedIssueTypes ?? [])
  const denied = normalizeList(policy.deniedIssueTypes ?? [])
  if (denied.includes(issueType)) return ["safe_write_issue_type_denied"]
  if (allowed.length > 0 && !allowed.includes(issueType)) return ["safe_write_issue_type_denied"]
  return []
}

function pathHoldReasons(
  policy: SafeWritePolicyInput,
  pathRefs: readonly string[],
): readonly Lightbulb.IssueMutationHoldReason[] {
  const allowed = normalizeList(policy.allowedPathPrefixes ?? [])
  const denied = normalizeList(policy.deniedPathPrefixes ?? [])
  if (pathRefs.some((pathRef) => denied.some((prefix) => pathRef.startsWith(prefix)))) return ["safe_write_path_denied"]
  if (allowed.length > 0 && pathRefs.some((pathRef) => !allowed.some((prefix) => pathRef.startsWith(prefix)))) {
    return ["safe_write_path_denied"]
  }
  return []
}

function labelHoldReasons(
  policy: SafeWritePolicyInput,
  labels: readonly string[],
): readonly Lightbulb.IssueMutationHoldReason[] {
  const allowed = normalizeList(policy.allowedLabels ?? [])
  const denied = normalizeList(policy.deniedLabels ?? [])
  if (labels.some((label) => denied.includes(label))) return ["safe_write_label_denied"]
  if (allowed.length > 0 && labels.some((label) => !allowed.includes(label))) return ["safe_write_label_denied"]
  return []
}

function riskHoldReasons(
  policy: SafeWritePolicyInput,
  risk: SafeWriteRiskLevel,
): readonly Lightbulb.IssueMutationHoldReason[] {
  if (!policy.maxRisk) return []
  return riskRank[risk] > riskRank[policy.maxRisk] ? ["safe_write_risk_denied"] : []
}

function requiredAuthorityForIssueMutation(action: Lightbulb.IssueMutationAction): SafeWriteConnectorAuthority {
  if (action === "add_comment") return "comment"
  if (action === "add_label" || action === "remove_label") return "label"
  return "edit"
}

function normalizeList(values: readonly string[]) {
  return [...new Set(values.map((value) => value.trim().toLowerCase()).filter(Boolean))].sort()
}

function normalizeAuthorities(authorities: readonly SafeWriteConnectorAuthority[]) {
  return [...new Set(authorities.map((authority) => authority.trim()).filter(Boolean))].sort() as SafeWriteConnectorAuthority[]
}

function uniqueReason(
  reason: Lightbulb.IssueMutationHoldReason,
  index: number,
  reasons: readonly Lightbulb.IssueMutationHoldReason[],
) {
  return reasons.indexOf(reason) === index
}

const riskRank = {
  low: 1,
  medium: 2,
  high: 3,
} satisfies Record<SafeWriteRiskLevel, number>
