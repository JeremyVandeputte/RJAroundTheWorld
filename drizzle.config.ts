import { defineConfig } from "drizzle-kit";

// Used only by `npm run db:generate` to produce SQL migrations from the schema.
export default defineConfig({
  dialect: "sqlite",
  schema: "./src/server/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: process.env.DATABASE_PATH ?? "./data/rjaroundtheworld.db",
  },
});
