import { Lightbulb } from "@opencode-ai/core/lightbulb"
import { NonNegativeInt } from "@opencode-ai/core/schema"
import { Schema } from "effect"
import { HttpApi, HttpApiEndpoint, HttpApiGroup, OpenApi } from "effect/unstable/httpapi"
import { Authorization } from "../middleware/authorization"
import { described } from "./metadata"

const root = "/lightbulb"

const PRReviewRouteWakeSource = Schema.Literals([
  "worker_report",
  "review_evidence",
  "ci_evidence",
  "schedule_tick",
  "human_steering",
])
const RouteStopKind = Schema.Literals([
  "discovery",
  "implementation",
  "debug",
  "review",
  "integration",
  "verification",
  "decision",
  "cleanup",
])
const RouteStopStatus = Schema.Literals(["pending", "active", "complete", "blocked", "skipped"])
const WorkerStatus = Schema.Literals(["queued", "running", "blocked", "complete", "failed"])
const PRReviewRouteStatus = Schema.Literals(["active", "blocked", "complete", "held"])

const PRReviewRouteCurrentStop = Schema.Struct({
  id: Lightbulb.RouteStopID,
  kind: RouteStopKind,
  title: Schema.String,
  status: RouteStopStatus,
}).annotate({ identifier: "LightbulbPRReviewRouteCurrentStop" })

const PRReviewRouteEvidence = Schema.Struct({
  observedAt: NonNegativeInt,
  source: PRReviewRouteWakeSource,
  summary: Schema.String,
  artifactID: Schema.optional(Lightbulb.ArtifactID),
  status: Schema.optional(Schema.String),
  data: Schema.optional(Schema.Record(Schema.String, Schema.Unknown)),
}).annotate({ identifier: "LightbulbPRReviewRouteEvidence" })

const PRReviewRouteWorkerHandle = Schema.Struct({
  id: Lightbulb.WorkerID,
  role: Schema.String,
  status: WorkerStatus,
  summary: Schema.String,
}).annotate({ identifier: "LightbulbPRReviewRouteWorkerHandle" })

const PRReviewRouteSummary = Schema.Struct({
  id: Lightbulb.RouteID,
  goalID: Lightbulb.GoalID,
  candidateID: Lightbulb.PRReviewCandidateID,
  repository: Schema.String,
  pullNumber: NonNegativeInt,
  title: Schema.String,
  url: Schema.String,
  status: PRReviewRouteStatus,
  currentStop: Schema.optional(PRReviewRouteCurrentStop),
  latestEvidence: Schema.optional(PRReviewRouteEvidence),
  activeWorker: Schema.optional(PRReviewRouteWorkerHandle),
  blockedReason: Schema.optional(Schema.String),
  nextWakeSource: Schema.optional(PRReviewRouteWakeSource),
  mergeReady: Schema.Boolean,
  lastWokeAt: Schema.optional(NonNegativeInt),
}).annotate({ identifier: "LightbulbPRReviewRouteSummary" })

export const PRReviewRoutesResponse = Schema.Struct({
  routes: Schema.Array(PRReviewRouteSummary),
}).annotate({ identifier: "LightbulbPRReviewRoutesResponse" })

export const LightbulbPaths = {
  prReviewRoutes: `${root}/pr-review/routes`,
} as const

export const LightbulbApi = HttpApi.make("lightbulb")
  .add(
    HttpApiGroup.make("lightbulb")
      .add(
        HttpApiEndpoint.get("prReviewRoutes", LightbulbPaths.prReviewRoutes, {
          success: described(PRReviewRoutesResponse, "Active PR review routes"),
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "lightbulb.prReviewRoutes.list",
            summary: "List active PR review routes",
            description: "Read the active Lightbulb PR-review route summaries without mutating route or GitHub state.",
          }),
        ),
      )
      .annotateMerge(
        OpenApi.annotations({
          title: "lightbulb",
          description: "Read-only Lightbulb operator routes.",
        }),
      )
      .middleware(Authorization),
  )
  .annotateMerge(
    OpenApi.annotations({
      title: "opencode experimental HttpApi",
      version: "0.0.1",
      description: "Experimental HttpApi surface for selected instance routes.",
    }),
  )
