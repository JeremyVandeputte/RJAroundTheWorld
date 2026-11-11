import { NextResponse, type NextRequest } from "next/server";
import { getEnv } from "@/lib/env";
import { accessCookieValue } from "@/server/auth/access";
import { cookieNames, cookieOptions } from "@/server/auth/cookies";
import { decideRequest } from "@/server/auth/request-gate";

// No `matcher`: the gate runs on every request, including static assets,
// so nothing is served without the secret link.

function neutralResponse(status: 403 | 404): Response {
  return new Response(status === 404 ? "Not Found" : "Forbidden", {
    status,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
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
    case "allow":
      return NextResponse.next();
    case "grant-access": {
      // Redirect away immediately so the token does not stay in the address bar.
      // In production the public URL is APP_URL (the request may show an
      // internal host behind the reverse proxy); otherwise keep the host in use.
      const home = new URL("/", env.isProduction ? env.appOrigin : request.url);
      const response = NextResponse.redirect(home, 303);
      response.headers.set("Cache-Control", "no-store");
      response.headers.set("X-Robots-Tag", "noindex, nofollow");
      response.cookies.set(names.access, accessCookieValue(env), cookieOptions(env));
      return response;
    }
    case "forbidden":
      return neutralResponse(403);
    case "not-found":
      return neutralResponse(404);
  }
}
