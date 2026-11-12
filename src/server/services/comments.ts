import { and, asc, count, eq } from "drizzle-orm";
import type { Db } from "@/server/db/client";
import { comments, entries, reactions, trips, users } from "@/server/db/schema";
import { canComment, canDeleteComment, canEditComment, canViewEntry, canViewSocial, type Actor } from "@/server/permissions";
import type { Entry } from "./entries";
import type { Trip } from "./trips";

export type Comment = typeof comments.$inferSelect;

export const COMMENT_MAX_LENGTH = 2000;

/** A comment as shown to one viewer, with what that viewer may do with it. */
export type CommentView = {
  id: number;
  /** Null once the author's account has been deleted. */
  authorName: string | null;
  /** Empty for a deleted comment kept as a placeholder. */
  body: string;
  createdAt: Date;
  editedAt: Date | null;
  isDeleted: boolean;
  canEdit: boolean;
  canDelete: boolean;
};

/** A top-level comment with its replies (a single level, oldest first). */
export type CommentThread = CommentView & { replies: CommentView[] };

/**
 * Comments of an entry, or null when the actor may not see them at all
 * (anonymous visitors, drafts, hidden trips): callers must then show
 * nothing, not even a count.
 */
export function listCommentThreads(db: Db, actor: Actor, trip: Trip, entry: Entry): CommentThread[] | null {
  if (entry.tripId !== trip.id || !canViewSocial(actor, trip, entry)) return null;

  const rows = db
    .select({ comment: comments, authorName: users.displayName })
    .from(comments)
    .leftJoin(users, eq(users.id, comments.authorId))
    .where(eq(comments.entryId, entry.id))
    .orderBy(asc(comments.createdAt), asc(comments.id))
    .all();

  const toView = ({ comment, authorName }: (typeof rows)[number]): CommentView => {
    const isDeleted = comment.deletedAt !== null;
    return {
      id: comment.id,
      authorName: isDeleted ? null : authorName,
      body: isDeleted ? "" : comment.body,
      createdAt: comment.createdAt,
      editedAt: isDeleted ? null : comment.editedAt,
      isDeleted,
      canEdit: canEditComment(actor, trip, entry, comment),
      canDelete: canDeleteComment(actor, trip, entry, comment),
    };
  };

  const threads = new Map<number, CommentThread>();
  for (const row of rows) {
    if (row.comment.parentId === null) threads.set(row.comment.id, { ...toView(row), replies: [] });
  }
  for (const row of rows) {
    if (row.comment.parentId !== null) threads.get(row.comment.parentId)?.replies.push(toView(row));
  }
  return [...threads.values()];
}

type CommentContext = { comment: Comment; entry: Entry; trip: Trip };

function findContext(db: Db, commentId: number): CommentContext | undefined {
  return db
    .select({ comment: comments, entry: entries, trip: trips })
    .from(comments)
    .innerJoin(entries, eq(entries.id, comments.entryId))
    .innerJoin(trips, eq(trips.id, entries.tripId))
    .where(eq(comments.id, commentId))
    .get();
}

function cleanBody(body: string): string | null {
  const cleaned = body.replace(/\r\n?/g, "\n").trim();
  return cleaned.length === 0 || cleaned.length > COMMENT_MAX_LENGTH ? null : cleaned;
}

type CommentRefusal = "not_found" | "forbidden" | "invalid_body" | "comment_not_found";

export type AddCommentResult =
  | {
      ok: true;
      comment: Comment;
      entry: Entry;
      trip: Trip;
      /** The comment that was answered, when this is a reply. */
      repliedTo: Comment | null;
    }
  | { ok: false; reason: CommentRefusal };

/**
 * Posts a comment on an entry, or a reply when `replyToId` is given.
 * Threads have a single level: a reply to a reply is attached to the same
 * top-level comment, so it appears right below it.
 */
export function addComment(
  db: Db,
  actor: Actor,
  entryId: number,
  input: { body: string; replyToId: number | null },
  now = new Date(),
): AddCommentResult {
  const found = db
    .select({ entry: entries, trip: trips })
    .from(entries)
    .innerJoin(trips, eq(trips.id, entries.tripId))
    .where(eq(entries.id, entryId))
    .get();
  if (!found || !canViewEntry(actor, found.trip, found.entry)) return { ok: false, reason: "not_found" };
  if (!actor || !canComment(actor, found.trip, found.entry)) return { ok: false, reason: "forbidden" };

  const body = cleanBody(input.body);
  if (body === null) return { ok: false, reason: "invalid_body" };

  let repliedTo: Comment | null = null;
  if (input.replyToId !== null) {
    repliedTo =
      db.select().from(comments).where(and(eq(comments.id, input.replyToId), eq(comments.entryId, entryId))).get() ?? null;
    // A deleted comment cannot be answered (its replies still can).
    if (!repliedTo || repliedTo.deletedAt !== null) return { ok: false, reason: "comment_not_found" };
  }

  const comment = db
    .insert(comments)
    .values({
      entryId,
      parentId: repliedTo ? (repliedTo.parentId ?? repliedTo.id) : null,
      authorId: actor.id,
      body,
      createdAt: now,
    })
    .returning()
    .get();
  return { ok: true, comment, entry: found.entry, trip: found.trip, repliedTo };
}

/** Loads a comment for a change; what the actor cannot see is reported as unknown. */
function findChangeable(
  db: Db,
  actor: Actor,
  commentId: number,
  isAllowed: typeof canEditComment,
): ({ ok: true } & CommentContext) | { ok: false; reason: "comment_not_found" | "forbidden" } {
  const context = findContext(db, commentId);
  if (!context || context.comment.deletedAt !== null || !canViewSocial(actor, context.trip, context.entry)) {
    return { ok: false, reason: "comment_not_found" };
  }
  if (!isAllowed(actor, context.trip, context.entry, context.comment)) return { ok: false, reason: "forbidden" };
  return { ok: true, ...context };
}

export type ChangeCommentResult =
  | ({ ok: true } & CommentContext)
  | { ok: false; reason: "comment_not_found" | "forbidden" | "invalid_body" };

export function editComment(db: Db, actor: Actor, commentId: number, newBody: string, now = new Date()): ChangeCommentResult {
  const found = findChangeable(db, actor, commentId, canEditComment);
  if (!found.ok) return found;
  const body = cleanBody(newBody);
  if (body === null) return { ok: false, reason: "invalid_body" };

  const comment = db.update(comments).set({ body, editedAt: now }).where(eq(comments.id, commentId)).returning().get();
  return comment ? { ...found, comment } : { ok: false, reason: "comment_not_found" };
}

function replyCount(db: Db, commentId: number): number {
  return db.select({ total: count() }).from(comments).where(eq(comments.parentId, commentId)).get()?.total ?? 0;
}

/**
 * Deletes a comment. A comment that has replies is kept as an empty
 * "deleted" placeholder so the thread stays readable; the placeholder
 * disappears with its last reply.
 */
export function deleteComment(db: Db, actor: Actor, commentId: number, now = new Date()): ChangeCommentResult {
  const found = findChangeable(db, actor, commentId, canDeleteComment);
  if (!found.ok) return found;
  const { comment } = found;

  db.transaction((tx) => {
    const txDb = tx as unknown as Db;
    if (comment.parentId === null && replyCount(txDb, comment.id) > 0) {
      tx.update(comments).set({ body: "", deletedAt: now, editedAt: null }).where(eq(comments.id, comment.id)).run();
      tx.delete(reactions).where(eq(reactions.commentId, comment.id)).run();
      return;
    }
    tx.delete(comments).where(eq(comments.id, comment.id)).run();
    if (comment.parentId !== null && replyCount(txDb, comment.parentId) === 0) {
      const parent = tx.select().from(comments).where(eq(comments.id, comment.parentId)).get();
      if (parent?.deletedAt) tx.delete(comments).where(eq(comments.id, parent.id)).run();
    }
  });
  return found;
}
