import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { createSession, deleteSession, deleteUserSessions, getSessionUser } from "@/server/auth/sessions";
import type { Db } from "@/server/db/client";
import { sessions, users } from "@/server/db/schema";
import { createTestDb } from "./helpers/test-db";
import { testEnv } from "./helpers/test-env";

const env = testEnv();
const DAY_MS = 24 * 60 * 60 * 1000;
const start = new Date("2026-11-11T10:00:00Z");
const daysLater = (days: number) => new Date(start.getTime() + days * DAY_MS);

let db: Db;
let userId: number;

beforeEach(() => {
  db = createTestDb();
  userId = db
    .insert(users)
    .values({ username: "alice", displayName: "Alice", passwordHash: "secret-hash" })
    .returning()
    .get().id;
});

describe("sessions", () => {
  it("resolves a valid token to its user, without the password hash", () => {
    const { token } = createSession(db, userId, env, start);
    const user = getSessionUser(db, token, env, start);
    expect(user).toMatchObject({ id: userId, username: "alice" });
    expect(user).not.toHaveProperty("passwordHash");
  });

  it("stores only a hash of the token", () => {
    const { token } = createSession(db, userId, env, start);
    const stored = db.select().from(sessions).get();
    expect(stored?.tokenHash).not.toBe(token);
    expect(JSON.stringify(stored)).not.toContain(token);
  });

  it("rejects unknown or tampered tokens", () => {
    const { token } = createSession(db, userId, env, start);
    expect(getSessionUser(db, "unknown", env, start)).toBeNull();
    expect(getSessionUser(db, `${token}x`, env, start)).toBeNull();
    expect(getSessionUser(db, "", env, start)).toBeNull();
  });

  it("rejects tokens when the session secret differs", () => {
    const { token } = createSession(db, userId, env, start);
    const otherSecret = testEnv({ SESSION_SECRET: "another-session-secret-0123456789abcdefg" });
    expect(getSessionUser(db, token, otherSecret, start)).toBeNull();
  });

  it("lasts about 30 days, then expires and is removed", () => {
    const { token, expiresAt } = createSession(db, userId, env, start);
    expect(expiresAt).toEqual(daysLater(30));
    expect(getSessionUser(db, token, env, daysLater(31))).toBeNull();
    expect(db.select().from(sessions).all()).toHaveLength(0);
  });

  it("is extended by activity, so it expires after 30 days of inactivity", () => {
    const { token } = createSession(db, userId, env, start);
    expect(getSessionUser(db, token, env, daysLater(20))).not.toBeNull();
    // 45 days after creation, but only 25 days after the last visit.
    expect(getSessionUser(db, token, env, daysLater(45))).not.toBeNull();
    expect(getSessionUser(db, token, env, daysLater(80))).toBeNull();
  });

  it("stops working as soon as the account is deactivated", () => {
    const { token } = createSession(db, userId, env, start);
    db.update(users).set({ isActive: false }).where(eq(users.id, userId)).run();
    expect(getSessionUser(db, token, env, start)).toBeNull();
  });

  it("logs out a single session or all sessions of a user", () => {
    const first = createSession(db, userId, env, start);
    const second = createSession(db, userId, env, start);
    deleteSession(db, first.token, env);
    expect(getSessionUser(db, first.token, env, start)).toBeNull();
    expect(getSessionUser(db, second.token, env, start)).not.toBeNull();

    createSession(db, userId, env, start);
    deleteUserSessions(db, userId);
    expect(getSessionUser(db, second.token, env, start)).toBeNull();
    expect(db.select().from(sessions).all()).toHaveLength(0);
  });
});
