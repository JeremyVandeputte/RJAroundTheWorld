import type { SessionUser } from "@/server/auth/sessions";
import type { EntryStatus } from "@/server/db/schema";

/**
 * Permission matrix: the single source of truth for "who can do what".
 * Every service calls these functions before reading or changing data;
 * the interface only uses them to hide what would be refused anyway.
 *
 * Two independent switches per user: Publier and Gérer les voyages. "anonymous" is a visitor who only has the secret link:
 * they can reach the login page and nothing else.
 *
 *                              anonymous   user              superuser
 *   see a visible trip            no       yes                 yes
 *   see a hidden trip             no       its author only     yes
 *   see a published entry         (same as its trip)
 *   see a draft                   no       its author only     yes
 *   create an entry               no       if Publier (*)      yes
 *   edit / delete an entry        no       own, if Publier (*) yes
 *   create a trip                 no       if Gérer les voyages yes
 *   edit / hide / delete a trip   no       own, if Gérer les voyages  yes
 *   manage users                  no       no                  yes
 *
 * (*) only in trips the user can see.
 */

export type PermissionUser = Pick<
  SessionUser,
  "id" | "role" | "canPublish" | "canManageTrips" | "isActive" | "mustChangePassword"
>;

/** The person making a request: a user, or null for an anonymous visitor. */
export type Actor = PermissionUser | null;

export type TripAccess = { isVisible: boolean; authorId: number | null };
export type EntryAccess = { authorId: number; status: EntryStatus };

/**
 * A deactivated account, or one that must first choose a new password,
 * has no more rights than an anonymous visitor.
 */
function effectiveUser(actor: Actor): PermissionUser | null {
  return actor && actor.isActive && !actor.mustChangePassword ? actor : null;
}

function isSuperuser(user: PermissionUser | null): boolean {
  return user?.role === "superuser";
}

export function canManageUsers(actor: Actor): boolean {
  return isSuperuser(effectiveUser(actor));
}

/** Any usable account (logged in, active, password not waiting to be changed). */
export function canUseSite(actor: Actor): boolean {
  return effectiveUser(actor) !== null;
}

/** Renaming and deleting tags, which affects every entry using them. */
export function canManageTags(actor: Actor): boolean {
  return isSuperuser(effectiveUser(actor));
}

export function canCreateTrip(actor: Actor): boolean {
  const user = effectiveUser(actor);
  return user !== null && (isSuperuser(user) || user.canManageTrips);
}

/**
 * Editing a trip, changing its visibility and deleting it (with its
 * entries): reserved to the user who created it, and to the superuser.
 */
export function canEditTrip(actor: Actor, trip: TripAccess): boolean {
  const user = effectiveUser(actor);
  if (user === null) return false;
  return isSuperuser(user) || (user.canManageTrips && trip.authorId === user.id);
}

/** Downloading a trip as an archive: the same people who manage it. */
export function canExportTrip(actor: Actor, trip: TripAccess): boolean {
  return canEditTrip(actor, trip);
}

/**
 * Nothing can be read without being logged in. A visible trip is open to
 * every account; a hidden trip exists only for the user who created it and
 * for the superuser.
 */
export function canViewTrip(actor: Actor, trip: TripAccess): boolean {
  const user = effectiveUser(actor);
  if (user === null) return false;
  return trip.isVisible || isSuperuser(user) || trip.authorId === user.id;
}

/** Also governs the entry's media and its place on the map. */
export function canViewEntry(actor: Actor, trip: TripAccess, entry: EntryAccess): boolean {
  if (!canViewTrip(actor, trip)) return false;
  if (entry.status === "published") return true;
  const user = effectiveUser(actor);
  return user !== null && (isSuperuser(user) || entry.authorId === user.id);
}

/** Whether the actor may write journal entries at all (superuser or Publier). */
export function canWriteEntries(actor: Actor): boolean {
  const user = effectiveUser(actor);
  return user !== null && (isSuperuser(user) || user.canPublish);
}

export function canCreateEntry(actor: Actor, trip: TripAccess): boolean {
  return canWriteEntries(actor) && canViewTrip(actor, trip);
}

/** Saving, publishing, unpublishing, deleting an entry and managing its media. */
export function canEditEntry(actor: Actor, trip: TripAccess, entry: EntryAccess): boolean {
  const user = effectiveUser(actor);
  if (user === null) return false;
  if (isSuperuser(user)) return true;
  return user.canPublish && entry.authorId === user.id && canViewTrip(actor, trip);
}

/** Notifications about an entry: only for logged-in users, about published entries they can see. */
export function canReadEntryNotification(actor: Actor, trip: TripAccess, entry: EntryAccess): boolean {
  return effectiveUser(actor) !== null && entry.status === "published" && canViewEntry(actor, trip, entry);
}

/**
 * Whether a notification about an entry may be created for this user.
 * A pending password change does not matter here: the notification will be
 * waiting once the password has been changed.
 */
export function canBeNotifiedAbout(recipient: PermissionUser, trip: TripAccess, entry: EntryAccess): boolean {
  return canReadEntryNotification({ ...recipient, mustChangePassword: false }, trip, entry);
}

/** Same as `canBeNotifiedAbout`, for a notification about a trip as a whole. */
export function canBeNotifiedAboutTrip(recipient: PermissionUser, trip: TripAccess): boolean {
  return recipient.isActive && canViewTrip({ ...recipient, mustChangePassword: false }, trip);
}

/** Notifications are only shown to logged-in users, about trips they can see. */
export function canReadTripNotification(actor: Actor, trip: TripAccess): boolean {
  return effectiveUser(actor) !== null && canViewTrip(actor, trip);
}
