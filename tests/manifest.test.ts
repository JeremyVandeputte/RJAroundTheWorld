import { existsSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/app.webmanifest/route";
import { resetEnvCache } from "@/lib/env";
import { TEST_ACCESS_TOKEN } from "./helpers/test-env";

describe("application manifest", () => {
  beforeAll(() => {
    vi.stubEnv("SESSION_SECRET", "test-session-secret-0123456789abcdefghij");
    vi.stubEnv("ACCESS_TOKEN", TEST_ACCESS_TOKEN);
    vi.stubEnv("APP_URL", "http://localhost:3000");
    resetEnvCache();
  });
  afterAll(() => {
    vi.unstubAllEnvs();
    resetEnvCache();
  });

  it("describes an installable, full screen application", async () => {
    const response = GET();
    expect(response.headers.get("Content-Type")).toContain("application/manifest+json");
    const manifest = await response.json();
    expect(manifest).toMatchObject({ id: "/", name: "RJ Around The World", short_name: "RJ", display: "standalone", lang: "fr" });
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });

  it("starts on the secret link, so an installed application always gets the access cookie", async () => {
    const manifest = await GET().json();
    expect(manifest.start_url).toBe(`/access/${TEST_ACCESS_TOKEN}`);
  });

  it("lists icons that exist, including a maskable one", async () => {
    const { icons } = (await GET().json()) as { icons: { src: string; sizes: string; purpose: string }[] };
    expect(icons.map((icon) => icon.sizes)).toEqual(expect.arrayContaining(["192x192", "512x512"]));
    expect(icons.some((icon) => icon.purpose === "maskable")).toBe(true);
    for (const icon of icons) expect(existsSync(path.join(process.cwd(), "public", icon.src))).toBe(true);
  });
});
