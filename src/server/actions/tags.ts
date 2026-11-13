"use server";

import { revalidatePath } from "next/cache";
import { messages } from "@/lib/messages";
import { getCurrentUser } from "@/server/auth/current-user";
import { getDb } from "@/server/db/client";
import { createTag, deleteTag, renameTag } from "@/server/services/tags";
import { formId, formString, type FormState } from "./form-state";

// Tag administration (superuser). Permissions are enforced by the service.

export async function createTagAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const result = createTag(getDb(), await getCurrentUser(), formString(formData, "name"));
  if (!result.ok) return { error: messages.tag[result.reason] };
  revalidatePath("/", "layout");
  return { success: messages.tag.created };
}

export async function renameTagAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const tagId = formId(formData, "tagId");
  if (tagId === null) return { error: messages.tag.tag_not_found };
  const result = renameTag(getDb(), await getCurrentUser(), tagId, formString(formData, "name"));
  if (!result.ok) return { error: messages.tag[result.reason] };
  revalidatePath("/", "layout");
  return { success: messages.tag.renamed };
}

export async function deleteTagAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const tagId = formId(formData, "tagId");
  if (tagId === null) return { error: messages.tag.tag_not_found };
  const result = deleteTag(getDb(), await getCurrentUser(), tagId);
  if (!result.ok) return { error: messages.tag[result.reason] };
  revalidatePath("/", "layout");
  return {};
}
