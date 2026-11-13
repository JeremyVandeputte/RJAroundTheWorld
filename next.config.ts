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
  // Device features: only location, for "Centrer sur ma position" on the map.
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(self), payment=(), usb=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  // The Content-Security-Policy changes on every request: it is set in src/proxy.ts.
];

// Development only: other devices allowed to use the dev server, for instance
// a phone on the local network ("192.168.1.20"). Hostnames, comma-separated.
const allowedDevOrigins = (process.env.DEV_ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const nextConfig: NextConfig = {
  poweredByHeader: false,
  allowedDevOrigins,
  serverExternalPackages: [
    "better-sqlite3",
    "sharp",
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
