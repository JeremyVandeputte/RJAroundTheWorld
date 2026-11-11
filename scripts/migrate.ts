import "./load-env";
import { getEnv } from "@/lib/env";
import { getDb } from "@/server/db/client";
import { runMigrations } from "@/server/db/migrate";

runMigrations(getDb());
console.log(`Database is up to date: ${getEnv().databasePath}`);
