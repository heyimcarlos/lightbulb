import { Lightbulb } from "@opencode-ai/core/lightbulb"
import { Effect } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { InstanceHttpApi } from "../api"

export const lightbulbHandlers = HttpApiBuilder.group(InstanceHttpApi, "lightbulb", (handlers) =>
  Effect.gen(function* () {
    const lightbulb = yield* Lightbulb.Service

    const prReviewRoutes = Effect.fn("LightbulbHttpApi.prReviewRoutes")(function* () {
      return {
        routes: (yield* lightbulb.readActivePRReviewRoutes()).map(toPRReviewRouteResponse),
      }
    })

    return handlers.handle("prReviewRoutes", prReviewRoutes)
  }),
)

function toPRReviewRouteResponse(route: Lightbulb.PRReviewRouteSummary) {
  return {
    ...route,
    currentStop: route.currentStop ?? undefined,
    latestEvidence: route.latestEvidence ?? undefined,
    activeWorker: route.activeWorker ?? undefined,
    blockedReason: route.blockedReason ?? undefined,
    nextWakeSource: route.nextWakeSource ?? undefined,
    lastWokeAt: route.lastWokeAt ?? undefined,
  }
}
