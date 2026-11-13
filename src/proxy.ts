import { NextResponse, type NextRequest } from "next/server";
import { getEnv } from "@/lib/env";
import { accessCookieValue } from "@/server/auth/access";
import {
  buildContentSecurityPolicy,
  LOCKED_DOWN_POLICY,
  newNonce,
} from "@/server/auth/content-security-policy";
import { cookieNames, cookieOptions } from "@/server/auth/cookies";
import { decideRequest } from "@/server/auth/request-gate";

// No `matcher`: the gate runs on every request, including static assets,
// so nothing is served without the secret link.

const ONE_YEAR_SECONDS = 365 * 24 * 60 * 60;

/** Headers added to every answer, whatever the decision. */
function protect(response: Response, policy: string): Response {
  const env = getEnv();
  response.headers.set("Content-Security-Policy", policy);
  response.headers.set("X-Robots-Tag", "noindex, nofollow");
  // Browsers remember to use https only (production over https).
  if (env.isProduction && env.secureCookies) {
    response.headers.set("Strict-Transport-Security", `max-age=${ONE_YEAR_SECONDS}`);
  }
  return response;
}

function neutralResponse(status: 403 | 404): Response {
  return protect(
    new Response(status === 404 ? "Not Found" : "Forbidden", {
      status,
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
    }),
    LOCKED_DOWN_POLICY,
  );
}

export function proxy(request: NextRequest) {
  const env = getEnv();
  const names = cookieNames(env);

  const decision = decideRequest(
    {
      method: request.method,
      pathname: request.nextUrl.pathname,
      origin: request.headers.get("origin"),
      host: request.headers.get("host"),
      accessCookie: request.cookies.get(names.access)?.value,
    },
    env,
  );

  switch (decision.kind) {
    case "allow": {
      // A fresh nonce per request; Next.js reads it from the request header
      // and adds it to the scripts of the page.
      const policy = buildContentSecurityPolicy({
        nonce: newNonce(),
        isDevelopment: env.nodeEnv === "development",
        isHttps: env.secureCookies,
      });
      const requestHeaders = new Headers(request.headers);
      requestHeaders.set("Content-Security-Policy", policy);
      return protect(NextResponse.next({ request: { headers: requestHeaders } }), policy);
    }
    case "grant-access": {
      // Redirect away immediately so the token does not stay in the address bar.
      // In production the public URL is APP_URL (the request may show an
      // internal host behind the reverse proxy); otherwise keep the host in use.
      const home = new URL("/", env.isProduction ? env.appOrigin : request.url);
      const response = NextResponse.redirect(home, 303);
      response.headers.set("Cache-Control", "no-store");
      response.cookies.set(names.access, accessCookieValue(env), cookieOptions(env));
      return protect(response, LOCKED_DOWN_POLICY);
    }
    case "forbidden":
      return neutralResponse(403);
    case "not-found":
      return neutralResponse(404);
  }
}
