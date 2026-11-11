import fs from "node:fs";

// Next.js loads `.env` by itself; standalone scripts need to do it explicitly.
// Variables already present in the environment are never overridden.
if (fs.existsSync(".env")) {
  process.loadEnvFile(".env");
}
