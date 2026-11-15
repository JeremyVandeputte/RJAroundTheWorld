import { describe, expect, it } from "vitest";
import { EnvError, parseEnv } from "@/lib/env";

const valid = {
  SESSION_SECRET: "s".repeat(32),
  ACCESS_TOKEN: "t".repeat(32),
};

describe("parseEnv", () => {
  it("applies defaults when only the secrets are set", () => {
    const env = parseEnv(valid);
    expect(env.appOrigin).toBe("http://localhost:3000");
    expect(env.databasePath).toBe("./data/rjaroundtheworld.db");
    expect(env.mediaDir).toBe("./data/media");
    expect(env.maxPhotoBytes).toBe(20 * 1024 * 1024);
    expect(env.maxVideoBytes).toBe(300 * 1024 * 1024);
    expect(env.mediaQuotaBytes).toBe(30 * 1024 * 1024 * 1024);
    expect(env.sessionDays).toBe(30);
    expect(env.trustProxy).toBe(false);
    expect(env.secureCookies).toBe(false);
  });

  it("treats empty values as not set", () => {
    const env = parseEnv({ ...valid, MEDIA_DIR: "", MAX_PHOTO_MB: " " });
    expect(env.mediaDir).toBe("./data/media");
    expect(env.maxPhotoBytes).toBe(20 * 1024 * 1024);
  });

  it("reads custom limits and paths", () => {
    const env = parseEnv({
      ...valid,
      MAX_PHOTO_MB: "5",
      MAX_VIDEO_MB: "100",
      MEDIA_QUOTA_GB: "1",
      DATABASE_PATH: "/var/lib/rj/db.sqlite",
      TRUST_PROXY: "true",
      APP_URL: "https://example.org/some/path",
    });
    expect(env.maxPhotoBytes).toBe(5 * 1024 * 1024);
    expect(env.maxVideoBytes).toBe(100 * 1024 * 1024);
    expect(env.mediaQuotaBytes).toBe(1024 * 1024 * 1024);
    expect(env.databasePath).toBe("/var/lib/rj/db.sqlite");
    expect(env.trustProxy).toBe(true);
    expect(env.appOrigin).toBe("https://example.org");
    expect(env.secureCookies).toBe(true);
  });

  it("requires both secrets", () => {
    expect(() => parseEnv({})).toThrow(EnvError);
    expect(() => parseEnv({ SESSION_SECRET: valid.SESSION_SECRET })).toThrow(/ACCESS_TOKEN/);
    expect(() => parseEnv({ ACCESS_TOKEN: valid.ACCESS_TOKEN })).toThrow(/SESSION_SECRET/);
  });

  it("rejects short or malformed secrets without leaking their value", () => {
    const shortToken = "short-token-value";
    try {
      parseEnv({ ...valid, ACCESS_TOKEN: shortToken });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(EnvError);
      expect((error as Error).message).toContain("ACCESS_TOKEN");
      expect((error as Error).message).not.toContain(shortToken);
    }
    expect(() => parseEnv({ ...valid, ACCESS_TOKEN: "a".repeat(31) + "/" + "b" })).toThrow(/ACCESS_TOKEN/);
    expect(() => parseEnv({ ...valid, SESSION_SECRET: "too-short" })).toThrow(/SESSION_SECRET/);
  });

  it("requires https in production, except on localhost", () => {
    expect(() =>
      parseEnv({ ...valid, NODE_ENV: "production", APP_URL: "http://example.org" }),
    ).toThrow(/APP_URL/);
    expect(parseEnv({ ...valid, NODE_ENV: "production", APP_URL: "https://example.org" }).isProduction).toBe(true);
    expect(parseEnv({ ...valid, NODE_ENV: "production" }).appOrigin).toBe("http://localhost:3000");
  });

  it("rejects invalid numbers and booleans", () => {
    expect(() => parseEnv({ ...valid, MAX_PHOTO_MB: "-1" })).toThrow(/MAX_PHOTO_MB/);
    expect(() => parseEnv({ ...valid, MAX_VIDEO_MB: "abc" })).toThrow(/MAX_VIDEO_MB/);
    expect(() => parseEnv({ ...valid, TRUST_PROXY: "yes" })).toThrow(/TRUST_PROXY/);
  });
});
