import { Button } from "@opencode-ai/ui/button"
import { Icon } from "@opencode-ai/ui/icon"
import { Spinner } from "@opencode-ai/ui/spinner"
import { useQuery } from "@tanstack/solid-query"
import { createMemo, Show, type JSX } from "solid-js"
import type { LightbulbStableDashboardSnapshot } from "@opencode-ai/sdk/v2/client"
import { useServerSDK } from "@/context/server-sdk"

type StableSnapshot = LightbulbStableDashboardSnapshot

export default function LightbulbDashboardPage() {
  const serverSDK = useServerSDK()
  const query = useQuery(() => ({
    queryKey: [serverSDK().scope, "lightbulb-stable-dashboard"] as const,
    queryFn: () =>
      serverSDK()
        .client.lightbulb.stableDashboard.get()
        .then((response) => response.data ?? {}),
    refetchInterval: 5_000,
  }))
  const snapshot = createMemo(() => query.data?.snapshot)

  return (
    <main
      data-page="lightbulb-dashboard"
      class="flex-1 min-h-0 min-w-0 overflow-y-auto bg-background-base text-text-base"
    >
      <div class="mx-auto flex w-full max-w-6xl flex-col gap-6 px-5 py-6 md:px-8">
        <header class="flex flex-col gap-4 border-b border-border-weak-base pb-5 md:flex-row md:items-end md:justify-between">
          <div class="flex min-w-0 flex-col gap-2">
            <div class="flex items-center gap-2 text-12-medium uppercase text-text-weak">
              <Icon name="review" size="small" />
              <span>Lightbulb</span>
            </div>
            <h1 class="text-24-bold text-text-strong">Stable Loop v0</h1>
            <div class="truncate text-13-regular text-text-base">
              <Show when={snapshot()} fallback="No account loaded">
                {(value) => `${value().account.name} · ${value().account.id}`}
              </Show>
            </div>
          </div>
          <Button
            size="large"
            variant="secondary"
            icon="reset"
            class="self-start md:self-auto"
            disabled={query.isFetching}
            onClick={() => void query.refetch()}
          >
            Refresh
          </Button>
        </header>

        <Show
          when={!query.isLoading}
          fallback={
            <div class="flex min-h-80 items-center justify-center">
              <Spinner class="size-5" />
            </div>
          }
        >
          <Show
            when={snapshot()}
            fallback={
              <div class="rounded-md border border-border-weak-base bg-background-strong p-5 text-14-regular text-text-base">
                No Lightbulb dashboard state found.
              </div>
            }
          >
            {(value) => <StableDashboard snapshot={value()} />}
          </Show>

          <Show when={query.isError}>
            <div class="rounded-md border border-border-warning-base bg-surface-warning-base p-4 text-13-regular text-text-warning-base">
              Lightbulb stable loop state could not be loaded.
            </div>
          </Show>
        </Show>
      </div>
    </main>
  )
}

function StableDashboard(props: { snapshot: StableSnapshot }) {
  return (
    <>
      <section class="grid gap-3 md:grid-cols-4">
        <StatusTile label="Goal" value={formatStatus(props.snapshot.currentRoute.goalStatus)} />
        <StatusTile label="Run" value={formatStatus(props.snapshot.currentRoute.runStatus)} />
        <StatusTile label="Gate" value={formatStatus(props.snapshot.reviewGate?.status)} />
        <StatusTile label="Next wake" value={formatSource(props.snapshot.nextWakeSource)} />
      </section>

      <section class="grid gap-4 md:grid-cols-[minmax(0,1.2fr)_minmax(280px,0.8fr)]">
        <div class="flex min-w-0 flex-col gap-4">
          <Panel title="Current Route">
            <div class="flex min-w-0 flex-col gap-4">
              <div class="flex flex-wrap items-center gap-2">
                <StatusBadge status={props.snapshot.currentRoute.goalStatus} />
                <Show when={props.snapshot.currentRoute.loopKind}>
                  {(kind) => (
                    <span class="rounded-sm bg-surface-base px-2 py-0.5 text-12-medium text-text-base">{kind()}</span>
                  )}
                </Show>
              </div>
              <div class="min-w-0">
                <h2 class="truncate text-16-medium text-text-strong">{props.snapshot.destination}</h2>
                <div class="mt-1 text-13-regular text-text-base">{props.snapshot.currentRoute.currentStop}</div>
              </div>
              <div class="grid gap-2 md:grid-cols-2">
                <MetaLine
                  label="Goal"
                  value={idLabel(props.snapshot.currentRoute.goalID, props.snapshot.currentRoute.goalTitle)}
                />
                <MetaLine
                  label="Loop"
                  value={idLabel(props.snapshot.currentRoute.loopID, props.snapshot.currentRoute.loopStatus)}
                />
                <MetaLine
                  label="Run"
                  value={idLabel(props.snapshot.currentRoute.runID, props.snapshot.currentRoute.runStatus)}
                />
                <MetaLine label="Blocked" value={props.snapshot.blockedReason} />
              </div>
              <div class="text-13-regular text-text-base">{props.snapshot.currentRoute.summary}</div>
            </div>
          </Panel>

          <Panel title="Active Worker">
            <Show when={props.snapshot.activeWorker} fallback={<EmptyLine value="No worker attached" />}>
              {(worker) => (
                <div class="flex min-w-0 flex-col gap-3">
                  <div class="flex flex-wrap items-center gap-2">
                    <StatusBadge status={worker().status} />
                    <span class="rounded-sm bg-surface-base px-2 py-0.5 text-12-medium text-text-base">
                      {worker().role}
                    </span>
                  </div>
                  <MetaLine label="Worker" value={worker().id} />
                  <div class="text-13-regular text-text-base">{worker().summary}</div>
                  <Show when={worker().latestLaunchAttempt}>
                    {(attempt) => (
                      <div class="grid gap-2 border-l border-border-weak-base pl-3">
                        <MetaLine label="Launch" value={`${attempt().id} · ${formatStatus(attempt().status)}`} />
                        <MetaLine label="Command" value={attempt().command ?? "Not recorded"} />
                        <MetaLine label="Worktree" value={attempt().worktreeID ?? attempt().cwd ?? "Not recorded"} />
                        <MetaLine label="Report" value={attempt().reportURI ?? "Not recorded"} />
                      </div>
                    )}
                  </Show>
                </div>
              )}
            </Show>
          </Panel>

          <Panel title="Latest Evidence">
            <Show
              when={props.snapshot.latestReportArtifact}
              fallback={<EmptyLine value="No report artifact recorded" />}
            >
              {(artifact) => (
                <div class="grid gap-2">
                  <div class="flex flex-wrap items-center gap-2">
                    <StatusBadge status={artifact().status} />
                    <span class="rounded-sm bg-surface-base px-2 py-0.5 text-12-medium text-text-base">
                      {artifact().type}
                    </span>
                  </div>
                  <MetaLine label="Artifact" value={artifact().id} />
                  <MetaLine label="URI" value={artifact().uri} />
                  <div class="text-13-regular text-text-base">{artifact().summary}</div>
                </div>
              )}
            </Show>
          </Panel>
        </div>

        <aside class="flex min-w-0 flex-col gap-4">
          <Panel title="Pickup Packet">
            <Show when={props.snapshot.pickupPacket} fallback={<EmptyLine value="No pickup packet selected" />}>
              {(packet) => (
                <div class="grid gap-2">
                  <StatusBadge status={packet().status} />
                  <Show when={props.snapshot.selectedIssue}>
                    {(issue) => (
                      <>
                        <MetaLine label="Issue" value={`${issue().sourceID} · ${issue().title}`} />
                        <MetaLine label="Action" value={formatStatus(issue().suggestedAction)} />
                      </>
                    )}
                  </Show>
                  <MetaLine label="Packet" value={packet().id} />
                  <MetaLine label="Worker" value={packet().workerID} />
                  <div class="text-13-regular text-text-base">{packet().title}</div>
                </div>
              )}
            </Show>
          </Panel>

          <Panel title="Review Gate">
            <Show when={props.snapshot.reviewGate} fallback={<EmptyLine value="No gate waiting" />}>
              {(gate) => (
                <div class="grid gap-2">
                  <div class="flex flex-wrap items-center gap-2">
                    <StatusBadge status={gate().status} />
                    <span class="rounded-sm bg-surface-base px-2 py-0.5 text-12-medium text-text-base">
                      {gate().kind}
                    </span>
                  </div>
                  <MetaLine label="Gate" value={gate().id} />
                  <MetaLine label="Artifact" value={gate().artifactID ?? "Not recorded"} />
                  <div class="text-13-regular text-text-base">{gate().summary}</div>
                </div>
              )}
            </Show>
          </Panel>

          <Panel title="Runner Tick">
            <Show when={props.snapshot.runnerTick} fallback={<EmptyLine value="No scheduler tick recorded" />}>
              {(tick) => (
                <div class="grid gap-2">
                  <MetaLine label="Tick" value={tick().id} />
                  <MetaLine label="Trigger" value={tick().trigger} />
                  <MetaLine label="Admitted" value={String(tick().admittedCount)} />
                  <MetaLine label="Skipped" value={String(tick().skippedCount)} />
                  <MetaLine label="Observed" value={formatTimestamp(tick().timeCreated)} />
                </div>
              )}
            </Show>
          </Panel>

          <Panel title="Human Action">
            <div class="grid gap-2">
              <MetaLine label="Ready" value={props.snapshot.readyHumanAction} />
              <MetaLine label="Wake" value={formatSource(props.snapshot.nextWakeSource)} />
              <MetaLine label="Blocked" value={props.snapshot.blockedReason} />
            </div>
          </Panel>
        </aside>
      </section>
    </>
  )
}

function StatusTile(props: { label: string; value: string }) {
  return (
    <div class="rounded-md border border-border-weak-base bg-background-strong p-4">
      <div class="text-12-regular text-text-weak">{props.label}</div>
      <div class="mt-2 truncate text-18-medium text-text-strong">{props.value}</div>
    </div>
  )
}

function Panel(props: { title: string; children: JSX.Element }) {
  return (
    <section class="rounded-md border border-border-weak-base bg-background-strong p-4">
      <h2 class="mb-3 text-14-medium text-text-strong">{props.title}</h2>
      {props.children}
    </section>
  )
}

function MetaLine(props: { label: string; value: string }) {
  return (
    <div class="min-w-0 text-12-regular">
      <span class="text-text-weak">{props.label}</span>
      <span class="mx-1 text-text-weak">/</span>
      <span class="break-words text-text-base">{props.value}</span>
    </div>
  )
}

function EmptyLine(props: { value: string }) {
  return <div class="text-13-regular text-text-base">{props.value}</div>
}

function StatusBadge(props: { status: string | undefined }) {
  const status = createMemo(() => props.status ?? "unknown")
  return (
    <span
      class="rounded-sm px-2 py-0.5 text-12-medium"
      classList={{
        "bg-surface-success-base text-text-success-base": ["active", "complete", "passed", "registered"].includes(
          status(),
        ),
        "bg-surface-info-base text-text-info-base": ["queued", "running", "claimed"].includes(status()),
        "bg-surface-warning-base text-text-warning-base": ["pending", "blocked", "held"].includes(status()),
        "bg-surface-critical-base text-text-critical-base": ["failed", "cancelled", "stopped"].includes(status()),
        "bg-surface-base text-text-base": ![
          "active",
          "complete",
          "passed",
          "registered",
          "queued",
          "running",
          "claimed",
          "pending",
          "blocked",
          "held",
          "failed",
          "cancelled",
          "stopped",
        ].includes(status()),
      }}
    >
      {formatStatus(status())}
    </span>
  )
}

function idLabel(id: string | undefined, label: string | undefined) {
  if (!id) return label ?? "Not recorded"
  if (!label) return id
  return `${id} · ${formatStatus(label)}`
}

function formatStatus(status: string | undefined) {
  if (!status) return "Unknown"
  return status.split("_").map(formatWord).join(" ")
}

function formatSource(source: string) {
  return source.split(/[:_]/).map(formatWord).join(" ")
}

function formatTimestamp(value: number | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "Not recorded"
  return new Date(value).toLocaleString()
}

function formatWord(value: string) {
  if (value === "v0") return "v0"
  if (value === "ci") return "CI"
  if (value === "pr") return "PR"
  return value.slice(0, 1).toUpperCase() + value.slice(1)
}
