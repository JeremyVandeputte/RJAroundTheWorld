import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { LOGIN_WINDOW_MS, MAX_FAILURES_PER_IP, MAX_FAILURES_PER_USERNAME } from "@/server/auth/rate-limit";
import { getSessionUser } from "@/server/auth/sessions";
import type { Db } from "@/server/db/client";
import { loginAttempts, sessions, users } from "@/server/db/schema";
import { login } from "@/server/services/auth";
import { createUser } from "@/server/services/users";
import { createTestDb } from "./helpers/test-db";
import { GOOD_PASSWORD, testEnv } from "./helpers/test-env";

const env = testEnv();
const start = new Date("2026-11-11T10:00:00Z");
const minutesLater = (minutes: number) => new Date(start.getTime() + minutes * 60_000);

let db: Db;

beforeEach(async () => {
  db = createTestDb();
  await createUser(db, { username: "alice", displayName: "Alice", password: GOOD_PASSWORD });
});

const attempt = (overrides: Partial<{ username: string; password: string; ip: string | null }> = {}, now = start) =>
  login(db, env, { username: "alice", password: GOOD_PASSWORD, ip: null, ...overrides }, now);

describe("login", () => {
  it("opens a session with the right credentials", async () => {
    const result = await attempt();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.user).toMatchObject({ username: "alice" });
    expect(result.user).not.toHaveProperty("passwordHash");
    expect(getSessionUser(db, result.session.token, env, start)?.username).toBe("alice");
  });

  it("ignores case and surrounding spaces in the username", async () => {
    expect((await attempt({ username: "  Alice " })).ok).toBe(true);
  });

  it("gives the same answer for a wrong password, an unknown user and a deactivated account", async () => {
    const wrongPassword = await attempt({ password: "wrong-password-123" });
    const unknownUser = await attempt({ username: "nobody" });
    db.update(users).set({ isActive: false }).where(eq(users.username, "alice")).run();
    const deactivated = await attempt();

    for (const result of [wrongPassword, unknownUser, deactivated]) {
      expect(result).toEqual({ ok: false, reason: "invalid_credentials" });
    }
    expect(db.select().from(sessions).all()).toHaveLength(0);
  });

  it("refuses an empty or oversized password", async () => {
    expect((await attempt({ password: "" })).ok).toBe(false);
    expect((await attempt({ password: "x".repeat(5000) })).ok).toBe(false);
  });
});

describe("brute-force protection", () => {
  it("blocks a username after too many failures, even with the right password", async () => {
    for (let i = 0; i < MAX_FAILURES_PER_USERNAME; i++) {
      expect(await attempt({ password: `wrong-password-${i}` })).toEqual({ ok: false, reason: "invalid_credentials" });
    }
    const blocked = await attempt({}, minutesLater(1));
    expect(blocked).toMatchObject({ ok: false, reason: "rate_limited" });
    if (!blocked.ok && blocked.reason === "rate_limited") {
      expect(blocked.retryAfterMs).toBe(LOGIN_WINDOW_MS - 60_000);
    }
    // Blocked attempts are not recorded: they do not extend the block.
    expect(db.select().from(loginAttempts).all()).toHaveLength(MAX_FAILURES_PER_USERNAME);
  });

  it("does not block other usernames", async () => {
    await createUser(db, { username: "bob", displayName: "Bob", password: GOOD_PASSWORD });
    for (let i = 0; i < MAX_FAILURES_PER_USERNAME; i++) await attempt({ password: "wrong-password" });
    expect((await attempt({ username: "bob" })).ok).toBe(true);
  });

  it("lifts the block once the window has passed", async () => {
    for (let i = 0; i < MAX_FAILURES_PER_USERNAME; i++) await attempt({ password: "wrong-password" });
    expect((await attempt({}, minutesLater(14))).ok).toBe(false);
    expect((await attempt({}, minutesLater(16))).ok).toBe(true);
  });

  it("forgets previous failures after a successful login", async () => {
    for (let i = 0; i < MAX_FAILURES_PER_USERNAME - 1; i++) await attempt({ password: "wrong-password" });
    expect((await attempt()).ok).toBe(true);
    for (let i = 0; i < MAX_FAILURES_PER_USERNAME - 1; i++) await attempt({ password: "wrong-password" });
    expect((await attempt()).ok).toBe(true);
  });

  it("blocks an IP address that fails on many different usernames", async () => {
    const ip = "203.0.113.7";
    for (let i = 0; i < MAX_FAILURES_PER_IP; i++) {
      await attempt({ username: `guess-${i}`, password: "wrong-password", ip });
    }
    expect(await attempt({ ip })).toMatchObject({ ok: false, reason: "rate_limited" });
    // Another address is not affected.
    expect((await attempt({ ip: "198.51.100.1" })).ok).toBe(true);
  });
});
