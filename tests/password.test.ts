import { describe, expect, it } from "vitest";
import { checkPasswordPolicy, hashPassword, verifyPassword } from "@/server/auth/password";
import { GOOD_PASSWORD } from "./helpers/test-env";

describe("password policy", () => {
  it("requires at least 10 characters", () => {
    expect(checkPasswordPolicy("Xk9!rT2#q")).toBe("password_too_short");
    expect(checkPasswordPolicy("")).toBe("password_too_short");
  });

  it("refuses very long passwords", () => {
    expect(checkPasswordPolicy("a1B!".repeat(60))).toBe("password_too_long");
  });

  it("refuses common passwords and obvious patterns", () => {
    const weak = [
      "password123",
      "azertyuiop",
      "qwertyuiop",
      "1234567890",
      "motdepasse",
      "iloveyou123",
      "aaaaaaaaaaaa",
      "abcabcabcabc",
      "bonjour12345",
    ];
    for (const password of weak) {
      expect(checkPasswordPolicy(password), password).toBe("password_too_common");
    }
  });

  it("refuses passwords built on the username, the display name or the site name", () => {
    expect(checkPasswordPolicy("jeremy.v2026", ["jeremy.v", "Jérémy"])).toBe("password_too_common");
    expect(checkPasswordPolicy("rjaroundtheworld")).toBe("password_too_common");
    expect(checkPasswordPolicy("RJ Around The World")).toBe("password_too_common");
  });

  it("accepts strong passwords", () => {
    for (const password of [GOOD_PASSWORD, "tR8#kfw2!Lq9zP", "Volcan-Pelee-2026!"]) {
      expect(checkPasswordPolicy(password), password).toBeNull();
    }
  });
});

describe("password hashing", () => {
  it("stores an argon2id hash, never the password", async () => {
    const hash = await hashPassword(GOOD_PASSWORD);
    expect(hash.startsWith("$argon2id$")).toBe(true);
    expect(hash).not.toContain(GOOD_PASSWORD);
    // Salted: hashing twice gives two different values.
    expect(await hashPassword(GOOD_PASSWORD)).not.toBe(hash);
  });

  it("verifies the right password only", async () => {
    const hash = await hashPassword(GOOD_PASSWORD);
    expect(await verifyPassword(hash, GOOD_PASSWORD)).toBe(true);
    expect(await verifyPassword(hash, `${GOOD_PASSWORD}x`)).toBe(false);
    expect(await verifyPassword(hash, "")).toBe(false);
    expect(await verifyPassword("not-a-hash", GOOD_PASSWORD)).toBe(false);
  });
});
