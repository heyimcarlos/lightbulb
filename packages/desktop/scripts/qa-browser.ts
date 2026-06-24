import { mkdir, mkdtemp } from "node:fs/promises"
import { createRequire } from "node:module"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const require = createRequire(import.meta.url)
const desktopRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const repoRoot = resolve(desktopRoot, "../..")
const route = process.env.OPENCODE_DESKTOP_QA_ROUTE ?? "/browser"
const target = desktopQaTarget(route)
const timeoutMs = Number(process.env.OPENCODE_DESKTOP_QA_TIMEOUT_MS ?? 45_000)
const outDir = outputDirectory()
const screenshot = join(outDir, `${target.name}.png`)
const metadata = join(outDir, `${target.name}.json`)
const qaRoot = process.env.OPENCODE_DESKTOP_QA_ROOT ?? (await mkdtemp(join(tmpdir(), "lightbulb-desktop-qa-")))

await mkdir(outDir, { recursive: true })
await run(["bun", "./scripts/ensure-electron.ts"])
await run(["bun", "run", "build"], {
  OPENCODE_DESKTOP_QA: "1",
  OPENCODE_DESKTOP_QA_ROUTE: route,
})
await run(
  [require("electron"), "."],
  {
    ELECTRON_ENABLE_LOGGING: "1",
    OPENCODE_DESKTOP_QA: "1",
    OPENCODE_DESKTOP_QA_METADATA: metadata,
    OPENCODE_DESKTOP_QA_ROOT: qaRoot,
    OPENCODE_DESKTOP_QA_ROUTE: route,
    OPENCODE_DESKTOP_QA_SELECTOR: target.selector,
    OPENCODE_DESKTOP_QA_SCREENSHOT: screenshot,
    OPENCODE_DESKTOP_REMOTE_DEBUGGING_PORT: "off",
  },
  timeoutMs,
)

console.log(`Desktop browser QA screenshot: ${screenshot}`)
console.log(`Desktop browser QA metadata: ${metadata}`)

async function run(command: string[], env: Record<string, string> = {}, timeout?: number) {
  const child = Bun.spawn(command, {
    cwd: desktopRoot,
    env: { ...process.env, ...env },
    stdout: "inherit",
    stderr: "inherit",
  })
  let timedOut = false
  const timer = timeout
    ? setTimeout(() => {
        timedOut = true
        child.kill()
      }, timeout).unref()
    : undefined
  const code = await child.exited
  if (timer) clearTimeout(timer)
  if (timedOut) throw new Error(`${command.join(" ")} timed out after ${timeout}ms`)
  if (code !== 0) throw new Error(`${command.join(" ")} exited with ${code}`)
}

function outputDirectory() {
  const index = process.argv.indexOf("--out")
  if (index === -1) return join(repoRoot, ".lightbulb/evidence/desktop-browser-qa")
  const value = process.argv[index + 1]
  if (!value) throw new Error("--out requires a directory")
  return resolve(process.cwd(), value)
}

function desktopQaTarget(route: string) {
  const name = routeName(route)
  const configuredSelector = process.env.OPENCODE_DESKTOP_QA_SELECTOR
  return { name, selector: configuredSelector ?? `[data-page='${name}']` }
}

function routeName(route: string) {
  if (route === "/browser") return "browser-surface"
  return route
    .split(/[?#]/, 1)[0]
    .split("/")
    .filter(Boolean)
    .join("-")
    .replace(/[^a-zA-Z0-9-]/g, "-") || "browser-surface"
}
