import { eq } from "drizzle-orm";
import {
  checkPasswordPolicy,
  getDummyPasswordHash,
  hashPassword,
  verifyPassword,
  type PasswordIssue,
} from "@/server/auth/password";
import { clearFailedLogins, getLoginBlock, recordFailedLogin } from "@/server/auth/rate-limit";
import {
  createSession,
  deleteUserSessions,
  toSessionUser,
  type SessionConfig,
  type SessionUser,
} from "@/server/auth/sessions";
import type { Db } from "@/server/db/client";
import { users } from "@/server/db/schema";
import { normalizeUsername } from "./users";

type NewSession = { token: string; expiresAt: Date };

export type LoginInput = { username: string; password: string; ip: string | null };

export type LoginResult =
  | { ok: true; user: SessionUser; session: NewSession }
  // The same reason covers unknown user, wrong password and deactivated
  // account, so the answer never reveals which accounts exist.
  | { ok: false; reason: "invalid_credentials" }
  | { ok: false; reason: "rate_limited"; retryAfterMs: number };

export async function login(
  db: Db,
  config: SessionConfig,
  input: LoginInput,
  now = new Date(),
): Promise<LoginResult> {
  const key = { username: normalizeUsername(input.username), ip: input.ip };

  const block = getLoginBlock(db, key, now);
  if (block.blocked) return { ok: false, reason: "rate_limited", retryAfterMs: block.retryAfterMs };

  const user = db.select().from(users).where(eq(users.username, key.username)).get();
  const passwordHash = user?.passwordHash ?? (await getDummyPasswordHash());
  const passwordMatches = await verifyPassword(passwordHash, input.password);

  if (!user || !passwordMatches || !user.isActive) {
    recordFailedLogin(db, key, now);
    return { ok: false, reason: "invalid_credentials" };
  }

  clearFailedLogins(db, key.username);
  return { ok: true, user: toSessionUser(user), session: createSession(db, user.id, config, now) };
}

export type ChangePasswordInput = {
  currentPassword: string;
  newPassword: string;
  confirmation: string;
  ip: string | null;
};

export type ChangePasswordResult =
  | { ok: true; session: NewSession }
  | { ok: false; reason: "wrong_current_password" | "confirmation_mismatch" | "same_as_current" | PasswordIssue }
  | { ok: false; reason: "rate_limited"; retryAfterMs: number };

/**
 * Lets a logged-in user change their own password. The current password is
 * required. On success every existing session is revoked and a fresh one is
 * returned for the device that made the change.
 */
export async function changeOwnPassword(
  db: Db,
  config: SessionConfig,
  userId: number,
  input: ChangePasswordInput,
  now = new Date(),
): Promise<ChangePasswordResult> {
  const user = db.select().from(users).where(eq(users.id, userId)).get();
  if (!user || !user.isActive) return { ok: false, reason: "wrong_current_password" };

  const key = { username: user.username, ip: input.ip };
  const block = getLoginBlock(db, key, now);
  if (block.blocked) return { ok: false, reason: "rate_limited", retryAfterMs: block.retryAfterMs };

  if (!(await verifyPassword(user.passwordHash, input.currentPassword))) {
    recordFailedLogin(db, key, now);
    return { ok: false, reason: "wrong_current_password" };
  }
  if (input.newPassword !== input.confirmation) return { ok: false, reason: "confirmation_mismatch" };
  if (input.newPassword === input.currentPassword) return { ok: false, reason: "same_as_current" };

  const passwordIssue = checkPasswordPolicy(input.newPassword, [user.username, user.displayName]);
  if (passwordIssue) return { ok: false, reason: passwordIssue };

  const passwordHash = await hashPassword(input.newPassword);
  const session = db.transaction((tx) => {
    const txDb = tx as unknown as Db;
    tx.update(users).set({ passwordHash, mustChangePassword: false }).where(eq(users.id, user.id)).run();
    deleteUserSessions(txDb, user.id);
    return createSession(txDb, user.id, config, now);
  });
  clearFailedLogins(db, user.username);
  return { ok: true, session };
}
