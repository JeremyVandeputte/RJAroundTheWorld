import path from "node:path";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import type { Db } from "./client";

/** Applies all pending SQL migrations from the `drizzle/` folder. */
export function runMigrations(db: Db, migrationsFolder = path.resolve(process.cwd(), "drizzle")): void {
  migrate(db, { migrationsFolder });
}
