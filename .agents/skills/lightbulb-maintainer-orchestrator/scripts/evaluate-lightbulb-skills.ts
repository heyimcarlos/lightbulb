const skillPaths = Array.from(new Bun.Glob("lightbulb-*/SKILL.md").scanSync({ cwd: ".agents/skills" }))
  .map((skillPath) => `.agents/skills/${skillPath}`)
  .sort()

const skills = await Promise.all(
  skillPaths.map(async (skillPath) => {
    const text = await Bun.file(skillPath).text()
    const frontmatter = parseFrontmatter(text)
    return {
      path: skillPath,
      directory: skillPath.split("/").at(-2) ?? "",
      name: frontmatter.metadata.get("name") ?? "",
      description: frontmatter.metadata.get("description") ?? "",
      modelInvoked: frontmatter.metadata.get("disable-model-invocation") !== "true",
      lineCount: text.trimEnd().split(/\r?\n/).length,
      text,
    }
  }),
)

const stopwords = new Set([
  "and",
  "are",
  "for",
  "from",
  "got",
  "has",
  "the",
  "through",
  "to",
  "use",
  "when",
  "with",
])

const checks = [
  ...skills.flatMap((skill) => [
    {
      name: `${skill.name}: frontmatter name matches directory`,
      pass: skill.name === skill.directory,
      detail: `${skill.name} vs ${skill.directory}`,
    },
    {
      name: `${skill.name}: model-invoked description has trigger pointer`,
      pass: !skill.modelInvoked || skill.description.includes("Use when "),
      detail: skill.description,
    },
    {
      name: `${skill.name}: description stays under 1024 chars`,
      pass: skill.description.length <= 1024,
      detail: `${skill.description.length} chars`,
    },
    {
      name: `${skill.name}: SKILL.md stays under 100 lines`,
      pass: skill.lineCount <= 100,
      detail: `${skill.lineCount} lines`,
    },
    {
      name: `${skill.name}: uses loop vocabulary without duplicate-as-catchall`,
      pass: !/\bduplicates?\b/i.test(skill.text),
      detail: "prefer redundant/repeated/already covered unless exact duplication is the domain concept",
    },
  ]),
  {
    name: "background subagent env gate has one source of truth",
    pass: occurrenceCount("OPENCODE_EXPERIMENTAL_BACKGROUND_SUBAGENTS") === 1,
    detail: `${occurrenceCount("OPENCODE_EXPERIMENTAL_BACKGROUND_SUBAGENTS")} occurrences`,
  },
]

const routingCases = [
  {
    prompt: "triage the open Lightbulb GitHub issues and PR queue",
    expected: "lightbulb-github-project-triage",
  },
  {
    prompt: "keep Lightbulb moving autonomously and wake up periodically",
    expected: "lightbulb-maintainer-orchestrator",
  },
  {
    prompt: "the Hermes loop state and worker dispatch look broken",
    expected: "lightbulb-loop-maintainer",
  },
  {
    prompt: "run the next PR through maker reviewer checks and merge gates",
    expected: "lightbulb-pr-pipeline",
  },
  {
    prompt: "delegate implementation and review to workers in isolated worktrees",
    expected: "lightbulb-delegate",
  },
]

const routingChecks = routingCases.map((testCase) => {
  const promptTokens = tokens(testCase.prompt)
  const scores = skills
    .map((skill) => ({
      name: skill.name,
      score: overlap(promptTokens, tokens(`${skill.name} ${skill.description}`)),
    }))
    .sort((left, right) => right.score - left.score || left.name.localeCompare(right.name))
  const winner = scores[0]
  return {
    name: `routing: ${testCase.prompt}`,
    pass: winner?.name === testCase.expected && winner.score > 0,
    detail: `expected ${testCase.expected}, got ${winner?.name ?? "none"} (${winner?.score ?? 0})`,
  }
})

const allChecks = [...checks, ...routingChecks]
const failures = allChecks.filter((check) => !check.pass)

console.log("# Lightbulb skill eval")
console.log("")
console.log("## Skill sizes")
skills.forEach((skill) => console.log(`- ${skill.name}: ${skill.lineCount} lines`))
console.log("")
console.log("## Checks")
allChecks.forEach((check) => {
  console.log(`- ${check.pass ? "PASS" : "FAIL"} ${check.name} (${check.detail})`)
})

if (failures.length > 0) {
  console.error("")
  console.error(`${failures.length} eval check(s) failed.`)
  process.exit(1)
}

function parseFrontmatter(text: string) {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/)
  if (!match?.[1]) return { metadata: new Map<string, string>() }
  return {
    metadata: new Map(
      match[1]
        .split(/\r?\n/)
        .map((line) => line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/))
        .filter((match): match is RegExpMatchArray => Boolean(match))
        .map((match) => [match[1], match[2]?.replace(/^"(.*)"$/, "$1") ?? ""]),
    ),
  }
}

function occurrenceCount(needle: string) {
  return skills.reduce((count, skill) => count + skill.text.split(needle).length - 1, 0)
}

function tokens(input: string) {
  return new Set(
    input
      .toLowerCase()
      .replace(/[^a-z0-9 -]/g, " ")
      .split(/\s+/)
      .filter((token) => token.length > 2)
      .filter((token) => !stopwords.has(token)),
  )
}

function overlap(left: Set<string>, right: Set<string>) {
  return Array.from(left).filter((token) => right.has(token)).length
}
