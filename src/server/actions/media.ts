"use server";

import { revalidatePath } from "next/cache";
import { getEnv } from "@/lib/env";
import { messages } from "@/lib/messages";
import { getCurrentUser } from "@/server/auth/current-user";
import { getDb } from "@/server/db/client";
import { PUBLIC_ID_PATTERN, removeFiles } from "@/server/media/storage";
import { deleteMedia } from "@/server/services/media";

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
