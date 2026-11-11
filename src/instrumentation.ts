// Runs once when the server starts: fail fast on bad configuration and make
// sure the database schema is up to date before serving any request.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { getEnv } = await import("@/lib/env");
  getEnv();

  const { getDb } = await import("@/server/db/client");
  const { runMigrations } = await import("@/server/db/migrate");
  runMigrations(getDb());
}
