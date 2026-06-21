import { Button } from "@opencode-ai/ui/button"
import { Icon } from "@opencode-ai/ui/icon"
import { Spinner } from "@opencode-ai/ui/spinner"
import { base64Encode } from "@opencode-ai/core/util/encode"
import { useParams } from "@solidjs/router"
import { useQuery } from "@tanstack/solid-query"
import { createMemo, For, Match, Show, Switch } from "solid-js"
import { useServer } from "@/context/server"
import { useServerSDK } from "@/context/server-sdk"
import { decode64 } from "@/utils/base64"
import {
  BROWSER_ACTIONS,
  browserProviderSummaries,
  loadBrowserSurface,
  type BrowserActivity,
  type BrowserEvidence,
  type BrowserProvider,
  type BrowserSessionSummary,
} from "./browser-data"

export default function BrowserPage() {
  const params = useParams()
  const server = useServer()
  const serverSDK = useServerSDK()
  const directory = createMemo(() => (params.dir ? decode64(params.dir) : undefined))
  const surface = useQuery(() => ({
    queryKey: [serverSDK().scope, "browser-surface", directory()] as const,
    queryFn: () => loadBrowserSurface({ client: serverSDK().client, directory: directory() }),
    refetchInterval: 5_000,
  }))
  const data = createMemo(() => surface.data)
  const providerSummaries = createMemo(() => browserProviderSummaries(data()?.activities ?? []))
  const liveViewCount = createMemo(() =>
    (data()?.activities ?? []).reduce(
      (total, activity) =>
        total +
        activity.evidence.filter(
          (evidence) => evidence.kind === "live_view" || evidence.kind === "interactive_live_view",
        ).length,
      0,
    ),
  )
  const artifactCount = createMemo(() =>
    (data()?.activities ?? []).reduce(
      (total, activity) =>
        total +
        activity.evidence.filter((evidence) => evidence.kind === "artifact_path" || evidence.kind === "attachment")
          .length,
      0,
    ),
  )

  return (
    <main
      data-page="browser-surface"
      class="flex-1 min-h-0 min-w-0 overflow-y-auto bg-background-base text-text-base"
    >
      <div class="mx-auto flex w-full max-w-6xl flex-col gap-6 px-5 py-6 md:px-8">
        <header class="flex flex-col gap-4 border-b border-border-weak-base pb-5 md:flex-row md:items-end md:justify-between">
          <div class="flex min-w-0 flex-col gap-2">
            <div class="flex items-center gap-2 text-12-medium uppercase text-text-weak">
              <Icon name="window-cursor" size="small" />
              <span>Computer Use</span>
            </div>
            <h1 class="text-24-bold text-text-strong">Browser</h1>
            <div class="text-13-regular text-text-base truncate">
              <Show when={directory()} fallback={server.name || server.key}>
                {(dir) => dir()}
              </Show>
            </div>
          </div>
          <Button
            size="large"
            variant="secondary"
            icon="reset"
            class="self-start md:self-auto"
            disabled={surface.isFetching}
            onClick={() => void surface.refetch()}
          >
            Refresh
          </Button>
        </header>

        <Show
          when={!surface.isLoading}
          fallback={
            <div class="flex min-h-80 items-center justify-center">
              <Spinner class="size-5" />
            </div>
          }
        >
          <Show
            when={data()}
            fallback={
              <div class="rounded-md border border-border-weak-base bg-background-strong p-5 text-14-regular text-text-base">
                Browser surface unavailable.
              </div>
            }
          >
            {(surfaceData) => (
              <>
                <section class="grid gap-3 md:grid-cols-4">
                  <StatusTile label="Tool" value={surfaceData().toolAvailable ? "Available" : "Unavailable"} />
                  <StatusTile label="Active sessions" value={String(surfaceData().activeSessions.length)} />
                  <StatusTile label="Live views" value={String(liveViewCount())} />
                  <StatusTile label="Artifacts" value={String(artifactCount())} />
                </section>

                <section class="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
                  <div class="flex min-w-0 flex-col gap-4">
                    <div class="flex items-center justify-between gap-3">
                      <h2 class="text-16-medium text-text-strong">Browser Activity</h2>
                      <span class="text-12-regular text-text-weak">{surfaceData().activities.length} recent</span>
                    </div>
                    <Show
                      when={surfaceData().activities.length > 0}
                      fallback={
                        <div class="rounded-md border border-border-weak-base bg-background-strong p-5 text-14-regular text-text-base">
                          No browser activity found in recent sessions.
                        </div>
                      }
                    >
                      <div class="flex flex-col gap-3">
                        <For each={surfaceData().activities}>
                          {(activity) => <BrowserActivityRow activity={activity} />}
                        </For>
                      </div>
                    </Show>
                  </div>

                  <aside class="flex min-w-0 flex-col gap-4">
                    <Panel title="Actions">
                      <div class="flex flex-wrap gap-2">
                        <For each={BROWSER_ACTIONS}>
                          {(action) => (
                            <span class="rounded-sm border border-border-weak-base bg-background-base px-2 py-1 text-12-medium text-text-base">
                              {action}
                            </span>
                          )}
                        </For>
                      </div>
                    </Panel>

                    <Panel title="Providers">
                      <div class="flex flex-col gap-2">
                        <For each={providerSummaries()}>
                          {(summary) => (
                            <ProviderRow
                              provider={summary.provider}
                              activityCount={summary.activityCount}
                              evidenceCount={summary.evidenceCount}
                              liveViewCount={summary.liveViewCount}
                            />
                          )}
                        </For>
                      </div>
                    </Panel>

                    <Panel title="Session Status">
                      <Show
                        when={surfaceData().activeSessions.length > 0}
                        fallback={<div class="text-13-regular text-text-base">Idle</div>}
                      >
                        <div class="flex flex-col gap-2">
                          <For each={surfaceData().activeSessions}>
                            {(session) => <SessionStatusRow session={session} />}
                          </For>
                        </div>
                      </Show>
                    </Panel>
                  </aside>
                </section>

                <Show when={surfaceData().failures.length > 0}>
                  <div class="rounded-md border border-border-warning-base bg-surface-warning-base p-4 text-13-regular text-text-warning-base">
                    Some browser session evidence could not be loaded.
                  </div>
                </Show>
              </>
            )}
          </Show>
        </Show>
      </div>
    </main>
  )
}

function StatusTile(props: { label: string; value: string }) {
  return (
    <div class="rounded-md border border-border-weak-base bg-background-strong p-4">
      <div class="text-12-regular text-text-weak">{props.label}</div>
      <div class="mt-2 text-18-medium text-text-strong">{props.value}</div>
    </div>
  )
}

function Panel(props: { title: string; children: import("solid-js").JSX.Element }) {
  return (
    <section class="rounded-md border border-border-weak-base bg-background-strong p-4">
      <h2 class="mb-3 text-14-medium text-text-strong">{props.title}</h2>
      {props.children}
    </section>
  )
}

function BrowserActivityRow(props: { activity: BrowserActivity }) {
  const href = createMemo(() =>
    props.activity.sessionDirectory
      ? `/${base64Encode(props.activity.sessionDirectory)}/session/${props.activity.sessionID}`
      : undefined,
  )

  return (
    <article class="rounded-md border border-border-weak-base bg-background-strong p-4">
      <div class="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div class="flex min-w-0 flex-col gap-2">
          <div class="flex flex-wrap items-center gap-2">
            <ProviderBadge provider={props.activity.provider} />
            <StatusBadge status={props.activity.status} />
            <span class="rounded-sm bg-surface-base px-2 py-0.5 text-12-medium text-text-base">
              {props.activity.action}
            </span>
          </div>
          <div class="min-w-0">
            <a
              href={href()}
              class="text-14-medium text-text-strong hover:text-text-interactive-base truncate"
              onClick={(event) => {
                if (href()) return
                event.preventDefault()
              }}
            >
              {props.activity.sessionTitle}
            </a>
            <div class="mt-1 text-12-regular text-text-weak truncate">{props.activity.sessionDirectory}</div>
          </div>
          <Show when={props.activity.url}>
            {(url) => <div class="text-12-regular text-text-base truncate">{url()}</div>}
          </Show>
          <Show when={props.activity.browserSessionID || props.activity.sessionName}>
            <div class="flex flex-wrap gap-2 text-12-regular text-text-weak">
              <Show when={props.activity.browserSessionID}>
                {(sessionID) => <span>session {sessionID()}</span>}
              </Show>
              <Show when={props.activity.sessionName}>
                {(sessionName) => <span>name {sessionName()}</span>}
              </Show>
            </div>
          </Show>
        </div>
        <Show when={props.activity.time}>
          {(time) => <time class="text-12-regular text-text-weak">{new Date(time()).toLocaleString()}</time>}
        </Show>
      </div>

      <Show when={props.activity.evidence.length > 0}>
        <div class="mt-4 grid gap-2 md:grid-cols-2">
          <For each={props.activity.evidence}>{(evidence) => <EvidenceItem evidence={evidence} />}</For>
        </div>
      </Show>

      <Show when={props.activity.error}>
        {(error) => (
          <pre class="mt-4 max-h-36 overflow-auto rounded-sm bg-background-base p-3 text-12-regular text-text-critical-base">
            {error()}
          </pre>
        )}
      </Show>
    </article>
  )
}

function EvidenceItem(props: { evidence: BrowserEvidence }) {
  const remote = createMemo(() => /^https?:\/\//.test(props.evidence.value))

  return (
    <div class="min-w-0 rounded-sm border border-border-weaker-base bg-background-base p-3">
      <div class="mb-1 text-12-medium text-text-weak">{props.evidence.label}</div>
      <Show
        when={remote()}
        fallback={<code class="block truncate text-12-regular text-text-base">{props.evidence.value}</code>}
      >
        <a
          href={props.evidence.value}
          target="_blank"
          rel="noopener noreferrer"
          class="flex min-w-0 items-center gap-1 text-12-regular text-text-interactive-base hover:underline"
        >
          <span class="truncate">{props.evidence.value}</span>
          <Icon name="square-arrow-top-right" size="small" />
        </a>
      </Show>
    </div>
  )
}

function ProviderRow(props: {
  provider: Exclude<BrowserProvider, "unknown">
  activityCount: number
  evidenceCount: number
  liveViewCount: number
}) {
  return (
    <div class="flex items-center justify-between gap-3 rounded-sm bg-background-base px-3 py-2">
      <div class="flex min-w-0 items-center gap-2">
        <ProviderBadge provider={props.provider} />
        <span class="text-13-regular text-text-base">{providerLabel(props.provider)}</span>
      </div>
      <div class="shrink-0 text-12-regular text-text-weak">
        {props.activityCount} runs · {props.evidenceCount} evidence · {props.liveViewCount} live
      </div>
    </div>
  )
}

function SessionStatusRow(props: { session: BrowserSessionSummary }) {
  return (
    <a
      href={`/${base64Encode(props.session.directory)}/session/${props.session.id}`}
      class="flex min-w-0 items-center justify-between gap-3 rounded-sm bg-background-base px-3 py-2 hover:bg-surface-raised-base-hover"
    >
      <span class="min-w-0 truncate text-13-regular text-text-base">{props.session.title}</span>
      <StatusBadge status={props.session.status} />
    </a>
  )
}

function ProviderBadge(props: { provider: BrowserProvider }) {
  return (
    <span
      class="rounded-sm px-2 py-0.5 text-12-medium"
      classList={{
        "bg-surface-info-base text-text-info-base": props.provider === "firecrawl",
        "bg-surface-warning-base text-text-warning-base": props.provider === "steel",
        "bg-surface-base text-text-base": props.provider === "local" || props.provider === "unknown",
      }}
    >
      {providerLabel(props.provider)}
    </span>
  )
}

function StatusBadge(props: { status: BrowserActivity["status"] | BrowserSessionSummary["status"] }) {
  return (
    <span
      class="rounded-sm px-2 py-0.5 text-12-medium"
      classList={{
        "bg-surface-success-base text-text-success-base": props.status === "completed",
        "bg-surface-info-base text-text-info-base": props.status === "running" || props.status === "busy",
        "bg-surface-warning-base text-text-warning-base": props.status === "pending" || props.status === "retry",
        "bg-surface-critical-base text-text-critical-base": props.status === "error",
        "bg-surface-base text-text-base": props.status === "idle",
      }}
    >
      <Switch fallback={props.status}>
        <Match when={props.status === "busy"}>busy</Match>
        <Match when={props.status === "retry"}>retry</Match>
      </Switch>
    </span>
  )
}

function providerLabel(provider: BrowserProvider) {
  if (provider === "firecrawl") return "Firecrawl"
  if (provider === "steel") return "Steel"
  if (provider === "local") return "Local"
  return "Unknown"
}
