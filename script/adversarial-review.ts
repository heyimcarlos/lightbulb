#!/usr/bin/env bun

import { spawnSync } from "node:child_process"
import path from "node:path"

type Finding = {
  readonly title: string
  readonly detail: string
}

type ChangedFile = {
  readonly path: string
  readonly status: string
  readonly additions: number
  readonly deletions: number
}

type PullRequestEvent = {
  readonly pull_request?: {
    readonly title?: unknown
    readonly body?: unknown
    readonly number?: unknown
  }
}

const root = path.resolve(import.meta.dir, "..")
const args = process.argv.slice(2)
const usage =
  "Usage: bun run script/adversarial-review.ts [--base <ref>] [--head <ref>] [--event <path>] [--out <path>] [--markdown <path>]"
const optionNames = new Set(["--base", "--head", "--event", "--out", "--markdown"])

if (args.includes("--help") || args.includes("-h")) {
  console.log(usage)
  process.exit(0)
}

const base = readOption("--base") ?? "origin/dev"
const head = readOption("--head") ?? "HEAD"
const eventPath = readOption("--event")
const outPath = readOption("--out")
const markdownPath = readOption("--markdown")
const optionValues = new Set(
  args
    .map((arg, index) => (optionNames.has(args[index - 1] ?? "") ? arg : undefined))
    .filter((arg): arg is string => arg !== undefined),
)
const unknown = args.find((arg) => arg.startsWith("-") && !optionNames.has(arg) && !optionValues.has(arg))
if (unknown) {
  console.error(`Unknown option: ${unknown}`)
  console.error(usage)
  process.exit(1)
}

const event = eventPath ? await readPullRequestEvent(eventPath) : undefined
const prTitle = event?.pull_request && typeof event.pull_request.title === "string" ? event.pull_request.title : ""
const prBody = event?.pull_request && typeof event.pull_request.body === "string" ? event.pull_request.body : ""
const changedFiles = readChangedFiles()
const patch = git(["diff", "--unified=0", "--no-ext-diff", `${base}...${head}`])
const shortstat = git(["diff", "--shortstat", `${base}...${head}`]).trim() || "No file changes"

const blockers = [
  ...visualEvidenceBlockers(),
  ...hiddenAutomationBlockers(),
  ...unsafeWorkflowBlockers(),
  ...rawTranscriptBlockers(),
  ...oversizedChangeBlockers(),
]
const warnings = [
  ...testCoverageWarnings(),
  ...verificationWarnings(),
  ...largeChangeWarnings(),
  ...evidenceWarnings(),
  ...workflowWarnings(),
]
const passes = [
  `${changedFiles.length} changed file${changedFiles.length === 1 ? "" : "s"} inspected.`,
  "No paid AI reviewer, model API, or external service was required.",
  blockers.length === 0 ? "No high-confidence Lightbulb review blockers found." : undefined,
  hasVisualSurfaceChange() && hasVisualEvidence() ? "Visual/CLI-facing changes include evidence in the PR body." : undefined,
  hasCodeChange() && hasPackageLocalVerification()
    ? "Code changes include package-local verification in the PR body."
    : undefined,
].filter((item): item is string => item !== undefined)
const result = {
  status: blockers.length > 0 ? "fail" : "pass",
  summary: shortstat,
  base,
  head,
  pullRequest: {
    title: prTitle,
    number: event?.pull_request?.number,
  },
  blockers,
  warnings,
  passes,
  changedFiles,
}
const markdown = renderMarkdown()

if (outPath) await Bun.write(path.resolve(root, outPath), `${JSON.stringify(result, null, 2)}\n`)
if (markdownPath) await Bun.write(path.resolve(root, markdownPath), markdown)

console.log(markdown)

function readOption(name: string) {
  const index = args.indexOf(name)
  if (index === -1) return undefined
  const value = args[index + 1]
  if (!value || value.startsWith("-")) {
    console.error(`Missing value for ${name}`)
    console.error(usage)
    process.exit(1)
  }
  return value
}

async function readPullRequestEvent(file: string): Promise<PullRequestEvent> {
  const json = await Bun.file(path.resolve(root, file)).json()
  return isRecord(json) ? (json as PullRequestEvent) : {}
}

function readChangedFiles() {
  const additions = new Map(
    git(["diff", "--numstat", `${base}...${head}`])
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const parts = line.split("\t")
        const file = parts[2] ?? ""
        return [
          normalizeDiffPath(file),
          {
            additions: parseStat(parts[0]),
            deletions: parseStat(parts[1]),
          },
        ] as const
      }),
  )
  return git(["diff", "--name-status", "--find-renames", `${base}...${head}`])
    .split("\n")
    .filter(Boolean)
    .map((line): ChangedFile => {
      const parts = line.split("\t")
      const file = normalizeDiffPath(parts[parts.length - 1] ?? "")
      return {
        path: file,
        status: parts[0] ?? "M",
        additions: additions.get(file)?.additions ?? 0,
        deletions: additions.get(file)?.deletions ?? 0,
      }
    })
}

function git(gitArgs: readonly string[]) {
  const result = spawnSync("git", gitArgs, {
    cwd: root,
    encoding: "utf8",
  })
  if (result.status === 0) return result.stdout
  console.error(result.stderr)
  process.exit(result.status ?? 1)
}

function fileAtHead(file: string) {
  const result = spawnSync("git", ["show", `${head}:${file}`], {
    cwd: root,
    encoding: "utf8",
  })
  if (result.status === 0) return result.stdout
  return ""
}

function parseStat(value: string | undefined) {
  if (!value || value === "-") return 0
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) ? parsed : 0
}

function normalizeDiffPath(file: string) {
  return file.replace(/\{.* => (.*)\}/, "$1")
}

function visualEvidenceBlockers(): readonly Finding[] {
  if (!hasVisualSurfaceChange()) return []
  if (hasVisualEvidence()) return []
  return [
    {
      title: "Missing visual evidence for user-facing changes",
      detail:
        "This PR changes app, desktop, TUI, or CLI-facing files but the PR body does not link a screenshot, recording, terminal evidence card, or explicit not-applicable rationale.",
    },
  ]
}

function hiddenAutomationBlockers(): readonly Finding[] {
  const additions = addedLines()
  const addedCron = additions.some((line) => line.match(/^\+\s*(-\s*)?cron:/))
  const addedWorkflowSchedule = workflowChanged() && additions.some((line) => line.match(/^\+\s*schedule:\s*$/))
  if (!addedCron && !addedWorkflowSchedule) return []
  return [
    {
      title: "Scheduled automation added",
      detail:
        "The diff adds cron/schedule automation. Lightbulb stable-v0 requires scheduled loops to be explicit, documented, and operator-approved.",
    },
  ]
}

function unsafeWorkflowBlockers(): readonly Finding[] {
  const additions = addedLines()
  const workflowContents = changedFiles
    .filter((file) => file.path.startsWith(".github/workflows/"))
    .map((file) => fileAtHead(file.path))
    .join("\n")
  return [
    ...(!workflowChanged() ? [] : []),
    ...(additions.some((line) => line.match(/^\+\s*(contents|actions|packages):\s*write\b/))
      ? [
          {
            title: "Broad write permission in workflow",
            detail:
              "The diff grants contents/actions/packages write permissions. Keep PR review automation least-privilege and route risky writes through safe-write gates.",
          },
        ]
      : []),
    ...(workflowContents.includes("pull_request_target") && workflowContents.includes("github.event.pull_request.head")
      ? [
          {
            title: "pull_request_target appears to execute PR-head code",
            detail:
              "Do not combine pull_request_target privileges with checkout/execution of PR-head code. Run trusted base-branch scripts against fetched diffs instead.",
          },
        ]
      : []),
  ]
}

function rawTranscriptBlockers(): readonly Finding[] {
  const rawFiles = changedFiles.filter((file) => file.path.match(/(^|\/)(transcript|conversation|messages|raw-log)/i))
  if (rawFiles.length === 0) return []
  return [
    {
      title: "Raw transcript-shaped content detected",
      detail: `Avoid committing raw worker/provider transcripts. Use bounded summaries and artifact handles instead. Suspect files: ${formatFiles(rawFiles)}.`,
    },
  ]
}

function oversizedChangeBlockers(): readonly Finding[] {
  const hugeFiles = changedFiles.filter((file) => file.additions >= 1_500)
  if (hugeFiles.length === 0) return []
  return [
    {
      title: "Oversized single-file addition",
      detail: `One file adds at least 1500 lines. Split generated or broad changes unless this is a reviewed artifact. Files: ${formatFiles(hugeFiles)}.`,
    },
  ]
}

function testCoverageWarnings(): readonly Finding[] {
  if (!hasCodeChange() || hasTestChange()) return []
  return [
    {
      title: "No test file changed with source changes",
      detail:
        "Source files changed without a matching test fixture/update. This may be fine for pure plumbing, but the PR should explain the verification boundary.",
    },
  ]
}

function verificationWarnings(): readonly Finding[] {
  if (!hasCodeChange()) return []
  return [
    ...(!hasPackageLocalVerification()
      ? [
          {
            title: "Package-local verification not visible",
            detail:
              "The PR body should list package-local test/typecheck commands, for example `cd packages/core && bun test ...` and `cd packages/core && bun typecheck`.",
          },
        ]
      : []),
    ...(prBody.match(/(^|\s)bun test(\s|$)/) && !prBody.includes("cd packages/")
      ? [
          {
            title: "Root test command mentioned",
            detail:
              "This repo blocks root-level tests. Verification should run from the owning package directory, not from the repository root.",
          },
        ]
      : []),
  ]
}

function largeChangeWarnings(): readonly Finding[] {
  const largeFiles = changedFiles.filter((file) => file.additions >= 500 && file.additions < 1_500)
  if (largeFiles.length === 0) return []
  return [
    {
      title: "Large file additions need extra review",
      detail: `Files with at least 500 added lines should have focused evidence and be checked for generated/sloppy code: ${formatFiles(largeFiles)}.`,
    },
  ]
}

function evidenceWarnings(): readonly Finding[] {
  if (!hasVisualSurfaceChange() || changesEvidenceFile()) return []
  return [
    {
      title: "No committed Lightbulb evidence artifact",
      detail:
        "Visual or CLI-facing changes should usually include `.lightbulb/evidence/...` artifacts, or the PR body should explain why external evidence is enough.",
    },
  ]
}

function workflowWarnings(): readonly Finding[] {
  if (!workflowChanged()) return []
  return [
    {
      title: "Workflow changed",
      detail:
        "Workflow changes should be reviewed for token scope, event type, and whether PR-head code can run with elevated permissions.",
    },
  ]
}

function hasVisualSurfaceChange() {
  return changedFiles.some((file) =>
    file.path.match(/^(packages\/app|packages\/desktop|packages\/tui)\//) ||
    file.path.match(/^packages\/opencode\/(src\/cli|test\/cli|bin)\//),
  )
}

function hasVisualEvidence() {
  const section = readSection("Screenshots / recordings")
  return Boolean(
    section.match(/\.(png|jpe?g|gif|webm|mp4|svg)\b/i) ||
      section.match(/screenshot|recording|visual evidence|terminal evidence|terminal-screenshot|not applicable/i),
  )
}

function hasCodeChange() {
  return changedFiles.some((file) => file.path.match(/^packages\/.*\/src\/.*\.(ts|tsx|js|jsx)$/))
}

function hasTestChange() {
  return changedFiles.some((file) => file.path.match(/(^|\/)(test|tests|e2e)\//) || file.path.match(/\.test\./))
}

function hasPackageLocalVerification() {
  return Boolean(prBody.match(/cd packages\/[a-z0-9-]+ && bun (test|typecheck|run)/i))
}

function workflowChanged() {
  return changedFiles.some((file) => file.path.startsWith(".github/workflows/"))
}

function changesEvidenceFile() {
  return changedFiles.some((file) => file.path.startsWith(".lightbulb/evidence/"))
}

function addedLines() {
  return patch.split("\n").filter((line) => line.startsWith("+") && !line.startsWith("+++"))
}

function readSection(title: string) {
  const escaped = title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  return prBody.match(new RegExp(`### ${escaped}\\s*\\n([\\s\\S]*?)(?=###|$)`, "i"))?.[1]?.trim() ?? ""
}

function formatFiles(files: readonly ChangedFile[]) {
  if (files.length === 0) return "none"
  return files
    .slice(0, 8)
    .map((file) => `${file.path} (+${file.additions}/-${file.deletions})`)
    .join(", ")
}

function renderMarkdown() {
  return [
    "<!-- lightbulb-adversarial-review -->",
    "## Lightbulb Adversarial Review",
    "",
    `**Result:** ${blockers.length > 0 ? "blocked" : "passed"}`,
    "",
    `Diff: ${shortstat}`,
    "",
    renderFindings("Blockers", blockers, "_No high-confidence blockers._"),
    renderFindings("Warnings", warnings, "_No warnings._"),
    renderList("Passed Checks", passes),
    "",
    "<sub>Deterministic Lightbulb reviewer. No paid AI reviewer, Copilot, Codex, or model API was used.</sub>",
  ].join("\n")
}

function renderFindings(title: string, findings: readonly Finding[], empty: string) {
  if (findings.length === 0) return [`### ${title}`, "", empty].join("\n")
  return [
    `### ${title}`,
    "",
    ...findings.map((finding) => `- **${finding.title}:** ${finding.detail}`),
  ].join("\n")
}

function renderList(title: string, items: readonly string[]) {
  if (items.length === 0) return [`### ${title}`, "", "_No checks recorded._"].join("\n")
  return [`### ${title}`, "", ...items.map((item) => `- ${item}`)].join("\n")
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
