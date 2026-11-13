import type { Db } from "@/server/db/client";
import type { Actor } from "@/server/permissions";
import { listTripMapEntries, type MapEntry } from "./entries";
import { listTrips, type Trip } from "./trips";

export type GlobalMapTrip = {
  trip: Pick<Trip, "id" | "slug" | "title" | "startDate" | "endDate" | "isVisible">;
  entries: MapEntry[];
};

/**
 * Places of every trip the actor may see, most recent trip first, with the
 * same rules as each trip's own map: published entries only, never a hidden
 * trip for someone who cannot see it. Trips without any place are left out.
 */
export function listGlobalMap(db: Db, actor: Actor): GlobalMapTrip[] {
  return listTrips(db, actor).flatMap((trip) => {
    const entries = listTripMapEntries(db, actor, trip);
    if (entries.length === 0) return [];
    const { id, slug, title, startDate, endDate, isVisible } = trip;
    return [{ trip: { id, slug, title, startDate, endDate, isVisible }, entries }];
  });
}
