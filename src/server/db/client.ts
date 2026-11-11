import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { getEnv } from "@/lib/env";
import * as schema from "./schema";

/** Opens a SQLite database (file path or ":memory:") with safe defaults. */
export function openDatabase(databasePath: string) {
  if (databasePath !== ":memory:") {
    fs.mkdirSync(path.dirname(path.resolve(databasePath)), { recursive: true });
  }
  const sqlite = new Database(databasePath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("busy_timeout = 5000");
  return drizzle(sqlite, { schema });
}

export type Db = ReturnType<typeof openDatabase>;

// Keep a single connection across hot reloads in development.
const globalForDb = globalThis as typeof globalThis & { __rjDb?: Db };

/** Shared application database, opened lazily from DATABASE_PATH. */
export function getDb(): Db {
  globalForDb.__rjDb ??= openDatabase(getEnv().databasePath);
  return globalForDb.__rjDb;
}
