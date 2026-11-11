import { describe, expect, it } from "vitest";
import nextConfig, { securityHeaders } from "../next.config";
import robots from "@/app/robots";

describe("indexing is forbidden", () => {
  it("sends X-Robots-Tag on every path", async () => {
    const rules = await nextConfig.headers?.();
    expect(rules).toEqual([{ source: "/:path*", headers: securityHeaders }]);
    expect(securityHeaders).toContainEqual({ key: "X-Robots-Tag", value: "noindex, nofollow" });
  });

  it("serves a robots.txt that disallows everything and lists no URL", () => {
    const result = robots();
    expect(result.rules).toEqual({ userAgent: "*", disallow: "/" });
    expect(result.sitemap).toBeUndefined();
    expect(result.host).toBeUndefined();
  });

  it("does not expose the framework", () => {
    expect(nextConfig.poweredByHeader).toBe(false);
  });
});
