import { and, desc, eq, inArray, isNull, or } from "drizzle-orm";
import type { Db } from "@/server/db/client";
import {
  comments,
  entries,
  entryPeople,
  notifications,
  trips,
  users,
  type NotificationType,
  type ReactionType,
} from "@/server/db/schema";
import {
  canBeNotifiedAbout,
  canBeNotifiedAboutTrip,
  canReadTripNotification,
  canViewSocial,
  type Actor,
  type PermissionUser,
} from "@/server/permissions";

// In-site notifications, without real time: they appear when a page is loaded.
//
// Who is notified:
// - an entry is published: everyone who can see it, except its author
//   (with a mention for the people identified in it);
// - someone is identified in an entry that is already published: that person;
// - a comment or a reaction on an entry: its author and the people identified in it;
// - a reply or a reaction on a comment: the author of that comment;
// - a trip becomes visible: everyone who can now see it.
// Never oneself, and only people allowed to see what it is about: a hidden
// trip only notifies its creator and the superuser. Visibility is checked
// again when notifications are read, so nothing leaks if a trip is hidden later.

type EntryRef = { id: number; authorId: number; status: "draft" | "published"; tripId: number };
type TripRef = { id: number; isVisible: boolean; authorId: number | null };

const permissionColumns = {
  id: users.id,
  role: users.role,
  canPublish: users.canPublish,
  canComment: users.canComment,
  canReact: users.canReact,
  canManageTrips: users.canManageTrips,
  isActive: users.isActive,
  mustChangePassword: users.mustChangePassword,
};

function loadUsers(db: Db, ids: number[]): PermissionUser[] {
  const unique = [...new Set(ids)];
  return unique.length === 0 ? [] : db.select(permissionColumns).from(users).where(inArray(users.id, unique)).all();
}

function activeUsers(db: Db): PermissionUser[] {
  return db.select(permissionColumns).from(users).where(eq(users.isActive, true)).all();
}

function taggedIds(db: Db, entryId: number): number[] {
  return db.select({ id: entryPeople.userId }).from(entryPeople).where(eq(entryPeople.entryId, entryId)).all().map((row) => row.id);
}

type NewNotification = {
  type: NotificationType;
  actorId: number;
  entry: EntryRef;
  trip: TripRef;
  commentId?: number | null;
  reactionType?: ReactionType | null;
  now?: Date;
};

/** Creates one notification per allowed recipient, never for the actor. */
function notify(db: Db, recipients: PermissionUser[], tagged: Set<number>, details: NewNotification): number {
  const rows = recipients
    .filter((user) => user.id !== details.actorId && canBeNotifiedAbout(user, details.trip, details.entry))
    .map((user) => ({
      recipientId: user.id,
      actorId: details.actorId,
      type: details.type,
      tripId: details.trip.id,
      entryId: details.entry.id,
      commentId: details.commentId ?? null,
      isTagged: tagged.has(user.id) && user.id !== details.entry.authorId,
      reactionType: details.reactionType ?? null,
      createdAt: details.now ?? new Date(),
    }));
  if (rows.length > 0) db.insert(notifications).values(rows).run();
  return rows.length;
}

/** The author of the entry and the people identified in it. */
function entryAudience(db: Db, entry: EntryRef) {
  const tagged = taggedIds(db, entry.id);
  return { recipients: loadUsers(db, [entry.authorId, ...tagged]), tagged: new Set(tagged) };
}

/** First publication of an entry: everyone who can see it, except its author. */
export function notifyEntryPublished(db: Db, actorId: number, trip: TripRef, entry: EntryRef, now = new Date()): number {
  const tagged = new Set(taggedIds(db, entry.id));
  const recipients = activeUsers(db).filter((user) => user.id !== entry.authorId);
  return notify(db, recipients, tagged, { type: "entry_published", actorId, entry, trip, now });
}

/**
 * People identified in an entry that is (again) published, who have not been
 * told yet: added while editing a published entry, or while it was withdrawn.
 * Those already told, by its publication or by an earlier identification, are skipped.
 */
export function notifyNewlyTagged(db: Db, actorId: number, trip: TripRef, entry: EntryRef, now = new Date()): number {
  if (entry.status !== "published") return 0;
  const alreadyTold = new Set(
    db
      .select({ id: notifications.recipientId })
      .from(notifications)
      .where(
        and(
          eq(notifications.entryId, entry.id),
          or(
            eq(notifications.type, "entry_tagged"),
            and(eq(notifications.type, "entry_published"), eq(notifications.isTagged, true)),
          ),
        ),
      )
      .all()
      .map((row) => row.id),
  );
  const tagged = taggedIds(db, entry.id).filter((id) => id !== entry.authorId && !alreadyTold.has(id));
  return notify(db, loadUsers(db, tagged), new Set(tagged), { type: "entry_tagged", actorId, entry, trip, now });
}

/**
 * A trip becomes visible (or is created visible): everyone who can now see
 * it, once per trip even if it is hidden and revealed again.
 */
export function notifyTripRevealed(db: Db, actorId: number, trip: TripRef, now = new Date()): number {
  if (!trip.isVisible) return 0;
  const alreadyTold = new Set(
    db
      .select({ id: notifications.recipientId })
      .from(notifications)
      .where(and(eq(notifications.tripId, trip.id), eq(notifications.type, "trip_revealed")))
      .all()
      .map((row) => row.id),
  );
  const rows = activeUsers(db)
    .filter((user) => user.id !== actorId && !alreadyTold.has(user.id) && canBeNotifiedAboutTrip(user, trip))
    .map((user) => ({ recipientId: user.id, actorId, type: "trip_revealed" as const, tripId: trip.id, createdAt: now }));
  if (rows.length > 0) db.insert(notifications).values(rows).run();
  return rows.length;
}

/** A new comment, or a reply to `repliedTo`. */
export function notifyComment(
  db: Db,
  actorId: number,
  trip: TripRef,
  entry: EntryRef,
  comment: { id: number },
  repliedTo: { authorId: number | null } | null,
  now = new Date(),
): number {
  if (repliedTo) {
    const recipients = repliedTo.authorId === null ? [] : loadUsers(db, [repliedTo.authorId]);
    return notify(db, recipients, new Set(), { type: "comment_reply", actorId, entry, trip, commentId: comment.id, now });
  }
  const { recipients, tagged } = entryAudience(db, entry);
  return notify(db, recipients, tagged, { type: "entry_comment", actorId, entry, trip, commentId: comment.id, now });
}

/**
 * Follows a reaction: a new reaction notifies, a changed one updates the
 * existing notification (no duplicate), a removed one deletes it.
 */
export function notifyReaction(
  db: Db,
  actorId: number,
  change: "added" | "changed" | "removed",
  type: ReactionType,
  trip: TripRef,
  entry: EntryRef,
  comment: { id: number; authorId: number | null } | null,
  now = new Date(),
): void {
  const kind: NotificationType = comment ? "comment_reaction" : "entry_reaction";
  const sameReaction = and(
    eq(notifications.actorId, actorId),
    eq(notifications.type, kind),
    eq(notifications.entryId, entry.id),
    comment ? eq(notifications.commentId, comment.id) : isNull(notifications.commentId),
  );

  if (change === "removed") {
    db.delete(notifications).where(sameReaction).run();
    return;
  }
  if (change === "changed") {
    db.update(notifications).set({ reactionType: type }).where(sameReaction).run();
    return;
  }
  if (comment) {
    const recipients = comment.authorId === null ? [] : loadUsers(db, [comment.authorId]);
    notify(db, recipients, new Set(), { type: kind, actorId, entry, trip, commentId: comment.id, reactionType: type, now });
  } else {
    const { recipients, tagged } = entryAudience(db, entry);
    notify(db, recipients, tagged, { type: kind, actorId, entry, trip, reactionType: type, now });
  }
}

/** Removes the notifications about a comment whose content is gone. */
export function forgetComment(db: Db, commentId: number): void {
  db.delete(notifications).where(eq(notifications.commentId, commentId)).run();
}

// --- Reading ------------------------------------------------------------------

export type NotificationView = {
  id: number;
  type: NotificationType;
  isRead: boolean;
  createdAt: Date;
  actorName: string;
  /** Null for notifications about a whole trip. */
  entryTitle: string | null;
  tripTitle: string;
  /** The recipient wrote the entry. */
  isOwnEntry: boolean;
  /** The recipient is currently identified in the entry. */
  isTagged: boolean;
  reactionType: ReactionType | null;
  /** Start of the comment or reply, for comment notifications. */
  excerpt: string | null;
  /** Page (and anchor) the notification leads to. */
  href: string;
};

export const NOTIFICATION_LIST_LIMIT = 100;
const EXCERPT_LENGTH = 120;

function excerpt(body: string): string {
  const flat = body.replace(/\s+/g, " ").trim();
  return flat.length > EXCERPT_LENGTH ? `${flat.slice(0, EXCERPT_LENGTH - 1)}…` : flat;
}

/**
 * Notifications of the viewer that are still relevant: what they are about
 * is still visible to them, and the comment still exists.
 */
function visibleNotifications(db: Db, viewer: Actor, options: { unreadOnly?: boolean; id?: number } = {}) {
  if (!viewer) return [];
  const conditions = [eq(notifications.recipientId, viewer.id)];
  if (options.unreadOnly) conditions.push(isNull(notifications.readAt));
  if (options.id !== undefined) conditions.push(eq(notifications.id, options.id));

  const rows = db
    .select({ notification: notifications, entry: entries, trip: trips, comment: comments, actorName: users.displayName })
    .from(notifications)
    .innerJoin(trips, eq(trips.id, notifications.tripId))
    .innerJoin(users, eq(users.id, notifications.actorId))
    .leftJoin(entries, eq(entries.id, notifications.entryId))
    .leftJoin(comments, eq(comments.id, notifications.commentId))
    .where(and(...conditions))
    .orderBy(desc(notifications.createdAt), desc(notifications.id))
    .all();

  // Entries the viewer is identified in, as they are now.
  const taggedIn = new Set(
    db.select({ id: entryPeople.entryId }).from(entryPeople).where(eq(entryPeople.userId, viewer.id)).all().map((row) => row.id),
  );

  return rows
    .filter((row) => {
      if (!row.entry) return row.notification.type === "trip_revealed" && canReadTripNotification(viewer, row.trip);
      if (row.notification.commentId !== null && (!row.comment || row.comment.deletedAt !== null)) return false;
      // No longer identified in it: the identification notice goes away.
      if (row.notification.type === "entry_tagged" && !taggedIn.has(row.entry.id)) return false;
      return canViewSocial(viewer, row.trip, row.entry);
    })
    .map((row) => ({ ...row, isTagged: row.entry !== null && taggedIn.has(row.entry.id) && row.entry.authorId !== viewer.id }));
}

type Row = ReturnType<typeof visibleNotifications>[number];

function hrefOf(row: Row): string {
  if (!row.entry) return `/trips/${row.trip.slug}`;
  const page = `/trips/${row.trip.slug}/entries/${row.entry.id}`;
  return row.notification.commentId !== null ? `${page}#comment-${row.notification.commentId}` : page;
}

function toView(row: Row, viewer: NonNullable<Actor>): NotificationView {
  const { notification } = row;
  const showsCommentText = notification.type === "entry_comment" || notification.type === "comment_reply";
  return {
    id: notification.id,
    type: notification.type,
    isRead: notification.readAt !== null,
    createdAt: notification.createdAt,
    actorName: row.actorName,
    entryTitle: row.entry?.title ?? null,
    tripTitle: row.trip.title,
    isOwnEntry: row.entry?.authorId === viewer.id,
    isTagged: row.isTagged,
    reactionType: notification.reactionType,
    excerpt: showsCommentText && row.comment ? excerpt(row.comment.body) : null,
    href: hrefOf(row),
  };
}

/** Most recent notifications of the viewer, newest first. */
export function listNotifications(db: Db, viewer: Actor, limit = NOTIFICATION_LIST_LIMIT): NotificationView[] {
  if (!viewer) return [];
  return visibleNotifications(db, viewer)
    .slice(0, limit)
    .map((row) => toView(row, viewer));
}

/** Number shown on the bell. */
export function countUnreadNotifications(db: Db, viewer: Actor): number {
  return visibleNotifications(db, viewer, { unreadOnly: true }).length;
}

/**
 * Marks one notification as read and returns where it leads. A notification
 * of someone else, or about something no longer visible, is reported as unknown.
 */
export function markNotificationRead(
  db: Db,
  viewer: Actor,
  notificationId: number,
  now = new Date(),
): { ok: true; href: string } | { ok: false; reason: "not_found" } {
  const row = visibleNotifications(db, viewer, { id: notificationId })[0];
  if (!row) return { ok: false, reason: "not_found" };
  if (row.notification.readAt === null) {
    db.update(notifications).set({ readAt: now }).where(eq(notifications.id, notificationId)).run();
  }
  return { ok: true, href: hrefOf(row) };
}

/** Marks every notification of the viewer as read, including ones no longer shown. */
export function markAllNotificationsRead(db: Db, viewer: Actor, now = new Date()): number {
  if (!viewer) return 0;
  return db
    .update(notifications)
    .set({ readAt: now })
    .where(and(eq(notifications.recipientId, viewer.id), isNull(notifications.readAt)))
    .run().changes;
}
