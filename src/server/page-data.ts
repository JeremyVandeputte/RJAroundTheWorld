import { cache } from "react";
import { getViewer } from "@/server/auth/current-user";
import { getDb } from "@/server/db/client";
import { getEntry } from "@/server/services/entries";
import { getTripBySlug } from "@/server/services/trips";

// Data loaders shared by a page and its metadata, run once per request.
// They always go through the services, so permissions apply to titles too.

export const loadTrip = cache(async (tripSlug: string) => {
  const viewer = await getViewer();
  return { viewer, trip: getTripBySlug(getDb(), viewer, tripSlug) };
});

export const loadEntry = cache(async (tripSlug: string, entryIdParam: string) => {
  const { viewer, trip } = await loadTrip(tripSlug);
  const entryId = /^[1-9]\d{0,14}$/.test(entryIdParam) ? Number(entryIdParam) : null;
  const detail = trip && entryId !== null ? getEntry(getDb(), viewer, trip, entryId) : null;
  return { viewer, trip, detail };
});
