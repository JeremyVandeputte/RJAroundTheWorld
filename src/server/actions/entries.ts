"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { messages } from "@/lib/messages";
import { getEnv } from "@/lib/env";
import { getCurrentUser } from "@/server/auth/current-user";
import { getDb } from "@/server/db/client";
import { removeEntryDirs } from "@/server/media/storage";
import {
  createEntry,
  deleteEntry,
  updateEntry,
  type EntryInput,
  type EntryIntent,
  type PointInput,
} from "@/server/services/entries";
import { formId, formString, type FormState } from "./form-state";

/** Accepts "14.6" as well as "14,6". Returns NaN for anything that is not a number. */
function parseCoordinate(value: string): number {
  const normalized = value.trim().replace(",", ".");
  return /^-?\d+(\.\d+)?$/.test(normalized) ? Number(normalized) : Number.NaN;
}

/** A point is absent when both coordinates are empty. */
function readPoint(formData: FormData, prefix: "pointA" | "pointB"): PointInput | null {
  const lat = formString(formData, `${prefix}Lat`);
  const lng = formString(formData, `${prefix}Lng`);
  if (!lat.trim() && !lng.trim()) return null;
  return { lat: parseCoordinate(lat), lng: parseCoordinate(lng), name: formString(formData, `${prefix}Name`) };
}

function readEntryInput(formData: FormData): EntryInput {
  const peopleIds = formData
    .getAll("people")
    .map((value) => (typeof value === "string" && /^[1-9]\d{0,14}$/.test(value) ? Number(value) : Number.NaN));
  const tagIds = formData
    .getAll("tags")
    .map((value) => (typeof value === "string" && /^[1-9]\d{0,14}$/.test(value) ? Number(value) : Number.NaN));
  const newTags = formData.getAll("newTags").filter((value): value is string => typeof value === "string");
  return {
    tagIds,
    newTags,
    date: formString(formData, "date"),
    title: formString(formData, "title"),
    body: formString(formData, "body"),
    peopleIds,
    pointA: readPoint(formData, "pointA"),
    pointB: readPoint(formData, "pointB"),
  };
}

function readIntent(formData: FormData): EntryIntent {
  const intent = formString(formData, "intent");
  return intent === "publish" || intent === "unpublish" ? intent : "save";
}

/** Creates an entry (form carries `tripId`) or updates one (form carries `entryId`). */
export async function saveEntryAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const actor = await getCurrentUser();
  const input = readEntryInput(formData);
  const intent = readIntent(formData);
  const entryId = formId(formData, "entryId");
  const tripId = formId(formData, "tripId");

  let result;
  if (entryId !== null) {
    result = updateEntry(getDb(), actor, entryId, input, intent);
  } else if (tripId !== null) {
    result = createEntry(getDb(), actor, tripId, input, intent === "publish" ? "publish" : "save");
  } else {
    return { error: messages.entry.not_found };
  }
  if (!result.ok) return { error: messages.entry[result.reason] };

  revalidatePath("/", "layout");
  const entryPath = `/trips/${result.trip.slug}/entries/${result.entry.id}`;
  // "Save and add photos": go straight to the media section of the edit page.
  redirect(formString(formData, "intent") === "save_media" ? `${entryPath}/edit#media` : entryPath);
}

export async function deleteEntryAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const entryId = formId(formData, "entryId");
  if (entryId === null) return { error: messages.entry.not_found };
  const result = deleteEntry(getDb(), await getCurrentUser(), entryId);
  if (!result.ok) return { error: messages.entry[result.reason] };
  await removeEntryDirs(getEnv().mediaDir, [entryId]);

  revalidatePath("/", "layout");
  redirect(`/trips/${result.trip.slug}`);
}
