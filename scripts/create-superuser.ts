import "./load-env";
import readline from "node:readline";
import { eq } from "drizzle-orm";
import { APP_NAME } from "@/lib/app";
import { messages } from "@/lib/messages";
import { getDb } from "@/server/db/client";
import { runMigrations } from "@/server/db/migrate";
import { users } from "@/server/db/schema";
import { createUser, setUserPassword } from "@/server/services/users";

// Creates the superuser account, or resets its password if it already exists.
// Usage: npm run create-superuser
// Non-interactive use: set SUPERUSER_USERNAME, SUPERUSER_DISPLAY_NAME and
// SUPERUSER_PASSWORD in the environment.

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

// Hide typed characters while a password is being entered.
let muted = false;
const output = rl as unknown as { _writeToOutput: (text: string) => void };
const writeToOutput = output._writeToOutput.bind(rl);
output._writeToOutput = (text) => {
  if (!muted) writeToOutput(text);
};

// Lines are queued so that answers piped into the script are not lost.
const queuedLines: string[] = [];
let waitingForLine: ((line: string | null) => void) | null = null;
let inputClosed = false;

rl.on("line", (line) => {
  if (waitingForLine) {
    const resolve = waitingForLine;
    waitingForLine = null;
    resolve(line);
  } else {
    queuedLines.push(line);
  }
});
rl.on("close", () => {
  inputClosed = true;
  waitingForLine?.(null);
});

function nextLine(): Promise<string | null> {
  const queued = queuedLines.shift();
  if (queued !== undefined) return Promise.resolve(queued);
  if (inputClosed) return Promise.resolve(null);
  return new Promise((resolve) => {
    waitingForLine = resolve;
  });
}

async function ask(question: string, options: { hidden?: boolean } = {}): Promise<string> {
  rl.setPrompt(question);
  rl.prompt();
  muted = options.hidden === true;
  const line = await nextLine();
  if (muted) {
    muted = false;
    process.stdout.write("\n");
  }
  if (line === null) throw new Error("Saisie interrompue.");
  return line;
}

/** Environment variable, where an empty value counts as not set. */
function fromEnv(name: string): string | undefined {
  return process.env[name] || undefined;
}

async function askNewPassword(): Promise<string> {
  const preset = fromEnv("SUPERUSER_PASSWORD");
  if (preset) return preset;
  const password = await ask("Mot de passe (10 caractères minimum) : ", { hidden: true });
  const confirmation = await ask("Confirmez le mot de passe : ", { hidden: true });
  if (password !== confirmation) fail("Les deux saisies ne correspondent pas.");
  return password;
}

function describe(reason: string): string {
  const texts: Record<string, string> = { ...messages.user, ...messages.password };
  return texts[reason] ?? reason;
}

function fail(message: string): never {
  console.error(`\nErreur : ${message}`);
  process.exit(1);
}

async function main() {
  const db = getDb();
  runMigrations(db);

  console.log(`${APP_NAME} - compte superuser\n`);
  const existing = db.select().from(users).where(eq(users.role, "superuser")).get();

  if (existing) {
    console.log(`Un superuser existe déjà : ${existing.username} (${existing.displayName}).`);
    const confirm = fromEnv("SUPERUSER_PASSWORD")
      ? "o"
      : await ask("Définir un nouveau mot de passe pour ce compte ? (o/N) ");
    if (confirm.trim().toLowerCase() !== "o") {
      console.log("Aucune modification.");
      return;
    }
    const result = await setUserPassword(db, existing.id, await askNewPassword(), { mustChangePassword: false });
    if (!result.ok) fail(describe(result.reason));
    console.log(`\nMot de passe modifié pour ${existing.username}. Ses sessions ont été fermées.`);
    return;
  }

  const username = fromEnv("SUPERUSER_USERNAME") ?? (await ask("Identifiant : "));
  const displayName = fromEnv("SUPERUSER_DISPLAY_NAME") ?? (await ask("Nom affiché : "));
  const result = await createUser(db, {
    username,
    displayName,
    password: await askNewPassword(),
    role: "superuser",
    canPublish: true,
    canComment: true,
    canReact: true,
  });
  if (!result.ok) fail(describe(result.reason));
  console.log(`\nSuperuser créé : ${result.user.username} (${result.user.displayName}).`);
}

main()
  .catch((error: unknown) => {
    console.error(`\nErreur : ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  })
  .finally(() => rl.close());
