"use server";

import { revalidatePath } from "next/cache";
import { getEnv } from "@/lib/env";
import { messages } from "@/lib/messages";
import { getCurrentUser } from "@/server/auth/current-user";
import { getDb } from "@/server/db/client";
import { PUBLIC_ID_PATTERN, removeFiles } from "@/server/media/storage";
import { chooseEntryCover, chooseTripCover, deleteMedia } from "@/server/services/media";

/** Removes a photo or a video from an entry. Called directly from the media manager. */
export async function deleteMediaAction(publicId: string): Promise<{ error?: string }> {
  if (typeof publicId !== "string" || !PUBLIC_ID_PATTERN.test(publicId)) {
    return { error: messages.media.delete_not_found };
  }
  const result = deleteMedia(getDb(), await getCurrentUser(), publicId);
  if (!result.ok) {
    return { error: result.reason === "forbidden" ? messages.media.delete_forbidden : messages.media.delete_not_found };
  }
  await removeFiles(getEnv().mediaDir, result.files);
  revalidatePath("/", "layout");
  return {};
}

function coverError(reason: "not_found" | "forbidden" | "not_a_photo"): string {
  return messages.cover[reason];
}

/** Makes one of an entry's photos its thumbnail. */
export async function chooseEntryCoverAction(publicId: string): Promise<{ error?: string }> {
  if (typeof publicId !== "string" || !PUBLIC_ID_PATTERN.test(publicId)) return { error: messages.cover.not_found };
  const result = chooseEntryCover(getDb(), await getCurrentUser(), publicId);
  if (!result.ok) return { error: coverError(result.reason) };
  revalidatePath("/", "layout");
  return {};
}

/** Makes one of the trip's entries' photos the trip's thumbnail. */
export async function chooseTripCoverAction(tripId: number, publicId: string): Promise<{ error?: string }> {
  if (!Number.isSafeInteger(tripId) || typeof publicId !== "string" || !PUBLIC_ID_PATTERN.test(publicId)) {
    return { error: messages.cover.not_found };
  }
  const result = chooseTripCover(getDb(), await getCurrentUser(), tripId, publicId);
  if (!result.ok) return { error: coverError(result.reason) };
  await removeFiles(getEnv().mediaDir, result.replacedFiles);
  revalidatePath("/", "layout");
  return {};
}
