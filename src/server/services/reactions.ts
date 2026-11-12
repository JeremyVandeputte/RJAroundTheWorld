import { and, asc, eq, isNotNull, or } from "drizzle-orm";
import { isReactionKind, REACTIONS, type ReactionKind } from "@/lib/reactions";
import type { Db } from "@/server/db/client";
import { comments, entries, reactions, trips, users } from "@/server/db/schema";
import { canReact, canViewEntry, canViewSocial, type Actor } from "@/server/permissions";
import type { Comment } from "./comments";
import type { Entry } from "./entries";
import type { Trip } from "./trips";

/** Reactions on one element, as shown to one viewer. */
export type ReactionSummary = {
  /** Number of reactions of each type. */
  counts: Record<ReactionKind, number>;
  /** The viewer's own reaction, if any. */
  mine: ReactionKind | null;
  /** Who reacted what, in the order the reactions were given. */
  people: { name: string; type: ReactionKind }[];
};

function emptySummary(): ReactionSummary {
  return {
    counts: Object.fromEntries(REACTIONS.map((reaction) => [reaction.type, 0])) as Record<ReactionKind, number>,
    mine: null,
    people: [],
  };
}

export type EntryReactions = { entry: ReactionSummary; comments: Map<number, ReactionSummary> };

/**
 * Reactions on an entry and on each of its comments, or null when the actor
 * may not see them (anonymous visitors, drafts, hidden trips): callers must
 * then show nothing, not even a count.
 */
export function getEntryReactions(db: Db, actor: Actor, trip: Trip, entry: Entry): EntryReactions | null {
  if (entry.tripId !== trip.id || !canViewSocial(actor, trip, entry)) return null;

  const rows = db
    .select({ reaction: reactions, name: users.displayName })
    .from(reactions)
    .innerJoin(users, eq(users.id, reactions.userId))
    .leftJoin(comments, eq(comments.id, reactions.commentId))
    .where(or(eq(reactions.entryId, entry.id), and(isNotNull(reactions.commentId), eq(comments.entryId, entry.id))))
    .orderBy(asc(reactions.createdAt), asc(reactions.id))
    .all();

  const result: EntryReactions = { entry: emptySummary(), comments: new Map() };
  for (const { reaction, name } of rows) {
    let summary = result.entry;
    if (reaction.commentId !== null) {
      summary = result.comments.get(reaction.commentId) ?? emptySummary();
      result.comments.set(reaction.commentId, summary);
    }
    summary.counts[reaction.type] += 1;
    summary.people.push({ name, type: reaction.type });
    if (actor && reaction.userId === actor.id) summary.mine = reaction.type;
  }
  return result;
}

export type ReactionTarget = { entryId: number } | { commentId: number };

export type ReactResult =
  | {
      ok: true;
      /** What happened to the actor's reaction on this element. */
      change: "added" | "changed" | "removed";
      type: ReactionKind;
      entry: Entry;
      trip: Trip;
      /** Set when the reaction is on a comment. */
      comment: Comment | null;
    }
  | { ok: false; reason: "not_found" | "forbidden" | "invalid_type" };

/**
 * Sets the actor's reaction on an entry or a comment. One reaction per user
 * and per element: choosing another type replaces it, choosing the same
 * type again removes it.
 */
export function react(db: Db, actor: Actor, target: ReactionTarget, type: string, now = new Date()): ReactResult {
  if (!isReactionKind(type)) return { ok: false, reason: "invalid_type" };

  let comment: Comment | null = null;
  let entryId: number;
  if ("commentId" in target) {
    comment = db.select().from(comments).where(eq(comments.id, target.commentId)).get() ?? null;
    // Deleted comments cannot be reacted to.
    if (!comment || comment.deletedAt !== null) return { ok: false, reason: "not_found" };
    entryId = comment.entryId;
  } else {
    entryId = target.entryId;
  }

  const found = db
    .select({ entry: entries, trip: trips })
    .from(entries)
    .innerJoin(trips, eq(trips.id, entries.tripId))
    .where(eq(entries.id, entryId))
    .get();
  if (!found || !canViewEntry(actor, found.trip, found.entry)) return { ok: false, reason: "not_found" };
  if (!actor || !canReact(actor, found.trip, found.entry)) return { ok: false, reason: "forbidden" };

  const onTarget = comment ? eq(reactions.commentId, comment.id) : eq(reactions.entryId, entryId);
  const existing = db.select().from(reactions).where(and(eq(reactions.userId, actor.id), onTarget)).get();
  const base = { ok: true as const, type, entry: found.entry, trip: found.trip, comment };

  if (!existing) {
    db.insert(reactions)
      .values({ userId: actor.id, entryId: comment ? null : entryId, commentId: comment?.id ?? null, type, createdAt: now })
      .run();
    return { ...base, change: "added" };
  }
  if (existing.type === type) {
    db.delete(reactions).where(eq(reactions.id, existing.id)).run();
    return { ...base, change: "removed" };
  }
  db.update(reactions).set({ type }).where(eq(reactions.id, existing.id)).run();
  return { ...base, change: "changed" };
}
