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

const StableDashboardAccount = Schema.Struct({
  id: Lightbulb.AccountID,
  name: Schema.String,
  status: Schema.String,
}).annotate({ identifier: "LightbulbStableDashboardAccount" })

const StableDashboardCurrentRoute = Schema.Struct({
  goalID: Schema.optional(Lightbulb.GoalID),
  goalTitle: Schema.String,
  goalStatus: Schema.String,
  loopID: Schema.optional(Lightbulb.LoopID),
  loopKind: Schema.optional(Schema.String),
  loopStatus: Schema.optional(Schema.String),
  runID: Schema.optional(Lightbulb.RunID),
  runStatus: Schema.optional(Schema.String),
  currentStop: Schema.String,
  summary: Schema.String,
}).annotate({ identifier: "LightbulbStableDashboardCurrentRoute" })

const StableDashboardPickupPacket = Schema.Struct({
  id: Lightbulb.TaskPacketID,
  workerID: Lightbulb.WorkerID,
  title: Schema.String,
  status: Schema.String,
}).annotate({ identifier: "LightbulbStableDashboardPickupPacket" })

const StableDashboardSelectedIssue = Schema.Struct({
  sourceID: Schema.String,
  title: Schema.String,
  url: Schema.String,
  status: Schema.String,
  suggestedAction: Schema.String,
}).annotate({ identifier: "LightbulbStableDashboardSelectedIssue" })

const StableDashboardLaunchAttempt = Schema.Struct({
  id: Lightbulb.WorkerLaunchAttemptID,
  status: Schema.String,
  summary: Schema.String,
  command: Schema.optional(Schema.String),
  cwd: Schema.optional(Schema.String),
  worktreeID: Schema.optional(Schema.String),
  reportURI: Schema.optional(Schema.String),
  failureReason: Schema.optional(Schema.String),
  timeUpdated: NonNegativeInt,
}).annotate({ identifier: "LightbulbStableDashboardLaunchAttempt" })

const StableDashboardWorker = Schema.Struct({
  id: Lightbulb.WorkerID,
  role: Schema.String,
  status: Schema.String,
  summary: Schema.String,
  latestLaunchAttempt: Schema.optional(StableDashboardLaunchAttempt),
}).annotate({ identifier: "LightbulbStableDashboardWorker" })

const StableDashboardArtifact = Schema.Struct({
  id: Lightbulb.ArtifactID,
  type: Schema.String,
  uri: Schema.String,
  summary: Schema.String,
  status: Schema.String,
}).annotate({ identifier: "LightbulbStableDashboardArtifact" })

const StableDashboardGate = Schema.Struct({
  id: Lightbulb.GateID,
  kind: Schema.String,
  status: Schema.String,
  summary: Schema.String,
  artifactID: Schema.optional(Lightbulb.ArtifactID),
}).annotate({ identifier: "LightbulbStableDashboardGate" })

const StableDashboardRunnerTick = Schema.Struct({
  id: Lightbulb.EventID,
  timeCreated: NonNegativeInt,
  trigger: Schema.String,
  admittedCount: NonNegativeInt,
  skippedCount: NonNegativeInt,
  outcomeCount: NonNegativeInt,
}).annotate({ identifier: "LightbulbStableDashboardRunnerTick" })

const StableDashboardSnapshot = Schema.Struct({
  account: StableDashboardAccount,
  destination: Schema.String,
  currentRoute: StableDashboardCurrentRoute,
  pickupPacket: Schema.optional(StableDashboardPickupPacket),
  selectedIssue: Schema.optional(StableDashboardSelectedIssue),
  activeWorker: Schema.optional(StableDashboardWorker),
  latestReportArtifact: Schema.optional(StableDashboardArtifact),
  reviewGate: Schema.optional(StableDashboardGate),
  runnerTick: Schema.optional(StableDashboardRunnerTick),
  blockedReason: Schema.String,
  nextWakeSource: Schema.String,
  readyHumanAction: Schema.String,
}).annotate({ identifier: "LightbulbStableDashboardSnapshot" })

export const StableDashboardResponse = Schema.Struct({
  snapshot: Schema.optional(StableDashboardSnapshot),
}).annotate({ identifier: "LightbulbStableDashboardResponse" })

export const LightbulbPaths = {
  stableDashboard: `${root}/dashboard/stable-v0`,
  prReviewRoutes: `${root}/pr-review/routes`,
} as const

export const LightbulbApi = HttpApi.make("lightbulb")
  .add(
    HttpApiGroup.make("lightbulb")
      .add(
        HttpApiEndpoint.get("stableDashboard", LightbulbPaths.stableDashboard, {
          success: described(StableDashboardResponse, "Stable-v0 dashboard snapshot"),
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "lightbulb.stableDashboard.get",
            summary: "Get the stable-v0 dashboard snapshot",
            description:
              "Read the latest Lightbulb account dashboard as a compact stable-v0 operator snapshot without mutating route, worker, gate, or artifact state.",
          }),
        ),
      )
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
