import { eq } from "drizzle-orm";
import { checkPasswordPolicy, hashPassword, type PasswordIssue } from "@/server/auth/password";
import { clearFailedLogins } from "@/server/auth/rate-limit";
import { deleteUserSessions, toSessionUser, type SessionUser } from "@/server/auth/sessions";
import type { Db } from "@/server/db/client";
import { users, type UserRole } from "@/server/db/schema";

/** 3 to 30 characters: lowercase letters, digits, ".", "_" and "-". */
export const USERNAME_PATTERN = /^[a-z0-9][a-z0-9._-]{2,29}$/;
export const DISPLAY_NAME_MAX_LENGTH = 50;

export type UserInputIssue = "invalid_username" | "username_taken" | "invalid_display_name" | PasswordIssue;

export type CreateUserInput = {
  username: string;
  displayName: string;
  password: string;
  role?: UserRole;
  canPublish?: boolean;
  canComment?: boolean;
  canReact?: boolean;
  canManageTrips?: boolean;
  mustChangePassword?: boolean;
};

export type CreateUserResult = { ok: true; user: SessionUser } | { ok: false; reason: UserInputIssue };

export function normalizeUsername(username: string): string {
  return username.trim().toLowerCase();
}

export async function createUser(db: Db, input: CreateUserInput): Promise<CreateUserResult> {
  const username = normalizeUsername(input.username);
  const displayName = input.displayName.trim();

  if (!USERNAME_PATTERN.test(username)) return { ok: false, reason: "invalid_username" };
  if (displayName.length === 0 || displayName.length > DISPLAY_NAME_MAX_LENGTH) {
    return { ok: false, reason: "invalid_display_name" };
  }
  const passwordIssue = checkPasswordPolicy(input.password, [username, displayName]);
  if (passwordIssue) return { ok: false, reason: passwordIssue };

  if (db.select({ id: users.id }).from(users).where(eq(users.username, username)).get()) {
    return { ok: false, reason: "username_taken" };
  }

  const passwordHash = await hashPassword(input.password);
  const user = db
    .insert(users)
    .values({
      username,
      displayName,
      passwordHash,
      role: input.role ?? "user",
      // Schema defaults apply when a permission is not specified.
      canPublish: input.canPublish,
      canComment: input.canComment,
      canReact: input.canReact,
      canManageTrips: input.canManageTrips,
      mustChangePassword: input.mustChangePassword ?? false,
    })
    .returning()
    .get();
  return { ok: true, user: toSessionUser(user) };
}

export type SetPasswordResult = { ok: true } | { ok: false; reason: PasswordIssue | "user_not_found" };

/**
 * Stores a new password for a reset: logs the user out everywhere and lifts
 * any login block, so the new password can be used right away.
 */
export async function applyPasswordReset(
  db: Db,
  user: { id: number; username: string },
  password: string,
  options: { mustChangePassword: boolean },
): Promise<void> {
  const passwordHash = await hashPassword(password);
  db.transaction((tx) => {
    const txDb = tx as unknown as Db;
    tx.update(users)
      .set({ passwordHash, mustChangePassword: options.mustChangePassword })
      .where(eq(users.id, user.id))
      .run();
    deleteUserSessions(txDb, user.id);
    clearFailedLogins(txDb, user.username);
  });
}

/**
 * Replaces a user's password with a chosen one (checked against the rules).
 * Used for resets: the user does not need to know the current password.
 */
export async function setUserPassword(
  db: Db,
  userId: number,
  password: string,
  options: { mustChangePassword: boolean },
): Promise<SetPasswordResult> {
  const user = db.select().from(users).where(eq(users.id, userId)).get();
  if (!user) return { ok: false, reason: "user_not_found" };

  const passwordIssue = checkPasswordPolicy(password, [user.username, user.displayName]);
  if (passwordIssue) return { ok: false, reason: passwordIssue };

  await applyPasswordReset(db, user, password, options);
  return { ok: true };
}
