import { and, asc, count, desc, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { generateTemporaryPassword } from "@/server/auth/password";
import { clearFailedLogins } from "@/server/auth/rate-limit";
import { deleteUserSessions, toSessionUser, type SessionUser } from "@/server/auth/sessions";
import type { Db } from "@/server/db/client";
import { comments, entries, media, users } from "@/server/db/schema";
import { canManageUsers, type Actor } from "@/server/permissions";
import { applyPasswordReset, createUser, type UserInputIssue } from "./users";

// Account administration. Every function checks the permission matrix first.

type Refused<Reason extends string> = { ok: false; reason: Reason };
type Forbidden = Refused<"forbidden">;
type TargetIssue = "forbidden" | "user_not_found" | "cannot_target_superuser";

export type UserPermissions = {
  canPublish: boolean;
  canComment: boolean;
  canReact: boolean;
  canManageTrips: boolean;
};

export function listUsers(db: Db, actor: Actor): { ok: true; users: SessionUser[] } | Forbidden {
  if (!canManageUsers(actor)) return { ok: false, reason: "forbidden" };
  const rows = db
    .select()
    .from(users)
    // Superuser first, then alphabetical.
    .orderBy(desc(eq(users.role, "superuser")), asc(sql`lower(${users.displayName})`))
    .all();
  return { ok: true, users: rows.map(toSessionUser) };
}

export function getUser(db: Db, actor: Actor, userId: number): { ok: true; user: SessionUser } | Refused<"forbidden" | "user_not_found"> {
  if (!canManageUsers(actor)) return { ok: false, reason: "forbidden" };
  const user = db.select().from(users).where(eq(users.id, userId)).get();
  return user ? { ok: true, user: toSessionUser(user) } : { ok: false, reason: "user_not_found" };
}

/**
 * Loads the account an administrative action applies to. The superuser
 * account is never a valid target: it is managed from the profile page and
 * the create-superuser script, so it can never lock itself out.
 */
function findTarget(db: Db, actor: Actor, userId: number): { ok: true; user: typeof users.$inferSelect } | Refused<TargetIssue> {
  if (!canManageUsers(actor)) return { ok: false, reason: "forbidden" };
  const user = db.select().from(users).where(eq(users.id, userId)).get();
  if (!user) return { ok: false, reason: "user_not_found" };
  if (user.role === "superuser") return { ok: false, reason: "cannot_target_superuser" };
  return { ok: true, user };
}

export type AdminCreateUserInput = { username: string; displayName: string } & UserPermissions;

export type AdminCreateUserResult =
  | { ok: true; user: SessionUser; temporaryPassword: string }
  | Refused<"forbidden" | UserInputIssue>;

/**
 * Creates a regular account with a generated temporary password. The
 * password is returned once and never stored in clear text; the user must
 * choose their own at first login.
 */
export async function adminCreateUser(db: Db, actor: Actor, input: AdminCreateUserInput): Promise<AdminCreateUserResult> {
  if (!canManageUsers(actor)) return { ok: false, reason: "forbidden" };
  const temporaryPassword = generateTemporaryPassword();
  const result = await createUser(db, {
    username: input.username,
    displayName: input.displayName,
    password: temporaryPassword,
    role: "user",
    canPublish: input.canPublish,
    canComment: input.canComment,
    canReact: input.canReact,
    canManageTrips: input.canManageTrips,
    mustChangePassword: true,
  });
  return result.ok ? { ok: true, user: result.user, temporaryPassword } : result;
}

export function updateUserPermissions(
  db: Db,
  actor: Actor,
  userId: number,
  permissions: UserPermissions,
): { ok: true } | Refused<TargetIssue> {
  const target = findTarget(db, actor, userId);
  if (!target.ok) return target;
  db.update(users)
    .set({
      canPublish: permissions.canPublish,
      canComment: permissions.canComment,
      canReact: permissions.canReact,
      canManageTrips: permissions.canManageTrips,
    })
    .where(eq(users.id, userId))
    .run();
  return { ok: true };
}

/** Deactivating an account also logs it out everywhere. */
export function setUserActive(db: Db, actor: Actor, userId: number, isActive: boolean): { ok: true } | Refused<TargetIssue> {
  const target = findTarget(db, actor, userId);
  if (!target.ok) return target;
  db.transaction((tx) => {
    tx.update(users).set({ isActive }).where(eq(users.id, userId)).run();
    if (!isActive) deleteUserSessions(tx as unknown as Db, userId);
  });
  return { ok: true };
}

export type ResetPasswordResult = { ok: true; username: string; temporaryPassword: string } | Refused<TargetIssue>;

/**
 * Replaces a forgotten password with a temporary one, returned once.
 * Existing sessions are closed and a new password must be chosen at next login.
 */
export async function resetUserPassword(db: Db, actor: Actor, userId: number): Promise<ResetPasswordResult> {
  const target = findTarget(db, actor, userId);
  if (!target.ok) return target;
  const temporaryPassword = generateTemporaryPassword();
  await applyPasswordReset(db, target.user, temporaryPassword, { mustChangePassword: true });
  return { ok: true, username: target.user.username, temporaryPassword };
}

/** The user keeps their password but must choose a new one before using the site again. */
export function forcePasswordChange(db: Db, actor: Actor, userId: number): { ok: true } | Refused<TargetIssue> {
  const target = findTarget(db, actor, userId);
  if (!target.ok) return target;
  db.update(users).set({ mustChangePassword: true }).where(eq(users.id, userId)).run();
  return { ok: true };
}

/**
 * Deletes an account with its comments and reactions. Comments that have
 * replies are kept as "deleted" placeholders so threads stay readable.
 * An account that wrote entries cannot be deleted: deactivate it instead.
 */
export function deleteUser(db: Db, actor: Actor, userId: number): { ok: true } | Refused<TargetIssue | "has_entries"> {
  const target = findTarget(db, actor, userId);
  if (!target.ok) return target;

  const authored = db.select({ total: count() }).from(entries).where(eq(entries.authorId, userId)).get();
  const uploaded = db.select({ total: count() }).from(media).where(eq(media.uploaderId, userId)).get();
  if ((authored?.total ?? 0) > 0 || (uploaded?.total ?? 0) > 0) return { ok: false, reason: "has_entries" };

  db.transaction((tx) => {
    // Replies never have replies of their own: remove them first.
    tx.delete(comments).where(and(eq(comments.authorId, userId), isNotNull(comments.parentId))).run();

    const hasReplies = sql`exists (select 1 from comments as reply where reply.parent_id = comments.id)`;
    tx.update(comments)
      .set({ body: "", deletedAt: new Date() })
      .where(and(eq(comments.authorId, userId), isNull(comments.deletedAt), hasReplies))
      .run();
    tx.delete(comments).where(and(eq(comments.authorId, userId), sql`not ${hasReplies}`)).run();

    clearFailedLogins(tx as unknown as Db, target.user.username);
    // Cascades: sessions, reactions, notifications, tags in entries.
    // Remaining placeholder comments keep their row with a null author.
    tx.delete(users).where(eq(users.id, userId)).run();
  });
  return { ok: true };
}
