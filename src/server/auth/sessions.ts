import { createHmac, randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import type { Env } from "@/lib/env";
import type { Db } from "@/server/db/client";
import { sessions, users } from "@/server/db/schema";

export type SessionConfig = Pick<Env, "sessionSecret" | "sessionDays">;

/** A user as seen by the application: never includes the password hash. */
export type SessionUser = Omit<typeof users.$inferSelect, "passwordHash">;

const DAY_MS = 24 * 60 * 60 * 1000;
/** The last visit of an account is recorded at most this often. */
export const LAST_SEEN_PRECISION_MS = 5 * 60 * 1000;

export function toSessionUser(user: typeof users.$inferSelect): SessionUser {
  const { passwordHash: _passwordHash, ...rest } = user;
  return rest;
}

/** Only this keyed hash is stored: a leaked database cannot be replayed as cookies. */
function hashSessionToken(token: string, config: SessionConfig): string {
  return createHmac("sha256", config.sessionSecret).update(`session:${token}`).digest("hex");
}

export function createSession(db: Db, userId: number, config: SessionConfig, now = new Date()) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(now.getTime() + config.sessionDays * DAY_MS);
  db.insert(sessions)
    .values({ tokenHash: hashSessionToken(token, config), userId, createdAt: now, expiresAt })
    .run();
  return { token, expiresAt };
}

/**
 * Returns the user owning a session token, or null when the session is
 * unknown, expired, or belongs to a deactivated account.
 * Active sessions are extended, so they expire after `sessionDays` of inactivity,
 * and the account's last visit is recorded.
 */
export function getSessionUser(db: Db, token: string, config: SessionConfig, now = new Date()): SessionUser | null {
  const row = db
    .select({ session: sessions, user: users })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(eq(sessions.tokenHash, hashSessionToken(token, config)))
    .get();
  if (!row) return null;

  if (row.session.expiresAt.getTime() <= now.getTime()) {
    db.delete(sessions).where(eq(sessions.id, row.session.id)).run();
    return null;
  }
  if (!row.user.isActive) return null;

  // Extend at most once a day to avoid a write on every request.
  const fullLifetime = config.sessionDays * DAY_MS;
  const remaining = row.session.expiresAt.getTime() - now.getTime();
  if (remaining < fullLifetime - DAY_MS) {
    db.update(sessions)
      .set({ expiresAt: new Date(now.getTime() + fullLifetime) })
      .where(eq(sessions.id, row.session.id))
      .run();
  }

  // Last visit, shown to the superuser in the administration.
  let user = row.user;
  if (!user.lastSeenAt || now.getTime() - user.lastSeenAt.getTime() >= LAST_SEEN_PRECISION_MS) {
    db.update(users).set({ lastSeenAt: now }).where(eq(users.id, user.id)).run();
    user = { ...user, lastSeenAt: now };
  }

  return toSessionUser(user);
}

export function deleteSession(db: Db, token: string, config: SessionConfig): void {
  db.delete(sessions).where(eq(sessions.tokenHash, hashSessionToken(token, config))).run();
}

/** Logs a user out everywhere (password change, reset, deactivation). */
export function deleteUserSessions(db: Db, userId: number): void {
  db.delete(sessions).where(eq(sessions.userId, userId)).run();
}
