import { and, eq, gt, lt, min, count } from "drizzle-orm";
import type { Db } from "@/server/db/client";
import { loginAttempts } from "@/server/db/schema";

export const LOGIN_WINDOW_MS = 15 * 60 * 1000;
export const MAX_FAILURES_PER_USERNAME = 5;
export const MAX_FAILURES_PER_IP = 20;

const RETENTION_MS = 24 * 60 * 60 * 1000;

export type LoginAttemptKey = {
  /** Normalized (lowercase) username. */
  username: string;
  /** Client IP, or null when it cannot be known reliably. */
  ip: string | null;
};

export type LoginBlock = { blocked: false } | { blocked: true; retryAfterMs: number };

function recentFailures(db: Db, column: "username" | "ip", value: string, now: Date) {
  const since = new Date(now.getTime() - LOGIN_WINDOW_MS);
  const row = db
    .select({ total: count(), oldest: min(loginAttempts.createdAt) })
    .from(loginAttempts)
    .where(and(eq(loginAttempts[column], value), gt(loginAttempts.createdAt, since)))
    .get();
  return { total: row?.total ?? 0, oldest: row?.oldest ?? null };
}

/** Tells whether new login attempts are currently refused for this username or IP. */
export function getLoginBlock(db: Db, key: LoginAttemptKey, now = new Date()): LoginBlock {
  const checks = [{ ...recentFailures(db, "username", key.username, now), limit: MAX_FAILURES_PER_USERNAME }];
  if (key.ip) {
    checks.push({ ...recentFailures(db, "ip", key.ip, now), limit: MAX_FAILURES_PER_IP });
  }

  let retryAfterMs = 0;
  for (const check of checks) {
    if (check.total >= check.limit && check.oldest) {
      // Blocked until the oldest counted failure leaves the window.
      const oldestMs = new Date(check.oldest).getTime();
      retryAfterMs = Math.max(retryAfterMs, oldestMs + LOGIN_WINDOW_MS - now.getTime());
    }
  }
  return retryAfterMs > 0 ? { blocked: true, retryAfterMs } : { blocked: false };
}

export function recordFailedLogin(db: Db, key: LoginAttemptKey, now = new Date()): void {
  db.insert(loginAttempts).values({ username: key.username, ip: key.ip ?? "", createdAt: now }).run();
  // Housekeeping: old attempts are useless.
  db.delete(loginAttempts)
    .where(lt(loginAttempts.createdAt, new Date(now.getTime() - RETENTION_MS)))
    .run();
}

export function clearFailedLogins(db: Db, username: string): void {
  db.delete(loginAttempts).where(eq(loginAttempts.username, username)).run();
}
