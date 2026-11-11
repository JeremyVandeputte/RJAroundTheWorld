import { randomInt } from "node:crypto";
import { hash, verify } from "@node-rs/argon2";
import { ZxcvbnFactory } from "@zxcvbn-ts/core";
import * as commonPackage from "@zxcvbn-ts/language-common";
import * as englishPackage from "@zxcvbn-ts/language-en";
import * as frenchPackage from "@zxcvbn-ts/language-fr";
import { APP_NAME } from "@/lib/app";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "@/lib/password-rules";

export type PasswordIssue = "password_too_short" | "password_too_long" | "password_too_common";

// Argon2id with the OWASP recommended minimum parameters.
const ARGON2_OPTIONS = { memoryCost: 19456, timeCost: 2, parallelism: 1 };

export function hashPassword(password: string): Promise<string> {
  return hash(password, ARGON2_OPTIONS);
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  if (password.length > PASSWORD_MAX_LENGTH) return false;
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}

let dummyHash: Promise<string> | undefined;

/** Hash verified when the account does not exist, so timing reveals nothing. */
export function getDummyPasswordHash(): Promise<string> {
  dummyHash ??= hashPassword("dummy-password-for-timing");
  return dummyHash;
}

// No look-alike characters (0/O, 1/l/I): the password is read and typed by hand.
const TEMPORARY_PASSWORD_ALPHABET = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** Random one-time password such as "kT7m-Wq3x-9pRd-h4Zn" (about 92 bits). */
export function generateTemporaryPassword(): string {
  const groups = Array.from({ length: 4 }, () =>
    Array.from(
      { length: 4 },
      () => TEMPORARY_PASSWORD_ALPHABET[randomInt(TEMPORARY_PASSWORD_ALPHABET.length)],
    ).join(""),
  );
  return groups.join("-");
}

let estimator: ZxcvbnFactory | undefined;

// Fully local check (no network call): lists of common passwords, names and
// French/English words, plus keyboard patterns, sequences and repetitions.
function getEstimator(): ZxcvbnFactory {
  estimator ??= new ZxcvbnFactory({
    dictionary: {
      ...commonPackage.dictionary,
      ...englishPackage.dictionary,
      ...frenchPackage.dictionary,
    },
    graphs: commonPackage.adjacencyGraphs,
    translations: frenchPackage.translations,
  });
  return estimator;
}

/** Guessability score below which a password is refused (0 to 4 scale). */
const MIN_PASSWORD_SCORE = 2;

/**
 * Checks a new password against the site rules.
 * `personalWords` (username, display name) count as easy to guess.
 */
export function checkPasswordPolicy(password: string, personalWords: string[] = []): PasswordIssue | null {
  if (password.length < PASSWORD_MIN_LENGTH) return "password_too_short";
  if (password.length > PASSWORD_MAX_LENGTH) return "password_too_long";
  const siteWords = [APP_NAME, APP_NAME.replaceAll(" ", ""), "rjaroundtheworld"];
  const result = getEstimator().check(password, [...personalWords, ...siteWords]);
  return result.score < MIN_PASSWORD_SCORE ? "password_too_common" : null;
}
