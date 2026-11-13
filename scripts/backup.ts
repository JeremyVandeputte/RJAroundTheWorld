import "./load-env";
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { getEnv } from "@/lib/env";

// Consistent copy of the SQLite database, safe while the site is running.
// Usage: npm run backup -- <folder>   (default folder: ./backups)
// Photos and videos are not included: copy MEDIA_DIR separately.

async function main() {
  const env = getEnv();
  const folder = path.resolve(process.argv[2] ?? "backups");
  fs.mkdirSync(folder, { recursive: true });

  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15);
  const target = path.join(folder, `rjaroundtheworld-${stamp}.db`);

  const source = new Database(env.databasePath, { readonly: true, fileMustExist: true });
  try {
    // SQLite online backup: a coherent snapshot, even with writes going on.
    await source.backup(target);
  } finally {
    source.close();
  }

  console.log(`Base de données sauvegardée : ${target}`);
  console.log(`Pensez à copier aussi les photos et vidéos : ${path.resolve(env.mediaDir)}`);
}

main().catch((error: unknown) => {
  console.error(`Erreur : ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
