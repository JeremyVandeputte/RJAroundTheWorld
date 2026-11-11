import { describe, expect, it } from "vitest";
import { accessCookieValue, isValidAccessCookie, isValidAccessToken } from "@/server/auth/access";
import { cookieNames, cookieOptions } from "@/server/auth/cookies";
import { decideRequest, type GateInput } from "@/server/auth/request-gate";
import { TEST_ACCESS_TOKEN, testEnv } from "./helpers/test-env";

const env = testEnv();
const validCookie = accessCookieValue(env);

function request(overrides: Partial<GateInput> = {}): GateInput {
  return {
    method: "GET",
    pathname: "/",
    origin: null,
    host: "localhost:3000",
    accessCookie: undefined,
    ...overrides,
  };
}

describe("secret link", () => {
  it("grants access for the exact token only", () => {
    expect(decideRequest(request({ pathname: `/access/${TEST_ACCESS_TOKEN}` }), env)).toEqual({ kind: "grant-access" });
    expect(decideRequest(request({ pathname: `/access/${TEST_ACCESS_TOKEN}/` }), env)).toEqual({ kind: "grant-access" });
  });

  it("answers 404 for a wrong, partial or malformed token", () => {
    const wrongPaths = [
      "/access/wrong-token",
      `/access/${TEST_ACCESS_TOKEN.slice(0, -1)}`,
      `/access/${TEST_ACCESS_TOKEN}x`,
      `/access/${TEST_ACCESS_TOKEN.toUpperCase()}`,
      "/access/",
      "/access",
      `/access/${TEST_ACCESS_TOKEN}/extra`,
    ];
    for (const pathname of wrongPaths) {
      expect(decideRequest(request({ pathname }), env), pathname).toEqual({ kind: "not-found" });
    }
  });

  it("only accepts the link as a read request", () => {
    const decision = decideRequest(
      request({ method: "POST", pathname: `/access/${TEST_ACCESS_TOKEN}`, origin: env.appOrigin }),
      env,
    );
    expect(decision).toEqual({ kind: "not-found" });
  });

  it("compares tokens exactly", () => {
    expect(isValidAccessToken(TEST_ACCESS_TOKEN, env)).toBe(true);
    expect(isValidAccessToken("", env)).toBe(false);
    expect(isValidAccessToken(`${TEST_ACCESS_TOKEN} `, env)).toBe(false);
  });
});

describe("without the access cookie", () => {
  it("shows nothing: every path answers a neutral 404", () => {
    const paths = ["/", "/login", "/profile", "/admin", "/trips/martinique", "/api/media/abc", "/_next/static/chunk.js"];
    for (const pathname of paths) {
      expect(decideRequest(request({ pathname }), env), pathname).toEqual({ kind: "not-found" });
    }
  });

  it("answers 404 to write requests too, never 403", () => {
    const decision = decideRequest(request({ method: "POST", pathname: "/login", origin: "https://evil.example" }), env);
    expect(decision).toEqual({ kind: "not-found" });
  });

  it("still serves robots.txt, read-only", () => {
    expect(decideRequest(request({ pathname: "/robots.txt" }), env)).toEqual({ kind: "allow" });
    expect(decideRequest(request({ method: "POST", pathname: "/robots.txt" }), env)).toEqual({ kind: "not-found" });
  });

  it("rejects forged cookie values", () => {
    const forged = [TEST_ACCESS_TOKEN, "", "1", "true", validCookie.slice(0, -1), `${validCookie}x`];
    for (const accessCookie of forged) {
      expect(decideRequest(request({ accessCookie }), env), accessCookie).toEqual({ kind: "not-found" });
    }
  });
});

describe("with the access cookie", () => {
  it("lets read requests through", () => {
    for (const pathname of ["/", "/login", "/_next/static/chunk.js"]) {
      expect(decideRequest(request({ pathname, accessCookie: validCookie }), env)).toEqual({ kind: "allow" });
    }
  });

  it("never stores the token itself in the cookie", () => {
    expect(validCookie).not.toContain(TEST_ACCESS_TOKEN);
  });

  it("stops working when the token or the secret changes", () => {
    const rotatedToken = testEnv({ ACCESS_TOKEN: "another-access-token-0123456789abcdefghij" });
    const rotatedSecret = testEnv({ SESSION_SECRET: "another-session-secret-0123456789abcdefg" });
    expect(isValidAccessCookie(validCookie, env)).toBe(true);
    expect(isValidAccessCookie(validCookie, rotatedToken)).toBe(false);
    expect(isValidAccessCookie(validCookie, rotatedSecret)).toBe(false);
    expect(decideRequest(request({ accessCookie: validCookie }), rotatedToken)).toEqual({ kind: "not-found" });
  });
});

describe("CSRF protection on write requests", () => {
  const write = (overrides: Partial<GateInput>) =>
    request({ method: "POST", pathname: "/login", accessCookie: validCookie, ...overrides });

  it("accepts requests coming from the site itself", () => {
    expect(decideRequest(write({ origin: "http://localhost:3000" }), env)).toEqual({ kind: "allow" });
  });

  it("refuses requests from another origin or without origin", () => {
    expect(decideRequest(write({ origin: "https://evil.example" }), env)).toEqual({ kind: "forbidden" });
    expect(decideRequest(write({ origin: null }), env)).toEqual({ kind: "forbidden" });
    expect(decideRequest(write({ origin: "null" }), env)).toEqual({ kind: "forbidden" });
  });

  it("applies to every write method", () => {
    for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
      expect(decideRequest(write({ method, origin: "https://evil.example" }), env), method).toEqual({
        kind: "forbidden",
      });
    }
  });

  it("outside production, accepts the host actually used (phone on the local network)", () => {
    const fromPhone = write({ origin: "http://192.168.1.20:3000", host: "192.168.1.20:3000" });
    expect(decideRequest(fromPhone, env)).toEqual({ kind: "allow" });
    const mismatch = write({ origin: "http://192.168.1.99:3000", host: "192.168.1.20:3000" });
    expect(decideRequest(mismatch, env)).toEqual({ kind: "forbidden" });
  });

  it("in production, only accepts APP_URL", () => {
    const production = testEnv({ NODE_ENV: "production", APP_URL: "https://journal.example.org" });
    const cookie = accessCookieValue(production);
    const base = { accessCookie: cookie, host: "internal:3000" };
    expect(decideRequest(write({ ...base, origin: "https://journal.example.org" }), production)).toEqual({
      kind: "allow",
    });
    expect(decideRequest(write({ ...base, origin: "http://internal:3000" }), production)).toEqual({
      kind: "forbidden",
    });
  });
});

describe("cookies", () => {
  it("are httpOnly and sameSite, and Secure with the __Host- prefix over https", () => {
    const https = testEnv({ APP_URL: "https://journal.example.org" });
    expect(cookieOptions(https)).toMatchObject({ httpOnly: true, sameSite: "lax", secure: true, path: "/" });
    expect(cookieNames(https)).toEqual({ access: "__Host-rj_access", session: "__Host-rj_session" });
    expect(cookieOptions(env)).toMatchObject({ httpOnly: true, sameSite: "lax", secure: false });
    expect(cookieNames(env)).toEqual({ access: "rj_access", session: "rj_session" });
  });
});
