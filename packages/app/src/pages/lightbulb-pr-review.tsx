import { Button } from "@opencode-ai/ui/button"
import { Icon } from "@opencode-ai/ui/icon"
import { Spinner } from "@opencode-ai/ui/spinner"
import { useQuery } from "@tanstack/solid-query"
import { createMemo, For, Show } from "solid-js"
import { useServerSDK } from "@/context/server-sdk"
import {
  blockedReason,
  currentStopLabel,
  formatStatus,
  formatTimestamp,
  formatWakeSource,
  latestEvidenceSummary,
  routeStats,
  type PRReviewRoute,
} from "./lightbulb-pr-review-data"

export default function LightbulbPRReviewPage() {
  const serverSDK = useServerSDK()
  const query = useQuery(() => ({
    queryKey: [serverSDK().scope, "lightbulb-pr-review-routes"] as const,
    queryFn: () => serverSDK().client.lightbulb.prReviewRoutes.list().then((response) => response.data ?? { routes: [] }),
    refetchInterval: 5_000,
  }))
  const routes = createMemo(() => query.data?.routes ?? [])
  const stats = createMemo(() => routeStats(routes()))

  return (
    <main
      data-page="lightbulb-pr-review"
      class="flex-1 min-h-0 min-w-0 overflow-y-auto bg-background-base text-text-base"
    >
      <div class="mx-auto flex w-full max-w-6xl flex-col gap-6 px-5 py-6 md:px-8">
        <header class="flex flex-col gap-4 border-b border-border-weak-base pb-5 md:flex-row md:items-end md:justify-between">
          <div class="flex min-w-0 flex-col gap-2">
            <div class="flex items-center gap-2 text-12-medium uppercase text-text-weak">
              <Icon name="review" size="small" />
              <span>Lightbulb</span>
            </div>
            <h1 class="text-24-bold text-text-strong">PR Review Routes</h1>
            <div class="text-13-regular text-text-base truncate">Read-only route monitor</div>
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
          <section class="grid gap-3 md:grid-cols-4">
            <StatusTile label="Routes" value={String(routes().length)} />
            <StatusTile label="Active" value={String(stats().active)} />
            <StatusTile label="Blocked" value={String(stats().blocked)} />
            <StatusTile label="Merge Ready" value={String(stats().mergeReady)} />
          </section>

          <Show
            when={routes().length > 0}
            fallback={
              <div class="rounded-md border border-border-weak-base bg-background-strong p-5 text-14-regular text-text-base">
                No active PR-review routes.
              </div>
            }
          >
            <section class="flex flex-col gap-3">
              <div class="flex items-center justify-between gap-3">
                <h2 class="text-16-medium text-text-strong">Active Route Queue</h2>
                <span class="text-12-regular text-text-weak">{routes().length} monitored</span>
              </div>
              <For each={routes()}>{(route) => <RouteCard route={route} />}</For>
            </section>
          </Show>

          <Show when={query.isError}>
            <div class="rounded-md border border-border-warning-base bg-surface-warning-base p-4 text-13-regular text-text-warning-base">
              Lightbulb route status could not be loaded.
            </div>
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

function RouteCard(props: { route: PRReviewRoute }) {
  return (
    <article class="rounded-md border border-border-weak-base bg-background-strong p-4">
      <div class="flex flex-col gap-4">
        <div class="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div class="flex min-w-0 flex-col gap-2">
            <div class="flex flex-wrap items-center gap-2">
              <StatusBadge status={props.route.status} />
              <span class="rounded-sm bg-surface-base px-2 py-0.5 text-12-medium text-text-base">
                {props.route.repository}#{String(props.route.pullNumber)}
              </span>
              <Show when={props.route.mergeReady}>
                <span class="rounded-sm bg-surface-success-base px-2 py-0.5 text-12-medium text-text-success-base">
                  Merge ready
                </span>
              </Show>
            </div>
            <h2 class="truncate text-16-medium text-text-strong">{props.route.title}</h2>
            <div class="truncate text-12-regular text-text-weak">{props.route.url}</div>
          </div>
          <div class="grid gap-2 text-left md:min-w-56 md:text-right">
            <MetaLine label="Next wake" value={formatWakeSource(props.route.nextWakeSource)} />
            <MetaLine label="Last wake" value={formatTimestamp(props.route.lastWokeAt)} />
          </div>
        </div>

        <div class="grid gap-3 lg:grid-cols-2">
          <SummaryBlock label="Current stop" value={currentStopLabel(props.route)} />
          <SummaryBlock label="Blocked reason" value={blockedReason(props.route)} />
          <SummaryBlock label="Latest evidence" value={latestEvidenceSummary(props.route)} />
          <SummaryBlock label="Active worker" value={workerLabel(props.route)} />
        </div>
      </div>
    </article>
  )
}

function StatusBadge(props: { status: PRReviewRoute["status"] }) {
  const variant = createMemo(() => {
    if (props.status === "blocked") return "border-border-warning-base bg-surface-warning-base text-text-warning-base"
    if (props.status === "complete") return "border-border-success-base bg-surface-success-base text-text-success-base"
    return "border-border-weak-base bg-surface-base text-text-base"
  })
  return <span class={`rounded-sm border px-2 py-0.5 text-12-medium ${variant()}`}>{formatStatus(props.status)}</span>
}

function MetaLine(props: { label: string; value: string }) {
  return (
    <div class="min-w-0 text-12-regular">
      <span class="text-text-weak">{props.label}</span>
      <span class="mx-1 text-text-weak">/</span>
      <span class="text-text-base">{props.value}</span>
    </div>
  )
}

function SummaryBlock(props: { label: string; value: string }) {
  return (
    <div class="min-w-0 border-l border-border-weak-base pl-3">
      <div class="mb-1 text-12-regular text-text-weak">{props.label}</div>
      <div class="text-13-regular text-text-base">{props.value}</div>
    </div>
  )
}

function workerLabel(route: PRReviewRoute) {
  if (!route.activeWorker) return "None"
  return `${route.activeWorker.id} · ${route.activeWorker.role} · ${formatStatus(route.activeWorker.status)} · ${route.activeWorker.summary}`
}
