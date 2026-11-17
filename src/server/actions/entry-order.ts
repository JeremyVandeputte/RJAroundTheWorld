"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/server/auth/current-user";
import { getDb } from "@/server/db/client";
import { moveEntry, type MoveDirection } from "@/server/services/entries";

/** Moves an entry up or down among the entries of its day (page "Ordre des entrées"). */
export async function moveEntryAction(entryId: number, direction: MoveDirection): Promise<{ ok: boolean }> {
  if (!Number.isSafeInteger(entryId) || entryId <= 0 || (direction !== "up" && direction !== "down")) return { ok: false };
  const result = moveEntry(getDb(), await getCurrentUser(), entryId, direction);
  if (!result.ok) return { ok: false };
  if (result.moved) {
    // Everything that lists entries in order: the journal, its map, the global map, the search.
    revalidatePath(`/trips/${result.trip.slug}`, "layout");
    revalidatePath("/map");
    revalidatePath("/search");
  }
  return { ok: true };
}
