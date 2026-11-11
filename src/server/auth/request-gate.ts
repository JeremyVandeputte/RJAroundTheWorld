import type { Env } from "@/lib/env";
import { isValidAccessCookie, isValidAccessToken } from "./access";

export type GateConfig = Pick<Env, "accessToken" | "sessionSecret" | "appOrigin" | "isProduction">;

export type GateInput = {
  method: string;
  pathname: string;
  /** `Origin` request header. */
  origin: string | null;
  /** `Host` request header. */
  host: string | null;
  accessCookie: string | undefined;
};

export type GateDecision =
  /** Let the request reach the application. */
  | { kind: "allow" }
  /** Valid secret link: set the access cookie and redirect to the home page. */
  | { kind: "grant-access" }
  /** No access: neutral 404, no hint that the site exists. */
  | { kind: "not-found" }
  /** Has access, but the write request comes from another origin (CSRF). */
  | { kind: "forbidden" };

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const ACCESS_LINK_PATTERN = /^\/access\/([^/]+)\/?$/;

function isSameOrigin(input: GateInput, config: GateConfig): boolean {
  if (!input.origin) return false;
  if (input.origin === config.appOrigin) return true;
  // Outside production, also accept the host the browser actually used, so
  // the site can be tested from a phone on the local network.
  if (!config.isProduction && input.host && URL.canParse(input.origin)) {
    return new URL(input.origin).host === input.host;
  }
  return false;
}

/**
 * Single entry check applied to every request before anything else runs:
 * the secret link gate first, then CSRF protection for write requests.
 */
export function decideRequest(input: GateInput, config: GateConfig): GateDecision {
  const method = input.method.toUpperCase();
  const isRead = method === "GET" || method === "HEAD";

  if (input.pathname === "/robots.txt") {
    return isRead ? { kind: "allow" } : { kind: "not-found" };
  }

  const accessLink = ACCESS_LINK_PATTERN.exec(input.pathname);
  if (accessLink) {
    const token = accessLink[1] ?? "";
    return isRead && isValidAccessToken(token, config) ? { kind: "grant-access" } : { kind: "not-found" };
  }

  if (!isValidAccessCookie(input.accessCookie, config)) {
    return { kind: "not-found" };
  }

  if (!SAFE_METHODS.has(method) && !isSameOrigin(input, config)) {
    return { kind: "forbidden" };
  }

  return { kind: "allow" };
}
