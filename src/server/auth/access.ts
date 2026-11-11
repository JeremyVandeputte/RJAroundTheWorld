import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { Env } from "@/lib/env";

export type AccessConfig = Pick<Env, "accessToken" | "sessionSecret">;

/** Constant-time string comparison (hashing first hides the length too). */
export function safeEqual(a: string, b: string): boolean {
  const hashA = createHash("sha256").update(a).digest();
  const hashB = createHash("sha256").update(b).digest();
  return timingSafeEqual(hashA, hashB);
}

/** True when the token found in a secret link is the configured one. */
export function isValidAccessToken(token: string, config: AccessConfig): boolean {
  return safeEqual(token, config.accessToken);
}

/**
 * Value stored in the access cookie once the secret link has been opened.
 * It is derived from the token, so changing ACCESS_TOKEN invalidates every
 * existing cookie, and the token itself is never stored in the browser.
 */
export function accessCookieValue(config: AccessConfig): string {
  return createHmac("sha256", config.sessionSecret).update(`access:${config.accessToken}`).digest("base64url");
}

export function isValidAccessCookie(value: string | undefined, config: AccessConfig): boolean {
  return value !== undefined && safeEqual(value, accessCookieValue(config));
}
