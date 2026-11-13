"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { messages } from "@/lib/messages";
import { getEnv } from "@/lib/env";
import { getCurrentUser } from "@/server/auth/current-user";
import { getDb } from "@/server/db/client";
import { removeEntryDirs, removeTripDir } from "@/server/media/storage";
import { createTrip, deleteTrip, updateTrip, type TripInput } from "@/server/services/trips";
import { formBoolean, formId, formString, type FormState } from "./form-state";

function readTripInput(formData: FormData): TripInput {
  return {
    title: formString(formData, "title"),
    description: formString(formData, "description"),
    startDate: formString(formData, "startDate"),
    endDate: formString(formData, "endDate"),
    isVisible: formBoolean(formData, "isVisible"),
  };
}

/** Creates a trip, or updates it when the form carries a `tripId`. */
export async function saveTripAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const actor = await getCurrentUser();
  const input = readTripInput(formData);
  const hasId = formData.get("tripId") !== null;
  const tripId = formId(formData, "tripId");
  if (hasId && tripId === null) return { error: messages.trip.trip_not_found };

  const result = tripId === null ? createTrip(getDb(), actor, input) : updateTrip(getDb(), actor, tripId, input);
  if (!result.ok) return { error: messages.trip[result.reason] };

  revalidatePath("/", "layout");
  // A new trip goes straight to its thumbnail, needed before it can be made visible.
  redirect(tripId === null ? `/trips/${result.trip.slug}/edit#cover` : `/trips/${result.trip.slug}`);
}

export async function deleteTripAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const tripId = formId(formData, "tripId");
  if (tripId === null) return { error: messages.trip.trip_not_found };
  const result = deleteTrip(getDb(), await getCurrentUser(), tripId);
  if (!result.ok) return { error: messages.trip[result.reason] };
  await removeEntryDirs(getEnv().mediaDir, result.entryIds);
  await removeTripDir(getEnv().mediaDir, tripId);

  revalidatePath("/", "layout");
  redirect("/");
}
