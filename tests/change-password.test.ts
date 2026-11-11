import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { verifyPassword } from "@/server/auth/password";
import { createSession, getSessionUser } from "@/server/auth/sessions";
import type { Db } from "@/server/db/client";
import { sessions, users } from "@/server/db/schema";
import { changeOwnPassword, login } from "@/server/services/auth";
import { createUser, setUserPassword } from "@/server/services/users";
import { createTestDb } from "./helpers/test-db";
import { GOOD_PASSWORD, OTHER_GOOD_PASSWORD, testEnv } from "./helpers/test-env";

const env = testEnv();

let db: Db;
let userId: number;

beforeEach(async () => {
  db = createTestDb();
  const created = await createUser(db, { username: "alice", displayName: "Alice", password: GOOD_PASSWORD });
  if (!created.ok) throw new Error(created.reason);
  userId = created.user.id;
});

const change = (overrides: Partial<{ currentPassword: string; newPassword: string; confirmation: string }> = {}) =>
  changeOwnPassword(db, env, userId, {
    currentPassword: GOOD_PASSWORD,
    newPassword: OTHER_GOOD_PASSWORD,
    confirmation: OTHER_GOOD_PASSWORD,
    ip: null,
    ...overrides,
  });

const storedUser = () => db.select().from(users).where(eq(users.id, userId)).get()!;

describe("changing one's own password", () => {
  it("requires the current password", async () => {
    expect(await change({ currentPassword: "not-the-current-one" })).toEqual({
      ok: false,
      reason: "wrong_current_password",
    });
    expect(await verifyPassword(storedUser().passwordHash, GOOD_PASSWORD)).toBe(true);
  });

  it("requires the new password to be typed twice identically", async () => {
    expect(await change({ confirmation: `${OTHER_GOOD_PASSWORD}x` })).toEqual({
      ok: false,
      reason: "confirmation_mismatch",
    });
  });

  it("applies the password rules", async () => {
    expect(await change({ newPassword: "short", confirmation: "short" })).toEqual({
      ok: false,
      reason: "password_too_short",
    });
    expect(await change({ newPassword: "password123", confirmation: "password123" })).toEqual({
      ok: false,
      reason: "password_too_common",
    });
    expect(await change({ newPassword: GOOD_PASSWORD, confirmation: GOOD_PASSWORD })).toEqual({
      ok: false,
      reason: "same_as_current",
    });
  });

  it("replaces the password", async () => {
    expect((await change()).ok).toBe(true);
    expect(await verifyPassword(storedUser().passwordHash, OTHER_GOOD_PASSWORD)).toBe(true);
    expect((await login(db, env, { username: "alice", password: GOOD_PASSWORD, ip: null })).ok).toBe(false);
    expect((await login(db, env, { username: "alice", password: OTHER_GOOD_PASSWORD, ip: null })).ok).toBe(true);
  });

  it("revokes every existing session and returns a fresh one", async () => {
    const phone = createSession(db, userId, env);
    const laptop = createSession(db, userId, env);

    const result = await change();
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(getSessionUser(db, phone.token, env)).toBeNull();
    expect(getSessionUser(db, laptop.token, env)).toBeNull();
    expect(getSessionUser(db, result.session.token, env)?.id).toBe(userId);
    expect(db.select().from(sessions).all()).toHaveLength(1);
  });

  it("lifts the forced password change", async () => {
    db.update(users).set({ mustChangePassword: true }).where(eq(users.id, userId)).run();
    expect((await change()).ok).toBe(true);
    expect(storedUser().mustChangePassword).toBe(false);
  });

  it("is rate limited like the login form", async () => {
    for (let i = 0; i < 5; i++) await change({ currentPassword: "not-the-current-one" });
    expect(await change()).toMatchObject({ ok: false, reason: "rate_limited" });
  });
});

describe("password reset by an administrator", () => {
  it("replaces the password, forces a change and revokes sessions", async () => {
    const session = createSession(db, userId, env);
    const result = await setUserPassword(db, userId, OTHER_GOOD_PASSWORD, { mustChangePassword: true });
    expect(result).toEqual({ ok: true });

    expect(getSessionUser(db, session.token, env)).toBeNull();
    expect(storedUser().mustChangePassword).toBe(true);
    const loggedIn = await login(db, env, { username: "alice", password: OTHER_GOOD_PASSWORD, ip: null });
    expect(loggedIn.ok && loggedIn.user.mustChangePassword).toBe(true);
  });

  it("applies the password rules and reports unknown users", async () => {
    expect(await setUserPassword(db, userId, "password123", { mustChangePassword: true })).toEqual({
      ok: false,
      reason: "password_too_common",
    });
    expect(await setUserPassword(db, 9999, OTHER_GOOD_PASSWORD, { mustChangePassword: true })).toEqual({
      ok: false,
      reason: "user_not_found",
    });
  });
});
