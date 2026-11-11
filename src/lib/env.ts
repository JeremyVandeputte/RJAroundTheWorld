import { z } from "zod";

const BYTES_PER_MB = 1024 * 1024;
const BYTES_PER_GB = 1024 * BYTES_PER_MB;

// `.env` files often contain `KEY=` lines: treat empty values as "not set".
const emptyToUndefined = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? undefined : value;

const optional = <T extends z.ZodType>(schema: T) => z.preprocess(emptyToUndefined, schema);

const positiveNumber = (defaultValue: number) =>
  optional(z.coerce.number().positive().default(defaultValue));

const envSchema = z
  .object({
    NODE_ENV: optional(z.enum(["development", "production", "test"]).default("development")),
    SESSION_SECRET: optional(
      z.string({ error: "is required" }).min(32, "must be at least 32 characters long"),
    ),
    ACCESS_TOKEN: optional(
      z
        .string({ error: "is required" })
        .min(32, "must be at least 32 characters long")
        .regex(/^[A-Za-z0-9_-]+$/, 'may only contain letters, digits, "-" and "_"'),
    ),
    APP_URL: optional(z.url("must be a valid URL").default("http://localhost:3000")),
    DATABASE_PATH: optional(z.string().default("./data/rjaroundtheworld.db")),
    MEDIA_DIR: optional(z.string().default("./data/media")),
    MAX_PHOTO_MB: positiveNumber(10),
    MAX_VIDEO_MB: positiveNumber(300),
    MEDIA_QUOTA_GB: positiveNumber(30),
    SESSION_DAYS: positiveNumber(30),
    TRUST_PROXY: optional(z.enum(["true", "false"]).default("false")),
  })
  .superRefine((value, ctx) => {
    const url = URL.canParse(value.APP_URL) ? new URL(value.APP_URL) : null;
    if (!url) return;
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      ctx.addIssue({ code: "custom", path: ["APP_URL"], message: "must start with http:// or https://" });
      return;
    }
    const isLocalhost = url.hostname === "localhost" || url.hostname === "127.0.0.1";
    if (value.NODE_ENV === "production" && url.protocol !== "https:" && !isLocalhost) {
      ctx.addIssue({ code: "custom", path: ["APP_URL"], message: "must use https in production" });
    }
  });

export type Env = {
  nodeEnv: "development" | "production" | "test";
  isProduction: boolean;
  sessionSecret: string;
  accessToken: string;
  /** Origin of the site (scheme + host + port), without trailing slash. */
  appOrigin: string;
  /** Cookies get the Secure flag whenever the site is served over https. */
  secureCookies: boolean;
  databasePath: string;
  mediaDir: string;
  maxPhotoBytes: number;
  maxVideoBytes: number;
  mediaQuotaBytes: number;
  sessionDays: number;
  trustProxy: boolean;
};

export class EnvError extends Error {
  constructor(problems: string[]) {
    super(
      `Invalid environment configuration:\n${problems.map((p) => `  - ${p}`).join("\n")}\n` +
        "See .env.example for the list of variables.",
    );
    this.name = "EnvError";
  }
}

/** Validates raw environment variables. Never includes values in error messages. */
export function parseEnv(raw: Record<string, string | undefined>): Env {
  const result = envSchema.safeParse(raw);
  if (!result.success) {
    throw new EnvError(
      result.error.issues.map((issue) => `${issue.path.join(".") || "env"} ${issue.message}`),
    );
  }
  const value = result.data;
  const appUrl = new URL(value.APP_URL);
  return {
    nodeEnv: value.NODE_ENV,
    isProduction: value.NODE_ENV === "production",
    sessionSecret: value.SESSION_SECRET,
    accessToken: value.ACCESS_TOKEN,
    appOrigin: appUrl.origin,
    secureCookies: appUrl.protocol === "https:",
    databasePath: value.DATABASE_PATH,
    mediaDir: value.MEDIA_DIR,
    maxPhotoBytes: Math.floor(value.MAX_PHOTO_MB * BYTES_PER_MB),
    maxVideoBytes: Math.floor(value.MAX_VIDEO_MB * BYTES_PER_MB),
    mediaQuotaBytes: Math.floor(value.MEDIA_QUOTA_GB * BYTES_PER_GB),
    sessionDays: value.SESSION_DAYS,
    trustProxy: value.TRUST_PROXY === "true",
  };
}

let cached: Env | undefined;

/** Validated configuration, read once from `process.env`. */
export function getEnv(): Env {
  cached ??= parseEnv(process.env);
  return cached;
}

/** Test helper: forces the next `getEnv()` call to read `process.env` again. */
export function resetEnvCache(): void {
  cached = undefined;
}
