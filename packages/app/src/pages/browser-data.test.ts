import { describe, expect, test } from "bun:test"
import type { Session, ToolPart } from "@opencode-ai/sdk/v2/client"
import { browserActivitiesFromMessages } from "./browser-data"

const session: Session = {
  id: "ses_browser",
  slug: "browser",
  projectID: "proj",
  directory: "/workspace/app",
  title: "Browser run",
  version: "1.0.0",
  time: {
    created: 1,
    updated: 2,
  },
}

describe("browser surface data", () => {
  test("extracts remote live-view evidence from browser tool output", () => {
    const part: ToolPart = {
      id: "part_browser",
      sessionID: session.id,
      messageID: "msg_assistant",
      type: "tool",
      callID: "call_browser",
      tool: "browser",
      state: {
        status: "completed",
        input: { provider: "firecrawl", action: "start" },
        output:
          "Firecrawl browser session created.\nLive view: https://liveview.firecrawl.dev/fc-session\nInteractive live view: https://liveview.firecrawl.dev/fc-session?interactive=true\nCDP: wss://browser.firecrawl.dev/cdp/fc-session",
        title: "browser",
        metadata: {},
        time: { start: 10, end: 20 },
      },
    }

    expect(browserActivitiesFromMessages(session, [{ info: { id: "msg_assistant", sessionID: session.id }, parts: [part] }])).toEqual([
      expect.objectContaining({
        provider: "firecrawl",
        action: "start",
        evidence: [
          { kind: "live_view", label: "Live view", value: "https://liveview.firecrawl.dev/fc-session" },
          {
            kind: "interactive_live_view",
            label: "Interactive live view",
            value: "https://liveview.firecrawl.dev/fc-session?interactive=true",
          },
          { kind: "cdp", label: "CDP", value: "wss://browser.firecrawl.dev/cdp/fc-session" },
        ],
      }),
    ])
  })

  test("shows local screenshots as artifact paths without live-view evidence", () => {
    const part: ToolPart = {
      id: "part_local_browser",
      sessionID: session.id,
      messageID: "msg_assistant",
      type: "tool",
      callID: "call_local_browser",
      tool: "browser",
      state: {
        status: "completed",
        input: { action: "screenshot", path: ".lightbulb/browser-runs/local/artifacts/screenshots/1.png" },
        output:
          "agent-browser:screenshot .lightbulb/browser-runs/local/artifacts/screenshots/1.png\nArtifact: .lightbulb/browser-runs/local/artifacts/screenshots/1.png",
        title: "browser",
        metadata: {},
        time: { start: 10, end: 20 },
      },
    }

    const activity = browserActivitiesFromMessages(session, [
      { info: { id: "msg_assistant", sessionID: session.id }, parts: [part] },
    ])[0]

    expect(activity?.provider).toBe("local")
    expect(activity?.evidence).toEqual([
      {
        kind: "artifact_path",
        label: "Artifact path",
        value: ".lightbulb/browser-runs/local/artifacts/screenshots/1.png",
      },
    ])
  })

  test("ignores non-browser tool parts", () => {
    const part: ToolPart = {
      id: "part_shell",
      sessionID: session.id,
      messageID: "msg_assistant",
      type: "tool",
      callID: "call_shell",
      tool: "bash",
      state: {
        status: "completed",
        input: { command: "echo ok" },
        output: "ok",
        title: "bash",
        metadata: {},
        time: { start: 10, end: 20 },
      },
    }

    expect(browserActivitiesFromMessages(session, [{ info: { id: "msg_assistant", sessionID: session.id }, parts: [part] }])).toEqual([])
  })
})
