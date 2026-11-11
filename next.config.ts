import type { NextConfig } from "next";

// Privacy requirement: no data sent to third parties. Next.js reads this
// variable after loading the config, so telemetry is off on every machine.
process.env.NEXT_TELEMETRY_DISABLED = "1";

// Sent on every response (pages, API routes, static files).
export const securityHeaders = [
  // Privacy requirement: the site must never be indexed.
  { key: "X-Robots-Tag", value: "noindex, nofollow" },
  // Only the origin is sent to third parties (OpenStreetMap tiles), never the path.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  serverExternalPackages: [
    "better-sqlite3",
    "@node-rs/argon2",
    "@zxcvbn-ts/core",
    "@zxcvbn-ts/language-common",
    "@zxcvbn-ts/language-en",
    "@zxcvbn-ts/language-fr",
  ],
  // Next.js is always started from the project folder.
  turbopack: { root: process.cwd() },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
