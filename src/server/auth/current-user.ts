import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { getEnv } from "@/lib/env";
import { getDb } from "@/server/db/client";
import { cookieNames, cookieOptions } from "./cookies";
import { deleteSession, getSessionUser, type SessionUser } from "./sessions";

/**
 * User of the current request, or null for an anonymous visitor.
 * Does not enforce the forced password change: use `getViewer` in pages.
 */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const env = getEnv();
  const token = (await cookies()).get(cookieNames(env).session)?.value;
  return token ? getSessionUser(getDb(), token, env) : null;
});

/**
 * Viewer of a page. Every page requires an account: an anonymous visitor is
 * sent to the login page, and a user who must choose a new password to the
 * profile page first.
 */
export async function getViewer(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.mustChangePassword) redirect("/profile");
  return user;
}

/** Same as `getViewer` (kept for readability where an account is the point). */
export const requireUser = getViewer;

export async function setSessionCookie(token: string): Promise<void> {
  const env = getEnv();
  // The cookie outlives the session on purpose: expiry is enforced server-side.
  (await cookies()).set(cookieNames(env).session, token, cookieOptions(env));
}

export async function clearSession(): Promise<void> {
  const env = getEnv();
  const store = await cookies();
  const name = cookieNames(env).session;
  const token = store.get(name)?.value;
  if (token) deleteSession(getDb(), token, env);
  store.delete(name);
}

/**
 * Client IP for rate limiting. Only trusted behind a reverse proxy
 * (TRUST_PROXY=true): the last X-Forwarded-For entry is the one it added.
 */
export async function getClientIp(): Promise<string | null> {
  if (!getEnv().trustProxy) return null;
  const forwardedFor = (await headers()).get("x-forwarded-for");
  const entries = forwardedFor?.split(",").map((entry) => entry.trim()).filter(Boolean) ?? [];
  return entries.at(-1) ?? null;
}
