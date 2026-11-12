"use server";

import { revalidatePath } from "next/cache";
import { messages } from "@/lib/messages";
import { getCurrentUser } from "@/server/auth/current-user";
import { getDb } from "@/server/db/client";
import { addComment, deleteComment, editComment } from "@/server/services/comments";
import { react } from "@/server/services/reactions";
import { formId, formString, type FormState } from "./form-state";

// Comments and reactions. Permissions are enforced by the services.

function refresh(): void {
  revalidatePath("/", "layout");
}

/** Posts a comment (form carries `entryId`) or a reply (also `replyToId`). */
export async function addCommentAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const entryId = formId(formData, "entryId");
  if (entryId === null) return { error: messages.comment.not_found };
  const hasReplyTarget = formData.get("replyToId") !== null;
  const replyToId = formId(formData, "replyToId");
  if (hasReplyTarget && replyToId === null) return { error: messages.comment.comment_not_found };

  const result = addComment(getDb(), await getCurrentUser(), entryId, { body: formString(formData, "body"), replyToId });
  if (!result.ok) return { error: messages.comment[result.reason] };
  refresh();
  return { success: messages.comment.posted };
}

export async function editCommentAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const commentId = formId(formData, "commentId");
  if (commentId === null) return { error: messages.comment.comment_not_found };
  const result = editComment(getDb(), await getCurrentUser(), commentId, formString(formData, "body"));
  if (!result.ok) return { error: messages.comment[result.reason] };
  refresh();
  return { success: messages.comment.edited };
}

export async function deleteCommentAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const commentId = formId(formData, "commentId");
  if (commentId === null) return { error: messages.comment.comment_not_found };
  const result = deleteComment(getDb(), await getCurrentUser(), commentId);
  if (!result.ok) return { error: messages.comment[result.reason === "invalid_body" ? "forbidden" : result.reason] };
  refresh();
  return { success: messages.comment.deleted };
}

/**
 * Reacts to an entry (form carries `entryId`) or a comment (`commentId`).
 * The clicked button carries the reaction `type`; clicking the current one removes it.
 */
export async function reactAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const entryId = formId(formData, "entryId");
  const commentId = formId(formData, "commentId");
  const target = commentId !== null ? { commentId } : entryId !== null ? { entryId } : null;
  if (!target) return { error: messages.reaction.not_found };

  const result = react(getDb(), await getCurrentUser(), target, formString(formData, "type"));
  if (!result.ok) return { error: messages.reaction[result.reason] };
  refresh();
  return {};
}
