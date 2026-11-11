import { parseEnv, type Env } from "@/lib/env";

export const TEST_ACCESS_TOKEN = "test-access-token-0123456789abcdefghijklmn";

/** Valid configuration for tests, with optional overrides of raw variables. */
export function testEnv(overrides: Record<string, string> = {}): Env {
  return parseEnv({
    NODE_ENV: "test",
    SESSION_SECRET: "test-session-secret-0123456789abcdefghij",
    ACCESS_TOKEN: TEST_ACCESS_TOKEN,
    APP_URL: "http://localhost:3000",
    ...overrides,
  });
}

/** Strong password accepted by the policy. */
export const GOOD_PASSWORD = "soleil-plage-rhum";
export const OTHER_GOOD_PASSWORD = "cheval-agrafe-pile";
