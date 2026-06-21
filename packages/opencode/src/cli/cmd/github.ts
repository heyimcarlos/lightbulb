import { cmd } from "./cmd"
import { effectCmd, fail } from "../effect-cmd"

export { extractResponseText, formatPromptTooLargeError, parseGitHubRemote } from "./github.shared"

export const GithubInstallCommand = effectCmd({
  command: "install",
  describe: "unsupported in Lightbulb",
  instance: false,
  handler: () =>
    fail(
      "The inherited OpenCode GitHub agent installer is disabled in Lightbulb until a Lightbulb-native GitHub Action, app, and trigger vocabulary exist.",
    ),
})

export const GithubRunCommand = effectCmd({
  command: "run",
  describe: "unsupported in Lightbulb",
  instance: false,
  handler: () =>
    fail(
      "The inherited OpenCode GitHub runner is disabled in Lightbulb until a Lightbulb-native GitHub Action, app, and trigger vocabulary exist.",
    ),
})

export const GithubCommand = cmd({
  command: "github",
  describe: "manage GitHub agent",
  builder: (yargs) => yargs.command(GithubInstallCommand).command(GithubRunCommand).demandCommand(),
  async handler() {},
})
