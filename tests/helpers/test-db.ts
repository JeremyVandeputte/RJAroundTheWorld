import { openDatabase, type Db } from "@/server/db/client";
import { runMigrations } from "@/server/db/migrate";

/** Fresh in-memory database with the real migrations applied. */
export function createTestDb(): Db {
  const db = openDatabase(":memory:");
  runMigrations(db);
  return db;
}
