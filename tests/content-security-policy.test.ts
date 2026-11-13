import { describe, expect, it } from "vitest";
import nextConfig, { securityHeaders } from "../next.config";
import {
  buildContentSecurityPolicy,
  LOCKED_DOWN_POLICY,
  MAP_TILE_ORIGIN,
  newNonce,
} from "@/server/auth/content-security-policy";

const directives = (policy: string) =>
  Object.fromEntries(
    policy.split(";").map((part) => {
      const [name = "", ...values] = part.trim().split(/\s+/);
      return [name, values];
    }),
  );

describe("content security policy", () => {
  const production = directives(buildContentSecurityPolicy({ nonce: "abc", isDevelopment: false, isHttps: true }));

  it("only runs the site's own scripts, marked with the request's nonce", () => {
    expect(production["script-src"]).toEqual(["'self'", "'nonce-abc'", "'strict-dynamic'"]);
    expect(production["script-src"]).not.toContain("'unsafe-inline'");
    expect(production["script-src"]).not.toContain("'unsafe-eval'");
    expect(production["object-src"]).toEqual(["'none'"]);
  });

  it("lets the browser contact no third party except the map tile server", () => {
    expect(production["default-src"]).toEqual(["'self'"]);
    expect(production["connect-src"]).toEqual(["'self'"]);
    expect(production["img-src"]).toEqual(["'self'", "data:", "blob:", MAP_TILE_ORIGIN]);
    expect(production["media-src"]).toEqual(["'self'", "blob:"]);
    expect(production["font-src"]).toEqual(["'self'"]);
    const thirdParties = Object.values(production)
      .flat()
      .filter((value) => value.startsWith("http"));
    expect(new Set(thirdParties)).toEqual(new Set([MAP_TILE_ORIGIN]));
  });

  it("forbids framing the site and sending forms elsewhere", () => {
    expect(production["frame-ancestors"]).toEqual(["'none'"]);
    expect(production["form-action"]).toEqual(["'self'"]);
    expect(production["base-uri"]).toEqual(["'self'"]);
  });

  it("upgrades insecure requests only over https", () => {
    expect(production["upgrade-insecure-requests"]).toEqual([]);
    const overHttp = directives(buildContentSecurityPolicy({ nonce: "abc", isDevelopment: false, isHttps: false }));
    expect(overHttp["upgrade-insecure-requests"]).toBeUndefined();
  });

  it("allows what the development server needs, and only there", () => {
    const development = directives(buildContentSecurityPolicy({ nonce: "abc", isDevelopment: true, isHttps: false }));
    expect(development["script-src"]).toContain("'unsafe-eval'");
    expect(development["connect-src"]).toEqual(["'self'", "ws:", "wss:"]);
  });

  it("generates a different, unpredictable nonce for every request", () => {
    const nonces = new Set(Array.from({ length: 50 }, newNonce));
    expect(nonces.size).toBe(50);
    for (const nonce of nonces) expect(nonce).toMatch(/^[A-Za-z0-9+/]{22}==$/);
  });

  it("locks down answers that are not pages", () => {
    expect(directives(LOCKED_DOWN_POLICY)["default-src"]).toEqual(["'none'"]);
  });
});

describe("other security headers", () => {
  it("are sent on every path", async () => {
    expect(await nextConfig.headers?.()).toEqual([{ source: "/:path*", headers: securityHeaders }]);
  });

  it("disable device features except location for the map", () => {
    const policy = securityHeaders.find((header) => header.key === "Permissions-Policy")?.value;
    expect(policy).toContain("camera=()");
    expect(policy).toContain("microphone=()");
    expect(policy).toContain("geolocation=(self)");
  });

  it("forbid framing, MIME sniffing and full referrers", () => {
    const value = (key: string) => securityHeaders.find((header) => header.key === key)?.value;
    expect(value("X-Frame-Options")).toBe("DENY");
    expect(value("X-Content-Type-Options")).toBe("nosniff");
    expect(value("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
    expect(value("Cross-Origin-Opener-Policy")).toBe("same-origin");
  });
});
