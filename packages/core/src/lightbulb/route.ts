import { asc, eq } from "drizzle-orm"
import { Effect } from "effect"
import type { Database } from "../database/database"
import type { Lightbulb } from "../lightbulb"

type RouteIDFactories = {
  readonly route: () => Lightbulb.RouteID
  readonly stop: () => Lightbulb.RouteStopID
  readonly steer: () => Lightbulb.RouteSteerID
  readonly event: () => Lightbulb.EventID
}
import {
  LightbulbEventTable,
  LightbulbGoalTable,
  LightbulbRouteSteerTable,
  LightbulbRouteStopTable,
  LightbulbRouteTable,
} from "./sql"

export function readGoalRoute(db: Database.Interface["db"], routeID: Lightbulb.RouteID) {
  return Effect.gen(function* () {
    const route = yield* db
      .select()
      .from(LightbulbRouteTable)
      .where(eq(LightbulbRouteTable.id, routeID))
      .get()
      .pipe(Effect.orDie)
    if (!route) return
    const stops = yield* db
      .select()
      .from(LightbulbRouteStopTable)
      .where(eq(LightbulbRouteStopTable.route_id, routeID))
      .orderBy(asc(LightbulbRouteStopTable.sequence))
      .all()
      .pipe(Effect.orDie)
    const steers = yield* db
      .select()
      .from(LightbulbRouteSteerTable)
      .where(eq(LightbulbRouteSteerTable.route_id, routeID))
      .orderBy(asc(LightbulbRouteSteerTable.time_created))
      .all()
      .pipe(Effect.orDie)
    return { ...route, currentStopID: route.current_stop_id, stops, steers }
  })
}

export function requireGoalRoute(db: Database.Interface["db"], routeID: Lightbulb.RouteID) {
  return Effect.gen(function* () {
    const route = yield* readGoalRoute(db, routeID)
    if (!route) return yield* Effect.die(new Error("Lightbulb route not found"))
    return route
  })
}

export function planGoalRoute(
  db: Database.Interface["db"],
  input: Lightbulb.PlanGoalRouteInput,
  ids: RouteIDFactories,
) {
  assertGoalRouteInput(input)
  const routeID = ids.route()
  const stops = input.stops.map((stop, sequence) => ({ ...stop, id: ids.stop(), sequence }))
  return Effect.gen(function* () {
    yield* db
      .transaction((tx) =>
        Effect.gen(function* () {
          const goal = yield* tx
            .select({ account_id: LightbulbGoalTable.account_id })
            .from(LightbulbGoalTable)
            .where(eq(LightbulbGoalTable.id, input.goalID))
            .get()
          if (!goal) return yield* Effect.die(new Error("Lightbulb goal not found"))
          yield* tx
            .insert(LightbulbRouteTable)
            .values({
              id: routeID,
              account_id: goal.account_id,
              goal_id: input.goalID,
              destination: input.destination,
              status: "active",
              current_stop_id: stops[0]!.id,
              summary: input.summary ?? `Route to ${input.destination}`,
              metadata: input.metadata,
            })
            .run()
          yield* Effect.all(
            stops.map((stop) =>
              tx
                .insert(LightbulbRouteStopTable)
                .values({
                  id: stop.id,
                  account_id: goal.account_id,
                  route_id: routeID,
                  sequence: stop.sequence,
                  kind: stop.kind,
                  status: stop.sequence === 0 ? "active" : "pending",
                  title: stop.title,
                  objective: stop.objective,
                  evidence: stop.evidence,
                  metadata: stop.metadata,
                })
                .run(),
            ),
          )
          yield* tx
            .insert(LightbulbEventTable)
            .values({
              id: ids.event(),
              account_id: goal.account_id,
              aggregate_type: "route",
              aggregate_id: routeID,
              type: "lightbulb.route.planned",
              summary: "Planned a goal route with destination, stops, and current stop.",
              data: {
                goal_id: input.goalID,
                destination: input.destination,
                current_stop_id: stops[0]!.id,
                stop_ids: stops.map((stop) => stop.id),
              },
              time_created: Date.now(),
            })
            .run()
        }),
      )
      .pipe(Effect.orDie)
    return yield* requireGoalRoute(db, routeID)
  })
}

export function steerGoalRoute(
  db: Database.Interface["db"],
  input: Lightbulb.SteerGoalRouteInput,
  ids: RouteIDFactories,
) {
  return Effect.gen(function* () {
    const current = yield* requireGoalRoute(db, input.routeID)
    if (input.nextStopID && !current.stops.some((stop) => stop.id === input.nextStopID)) {
      return yield* Effect.die(new Error("Lightbulb route steer target stop not found"))
    }
    yield* db
      .transaction((tx) =>
        Effect.gen(function* () {
          if (current.currentStopID) {
            yield* tx
              .update(LightbulbRouteStopTable)
              .set({ status: "blocked" })
              .where(eq(LightbulbRouteStopTable.id, current.currentStopID))
              .run()
          }
          if (input.nextStopID) {
            yield* tx
              .update(LightbulbRouteStopTable)
              .set({ status: "active" })
              .where(eq(LightbulbRouteStopTable.id, input.nextStopID))
              .run()
          }
          yield* tx
            .update(LightbulbRouteTable)
            .set({ status: "rerouting", current_stop_id: input.nextStopID ?? current.currentStopID })
            .where(eq(LightbulbRouteTable.id, input.routeID))
            .run()
          yield* tx
            .insert(LightbulbRouteSteerTable)
            .values({
              id: ids.steer(),
              account_id: current.account_id,
              route_id: input.routeID,
              reason: input.reason,
              from_stop_id: current.currentStopID,
              to_stop_id: input.nextStopID,
              summary: input.summary,
              instruction: input.instruction,
              metadata: input.metadata,
            })
            .run()
          yield* tx
            .insert(LightbulbEventTable)
            .values({
              id: ids.event(),
              account_id: current.account_id,
              aggregate_type: "route",
              aggregate_id: input.routeID,
              type: "lightbulb.route.steered",
              summary: input.summary,
              data: {
                reason: input.reason,
                from_stop_id: current.currentStopID,
                to_stop_id: input.nextStopID ?? null,
                instruction: input.instruction ?? null,
              },
              time_created: Date.now(),
            })
            .run()
        }),
      )
      .pipe(Effect.orDie)
    return yield* requireGoalRoute(db, input.routeID)
  })
}

function assertGoalRouteInput(input: Lightbulb.PlanGoalRouteInput) {
  if (input.destination.trim().length === 0) throw new Error("Lightbulb route destination is required")
  if (input.stops.length === 0) throw new Error("Lightbulb route requires at least one stop")
  if (
    input.stops.some(
      (stop) => stop.title.trim().length === 0 || stop.objective.trim().length === 0 || stop.evidence.trim().length === 0,
    )
  ) {
    throw new Error("Lightbulb route stops require title, objective, and evidence")
  }
}
