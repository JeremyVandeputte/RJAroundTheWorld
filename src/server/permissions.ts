import type { SessionUser } from "@/server/auth/sessions";
import type { EntryStatus } from "@/server/db/schema";

/**
 * Permission matrix: the single source of truth for "who can do what".
 * Every service calls these functions before reading or changing data;
 * the interface only uses them to hide what would be refused anyway.
 *
 *                          anonymous  user   +Publier  superuser
 *   see a visible trip        yes     yes      yes       yes
 *   see a hidden trip         no      no       yes       yes
 *   see a published entry     (same as its trip)
 *   see a draft               no      own      own       yes
 *   create an entry           no      no       yes       yes
 *   edit / delete an entry    no      no       own       yes
 *   see comments, reactions   no      yes      yes       yes
 *   comment                   no      if Commenter       yes
 *   edit / delete a comment   no      own, if Commenter  yes
 *   react                     no      if Réagir          yes
 *   manage users and trips    no      no       no        yes
 *
 * "anonymous" is a visitor who only has the secret link.
 */

export type PermissionUser = Pick<
  SessionUser,
  "id" | "role" | "canPublish" | "canComment" | "canReact" | "isActive" | "mustChangePassword"
>;

/** The person making a request: a user, or null for an anonymous visitor. */
export type Actor = PermissionUser | null;

export type TripAccess = { isVisible: boolean };
export type EntryAccess = { authorId: number; status: EntryStatus };
export type CommentAccess = { authorId: number | null; deletedAt: Date | null };

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

/** Creating trips, editing them and changing their visibility. */
export function canManageTrips(actor: Actor): boolean {
  return isSuperuser(effectiveUser(actor));
}

export function canViewTrip(actor: Actor, trip: TripAccess): boolean {
  if (trip.isVisible) return true;
  const user = effectiveUser(actor);
  return user !== null && (isSuperuser(user) || user.canPublish);
}

/** Also governs the entry's media and its place on the map. */
export function canViewEntry(actor: Actor, trip: TripAccess, entry: EntryAccess): boolean {
  if (!canViewTrip(actor, trip)) return false;
  if (entry.status === "published") return true;
  const user = effectiveUser(actor);
  return user !== null && (isSuperuser(user) || entry.authorId === user.id);
}

export function canCreateEntry(actor: Actor, trip: TripAccess): boolean {
  const user = effectiveUser(actor);
  return user !== null && (isSuperuser(user) || user.canPublish) && canViewTrip(actor, trip);
}

/** Saving, publishing, unpublishing, deleting an entry and managing its media. */
export function canEditEntry(actor: Actor, trip: TripAccess, entry: EntryAccess): boolean {
  const user = effectiveUser(actor);
  if (user === null) return false;
  if (isSuperuser(user)) return true;
  return user.canPublish && entry.authorId === user.id && canViewTrip(actor, trip);
}

/** Comments and reactions (including counts) are only shown to logged-in users. */
export function canViewSocial(actor: Actor, trip: TripAccess, entry: EntryAccess): boolean {
  return effectiveUser(actor) !== null && entry.status === "published" && canViewEntry(actor, trip, entry);
}

/** Posting a comment or a reply. */
export function canComment(actor: Actor, trip: TripAccess, entry: EntryAccess): boolean {
  const user = effectiveUser(actor);
  return user !== null && (isSuperuser(user) || user.canComment) && canViewSocial(actor, trip, entry);
}

function canChangeComment(actor: Actor, trip: TripAccess, entry: EntryAccess, comment: CommentAccess): boolean {
  const user = effectiveUser(actor);
  if (user === null || comment.deletedAt !== null || !canViewSocial(actor, trip, entry)) return false;
  return isSuperuser(user) || (user.canComment && comment.authorId === user.id);
}

export const canEditComment = canChangeComment;
export const canDeleteComment = canChangeComment;

/** Reacting to an entry or to one of its comments. */
export function canReact(actor: Actor, trip: TripAccess, entry: EntryAccess): boolean {
  const user = effectiveUser(actor);
  return user !== null && (isSuperuser(user) || user.canReact) && canViewSocial(actor, trip, entry);
}

/**
 * Whether a notification about an entry may be created for this user.
 * A pending password change does not matter here: the notification will be
 * waiting once the password has been changed.
 */
export function canBeNotifiedAbout(recipient: PermissionUser, trip: TripAccess, entry: EntryAccess): boolean {
  return canViewSocial({ ...recipient, mustChangePassword: false }, trip, entry);
}
