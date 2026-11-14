"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/server/auth/current-user";
import { getDb } from "@/server/db/client";
import { entries } from "@/server/db/schema";
import { markEntryRead } from "@/server/services/reads";
import { getTripById } from "@/server/services/trips";

/**
 * Called by the entry page once it is shown in the browser. Not done while
 * rendering the page: browsers prefetch links, which would mark entries as
 * read without anyone opening them.
 */
export async function markEntryReadAction(entryId: number): Promise<void> {
  if (!Number.isSafeInteger(entryId) || entryId <= 0) return;
  const db = getDb();
  const viewer = await getCurrentUser();
  const entry = db.select().from(entries).where(eq(entries.id, entryId)).get();
  const trip = entry ? getTripById(db, viewer, entry.tripId) : null;
  if (!entry || !trip) return;
  // The "new" marks on the trip page and the home page go away.
  if (markEntryRead(db, viewer, trip, entry)) {
    revalidatePath(`/trips/${trip.slug}`);
    revalidatePath("/");
  }
}
