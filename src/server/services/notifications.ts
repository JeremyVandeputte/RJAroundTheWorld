import { and, desc, eq, inArray, isNull, or } from "drizzle-orm";
import type { Db } from "@/server/db/client";
import { describeNotification } from "@/lib/notification-text";
import { entries, entryPeople, notifications, trips, users, type NotificationType } from "@/server/db/schema";
import {
  canBeNotifiedAbout,
  canBeNotifiedAboutTrip,
  canReadEntryNotification,
  canReadTripNotification,
  type Actor,
  type PermissionUser,
} from "@/server/permissions";

// In-site notifications, without real time: they appear when a page is loaded.
//
// Who is notified:
// - an entry is published: everyone who can see it, except its author
//   (with a mention for the people identified in it);
// - someone is identified in an entry that is already published: that person;
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
      isTagged: tagged.has(user.id) && user.id !== details.entry.authorId,
      createdAt: details.now ?? new Date(),
    }));
  if (rows.length > 0) db.insert(notifications).values(rows).run();
  return rows.length;
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
  /** Page (and anchor) the notification leads to. */
  href: string;
};

export const NOTIFICATION_LIST_LIMIT = 100;

/**
 * Notifications of the viewer that are still relevant: what they are about
 * is still visible to them.
 */
function visibleNotifications(db: Db, viewer: Actor, options: { unreadOnly?: boolean; id?: number } = {}) {
  if (!viewer) return [];
  const conditions = [eq(notifications.recipientId, viewer.id)];
  if (options.unreadOnly) conditions.push(isNull(notifications.readAt));
  if (options.id !== undefined) conditions.push(eq(notifications.id, options.id));

  const rows = db
    .select({ notification: notifications, entry: entries, trip: trips, actorName: users.displayName })
    .from(notifications)
    .innerJoin(trips, eq(trips.id, notifications.tripId))
    .innerJoin(users, eq(users.id, notifications.actorId))
    .leftJoin(entries, eq(entries.id, notifications.entryId))
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
      // No longer identified in it: the identification notice goes away.
      if (row.notification.type === "entry_tagged" && !taggedIn.has(row.entry.id)) return false;
      return canReadEntryNotification(viewer, row.trip, row.entry);
    })
    .map((row) => ({ ...row, isTagged: row.entry !== null && taggedIn.has(row.entry.id) && row.entry.authorId !== viewer.id }));
}

type Row = ReturnType<typeof visibleNotifications>[number];

function hrefOf(row: Row): string {
  return row.entry ? `/trips/${row.trip.slug}/entries/${row.entry.id}` : `/trips/${row.trip.slug}`;
}

function toView(row: Row, viewer: NonNullable<Actor>): NotificationView {
  const { notification } = row;
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

// --- Phone notifications -----------------------------------------------------------

/** What a phone shows for a notification: same sentence as on the site. */
export type PushMessage = {
  recipientId: number;
  /** Shown in bold: the trip it is about. */
  title: string;
  body: string;
  /** Opens what it is about, marking the notification as read. */
  url: string;
  /** One phone notification per site notification. */
  tag: string;
  /** Unread notifications of the recipient, for the number on the app icon. */
  unread: number;
};

/** Oldest age of a notification still worth sending to a phone. */
const PUSH_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/**
 * Takes the notifications not yet handed to the phone step (each is taken
 * only once) and returns the messages to send: only to active people who may
 * still see what it is about, and never for old ones (server stopped meanwhile).
 */
export function takePendingPushMessages(db: Db, now = new Date()): PushMessage[] {
  const pending = db.transaction((tx) => {
    const rows = tx
      .select({ id: notifications.id, recipientId: notifications.recipientId, createdAt: notifications.createdAt })
      .from(notifications)
      .where(isNull(notifications.pushedAt))
      .all();
    if (rows.length > 0) {
      tx.update(notifications).set({ pushedAt: now }).where(inArray(notifications.id, rows.map((row) => row.id))).run();
    }
    return rows.filter((row) => now.getTime() - row.createdAt.getTime() <= PUSH_MAX_AGE_MS);
  });

  const messages: PushMessage[] = [];
  const recipients = new Map(loadUsers(db, pending.map((row) => row.recipientId)).map((user) => [user.id, user]));
  for (const { id, recipientId } of pending) {
    const recipient = recipients.get(recipientId);
    if (!recipient) continue;
    const row = visibleNotifications(db, recipient, { id })[0];
    // Deactivated meanwhile, trip hidden again, entry withdrawn: nothing is sent.
    if (!row) continue;
    const view = toView(row, recipient);
    messages.push({
      recipientId,
      title: view.tripTitle,
      body: describeNotification(view),
      url: `/notifications/${id}/open`,
      tag: `notification-${id}`,
      unread: countUnreadNotifications(db, recipient),
    });
  }
  return messages;
}
