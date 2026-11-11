import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { createSession, getSessionUser, type SessionUser } from "@/server/auth/sessions";
import type { Db } from "@/server/db/client";
import { comments, entries, entryPeople, reactions, trips, users } from "@/server/db/schema";
import {
  adminCreateUser,
  deleteUser,
  forcePasswordChange,
  getUser,
  listUsers,
  resetUserPassword,
  setUserActive,
  updateUserPermissions,
} from "@/server/services/admin";
import { login } from "@/server/services/auth";
import { createUser } from "@/server/services/users";
import { createTestDb } from "./helpers/test-db";
import { GOOD_PASSWORD, testEnv } from "./helpers/test-env";

const env = testEnv();
const defaults = { canPublish: false, canComment: true, canReact: true, canManageTrips: false };

let db: Db;
let superuser: SessionUser;
let marie: SessionUser;
let paul: SessionUser;

async function account(username: string, extra: Partial<Parameters<typeof createUser>[1]> = {}) {
  const result = await createUser(db, { username, displayName: username, password: GOOD_PASSWORD, ...extra });
  if (!result.ok) throw new Error(result.reason);
  return result.user;
}

const stored = (id: number) => db.select().from(users).where(eq(users.id, id)).get();
const tryLogin = (username: string, password: string) => login(db, env, { username, password, ip: null });

beforeEach(async () => {
  db = createTestDb();
  superuser = await account("admin", { role: "superuser", canPublish: true });
  marie = await account("marie");
  paul = await account("paul", { canPublish: true });
});

describe("access to administration", () => {
  it("refuses every action to anyone but the superuser", async () => {
    const outsiders = [null, marie, paul, { ...superuser, mustChangePassword: true }, { ...superuser, isActive: false }];
    for (const actor of outsiders) {
      expect(listUsers(db, actor)).toEqual({ ok: false, reason: "forbidden" });
      expect(getUser(db, actor, marie.id)).toEqual({ ok: false, reason: "forbidden" });
      expect(await adminCreateUser(db, actor, { username: "new", displayName: "New", ...defaults })).toEqual({
        ok: false,
        reason: "forbidden",
      });
      expect(updateUserPermissions(db, actor, marie.id, { ...defaults, canPublish: true })).toEqual({
        ok: false,
        reason: "forbidden",
      });
      expect(setUserActive(db, actor, marie.id, false)).toEqual({ ok: false, reason: "forbidden" });
      expect(await resetUserPassword(db, actor, marie.id)).toEqual({ ok: false, reason: "forbidden" });
      expect(forcePasswordChange(db, actor, marie.id)).toEqual({ ok: false, reason: "forbidden" });
      expect(deleteUser(db, actor, marie.id)).toEqual({ ok: false, reason: "forbidden" });
    }
    // Nothing changed.
    expect(db.select().from(users).all()).toHaveLength(3);
    expect(stored(marie.id)).toMatchObject({ canPublish: false, isActive: true, mustChangePassword: false });
    expect((await tryLogin("marie", GOOD_PASSWORD)).ok).toBe(true);
  });

  it("lets a user with every permission do nothing more: only the role counts", () => {
    const powerUser = { ...paul, canPublish: true, canComment: true, canReact: true, canManageTrips: true };
    expect(listUsers(db, powerUser).ok).toBe(false);
  });

  it("protects the superuser account from administrative actions", async () => {
    expect(updateUserPermissions(db, superuser, superuser.id, defaults)).toEqual({
      ok: false,
      reason: "cannot_target_superuser",
    });
    expect(setUserActive(db, superuser, superuser.id, false).ok).toBe(false);
    expect((await resetUserPassword(db, superuser, superuser.id)).ok).toBe(false);
    expect(forcePasswordChange(db, superuser, superuser.id).ok).toBe(false);
    expect(deleteUser(db, superuser, superuser.id).ok).toBe(false);
    expect(stored(superuser.id)).toMatchObject({ role: "superuser", isActive: true, mustChangePassword: false });
  });

  it("reports unknown accounts", () => {
    expect(getUser(db, superuser, 9999)).toEqual({ ok: false, reason: "user_not_found" });
    expect(setUserActive(db, superuser, 9999, false)).toEqual({ ok: false, reason: "user_not_found" });
  });
});

describe("listing accounts", () => {
  it("lists the superuser first, never exposing password hashes", () => {
    const result = listUsers(db, superuser);
    expect(result.ok && result.users.map((u) => u.username)).toEqual(["admin", "marie", "paul"]);
    expect(JSON.stringify(result)).not.toContain("argon2");
  });
});

describe("creating an account", () => {
  it("applies the chosen permissions and generates a one-time temporary password", async () => {
    const result = await adminCreateUser(db, superuser, { username: "Lea", displayName: "Léa", ...defaults });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.user).toMatchObject({ username: "lea", role: "user", ...defaults, mustChangePassword: true });
    expect(result.temporaryPassword).toMatch(/^[a-zA-Z2-9]{4}(-[a-zA-Z2-9]{4}){3}$/);
    // Never stored in clear text.
    expect(JSON.stringify(stored(result.user.id))).not.toContain(result.temporaryPassword);

    const loggedIn = await tryLogin("lea", result.temporaryPassword);
    expect(loggedIn.ok && loggedIn.user.mustChangePassword).toBe(true);
  });

  it("generates a different password each time", async () => {
    const first = await adminCreateUser(db, superuser, { username: "one", displayName: "One", ...defaults });
    const second = await adminCreateUser(db, superuser, { username: "two", displayName: "Two", ...defaults });
    expect(first.ok && second.ok && first.temporaryPassword !== second.temporaryPassword).toBe(true);
  });

  it("can never create a second superuser", async () => {
    const result = await adminCreateUser(db, superuser, { username: "lea", displayName: "Léa", ...defaults });
    expect(result.ok && result.user.role).toBe("user");
  });

  it("validates the input", async () => {
    expect(await adminCreateUser(db, superuser, { username: "marie", displayName: "Other", ...defaults })).toEqual({
      ok: false,
      reason: "username_taken",
    });
    expect(await adminCreateUser(db, superuser, { username: "a b", displayName: "X", ...defaults })).toEqual({
      ok: false,
      reason: "invalid_username",
    });
  });
});

describe("permissions", () => {
  it("can be switched one by one", () => {
    const chosen = { canPublish: true, canComment: false, canReact: true, canManageTrips: true };
    expect(updateUserPermissions(db, superuser, marie.id, chosen)).toEqual({ ok: true });
    expect(stored(marie.id)).toMatchObject(chosen);
    expect(updateUserPermissions(db, superuser, marie.id, { ...chosen, canManageTrips: false })).toEqual({ ok: true });
    expect(stored(marie.id)).toMatchObject({ canPublish: true, canManageTrips: false });
  });

  it("take effect immediately on existing sessions", () => {
    const { token } = createSession(db, marie.id, env);
    updateUserPermissions(db, superuser, marie.id, {
      canPublish: false,
      canComment: false,
      canReact: false,
      canManageTrips: false,
    });
    expect(getSessionUser(db, token, env)).toMatchObject({ canComment: false, canReact: false });
  });
});

describe("deactivating an account", () => {
  it("closes its sessions and blocks login, until reactivated", async () => {
    const { token } = createSession(db, marie.id, env);
    expect(setUserActive(db, superuser, marie.id, false)).toEqual({ ok: true });
    expect(getSessionUser(db, token, env)).toBeNull();
    expect((await tryLogin("marie", GOOD_PASSWORD)).ok).toBe(false);

    expect(setUserActive(db, superuser, marie.id, true)).toEqual({ ok: true });
    expect((await tryLogin("marie", GOOD_PASSWORD)).ok).toBe(true);
    // The old session stays closed.
    expect(getSessionUser(db, token, env)).toBeNull();
  });
});

describe("resetting a password", () => {
  it("replaces it with a temporary one, closes sessions and forces a change", async () => {
    const { token } = createSession(db, marie.id, env);
    const result = await resetUserPassword(db, superuser, marie.id);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.username).toBe("marie");
    expect(getSessionUser(db, token, env)).toBeNull();
    expect((await tryLogin("marie", GOOD_PASSWORD)).ok).toBe(false);
    const loggedIn = await tryLogin("marie", result.temporaryPassword);
    expect(loggedIn.ok && loggedIn.user.mustChangePassword).toBe(true);
    expect(JSON.stringify(stored(marie.id))).not.toContain(result.temporaryPassword);
  });

  it("lifts a login block", async () => {
    for (let i = 0; i < 5; i++) await tryLogin("marie", `bad-guess-${i}`);
    const result = await resetUserPassword(db, superuser, marie.id);
    expect(result.ok && (await tryLogin("marie", result.temporaryPassword)).ok).toBe(true);
  });
});

describe("forcing a password change", () => {
  it("keeps the password but flags the account, including on open sessions", async () => {
    const { token } = createSession(db, marie.id, env);
    expect(forcePasswordChange(db, superuser, marie.id)).toEqual({ ok: true });
    expect(getSessionUser(db, token, env)?.mustChangePassword).toBe(true);
    const loggedIn = await tryLogin("marie", GOOD_PASSWORD);
    expect(loggedIn.ok && loggedIn.user.mustChangePassword).toBe(true);
  });
});

describe("deleting an account", () => {
  let entryId: number;

  beforeEach(() => {
    const tripId = db
      .insert(trips)
      .values({ slug: "martinique", title: "Martinique", startDate: "2026-11-01", endDate: "2027-01-31" })
      .returning()
      .get().id;
    entryId = db
      .insert(entries)
      .values({ tripId, authorId: paul.id, date: "2026-11-11", title: "Day one", status: "published" })
      .returning()
      .get().id;
  });

  const comment = (authorId: number, body: string, parentId?: number) =>
    db.insert(comments).values({ entryId, authorId, body, parentId }).returning().get().id;

  it("is refused for an account that wrote entries", () => {
    expect(deleteUser(db, superuser, paul.id)).toEqual({ ok: false, reason: "has_entries" });
    expect(stored(paul.id)).toBeDefined();
  });

  it("removes the account with its sessions, reactions and tags", async () => {
    const { token } = createSession(db, marie.id, env);
    db.insert(reactions).values({ userId: marie.id, entryId, type: "love" }).run();
    db.insert(entryPeople).values({ entryId, userId: marie.id }).run();

    expect(deleteUser(db, superuser, marie.id)).toEqual({ ok: true });

    expect(stored(marie.id)).toBeUndefined();
    expect(getSessionUser(db, token, env)).toBeNull();
    expect(db.select().from(reactions).all()).toHaveLength(0);
    expect(db.select().from(entryPeople).all()).toHaveLength(0);
    expect((await tryLogin("marie", GOOD_PASSWORD)).ok).toBe(false);
  });

  it("removes its comments but keeps threads that have replies from others", () => {
    const alone = comment(marie.id, "Marie, no replies");
    const withReply = comment(marie.id, "Marie, with a reply");
    const paulReply = comment(paul.id, "Paul replies", withReply);
    const paulComment = comment(paul.id, "Paul");
    const marieReply = comment(marie.id, "Marie replies", paulComment);
    const ownThread = comment(marie.id, "Marie, only her own reply");
    comment(marie.id, "Marie replies to herself", ownThread);

    expect(deleteUser(db, superuser, marie.id)).toEqual({ ok: true });

    const remaining = db.select().from(comments).all();
    expect(remaining.map((c) => c.id).sort()).toEqual([withReply, paulReply, paulComment].sort());
    expect(remaining.some((c) => c.id === alone || c.id === marieReply || c.id === ownThread)).toBe(false);

    const placeholder = remaining.find((c) => c.id === withReply);
    expect(placeholder).toMatchObject({ authorId: null, body: "" });
    expect(placeholder?.deletedAt).toBeInstanceOf(Date);
    // Paul's content is untouched.
    expect(remaining.find((c) => c.id === paulReply)).toMatchObject({ authorId: paul.id, body: "Paul replies" });
  });
});
