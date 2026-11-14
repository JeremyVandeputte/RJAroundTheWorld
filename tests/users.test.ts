import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/server/db/client";
import { users } from "@/server/db/schema";
import { createUser } from "@/server/services/users";
import { createTestDb } from "./helpers/test-db";
import { GOOD_PASSWORD } from "./helpers/test-env";

let db: Db;

beforeEach(() => {
  db = createTestDb();
});

describe("account creation", () => {
  it("creates a regular user with the default permissions", async () => {
    const result = await createUser(db, { username: "Marie", displayName: " Marie ", password: GOOD_PASSWORD });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.user).toMatchObject({
      username: "marie",
      displayName: "Marie",
      role: "user",
      canPublish: false,
      canManageTrips: false,
      mustChangePassword: false,
      isActive: true,
    });
    expect(result.user).not.toHaveProperty("passwordHash");
  });

  it("never stores the password in clear text", async () => {
    await createUser(db, { username: "marie", displayName: "Marie", password: GOOD_PASSWORD });
    const stored = db.select().from(users).get();
    expect(JSON.stringify(stored)).not.toContain(GOOD_PASSWORD);
    expect(stored?.passwordHash.startsWith("$argon2id$")).toBe(true);
  });

  it("rejects invalid usernames", async () => {
    for (const username of ["ab", "with space", "é-accent", "-dash-first", "x".repeat(31), ""]) {
      const result = await createUser(db, { username, displayName: "Name", password: GOOD_PASSWORD });
      expect(result, username).toEqual({ ok: false, reason: "invalid_username" });
    }
  });

  it("rejects duplicate usernames, ignoring case", async () => {
    await createUser(db, { username: "marie", displayName: "Marie", password: GOOD_PASSWORD });
    const duplicate = await createUser(db, { username: "MARIE", displayName: "Other", password: GOOD_PASSWORD });
    expect(duplicate).toEqual({ ok: false, reason: "username_taken" });
  });

  it("rejects empty or oversized display names", async () => {
    for (const displayName of ["", "   ", "x".repeat(51)]) {
      const result = await createUser(db, { username: "marie", displayName, password: GOOD_PASSWORD });
      expect(result).toEqual({ ok: false, reason: "invalid_display_name" });
    }
  });

  it("applies the password rules", async () => {
    const result = await createUser(db, { username: "marie", displayName: "Marie", password: "marie12345" });
    expect(result).toEqual({ ok: false, reason: "password_too_common" });
    expect(db.select().from(users).all()).toHaveLength(0);
  });

  it("creates a superuser when asked", async () => {
    const result = await createUser(db, {
      username: "admin",
      displayName: "Admin",
      password: GOOD_PASSWORD,
      role: "superuser",
      canPublish: true,
    });
    expect(result.ok && result.user).toMatchObject({ role: "superuser", canPublish: true });
  });
});
