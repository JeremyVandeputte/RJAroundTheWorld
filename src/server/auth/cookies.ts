import type { Env } from "@/lib/env";

/** Browsers cap cookie lifetime at 400 days. */
export const LONG_LIVED_COOKIE_SECONDS = 400 * 24 * 60 * 60;

type CookieConfig = Pick<Env, "secureCookies">;

/** Over https, the `__Host-` prefix pins cookies to this exact host. */
export function cookieNames(config: CookieConfig) {
  const prefix = config.secureCookies ? "__Host-" : "";
  return {
    access: `${prefix}rj_access`,
    session: `${prefix}rj_session`,
  };
}

export function cookieOptions(config: CookieConfig) {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: config.secureCookies,
    path: "/",
    maxAge: LONG_LIVED_COOKIE_SECONDS,
  } as const;
}
