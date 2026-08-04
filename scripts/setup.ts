/**
 * Cross-platform first-run setup:  npm run setup
 *
 * Creates .env from .env.example and fills in the two secrets. Written in Node
 * so it behaves the same in cmd.exe, PowerShell and a POSIX shell — no `cp`,
 * no `openssl`.
 *
 * Safe to re-run: existing values are never overwritten.
 */
import { randomBytes } from "node:crypto";
import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const envPath = path.join(root, ".env");
const examplePath = path.join(root, ".env.example");

if (!existsSync(examplePath)) {
  console.error("Missing .env.example — are you running this from the project root?");
  process.exit(1);
}

if (!existsSync(envPath)) {
  copyFileSync(examplePath, envPath);
  console.log("Created .env from .env.example");
} else {
  console.log(".env already exists — filling in only what is missing");
}

let contents = readFileSync(envPath, "utf8");
const generated: string[] = [];

for (const key of ["SESSION_SECRET", "CREDENTIAL_MASTER_KEY"] as const) {
  const pattern = new RegExp(`^${key}=.*$`, "m");
  const current = contents.match(pattern)?.[0].split("=")[1]?.replace(/["']/g, "").trim();

  // Only touch keys that are absent or still empty, so re-running never
  // invalidates the credentials already encrypted under an existing key.
  if (current) continue;

  const value = randomBytes(32).toString("hex");
  const line = `${key}="${value}"`;
  contents = pattern.test(contents) ? contents.replace(pattern, line) : `${contents.trimEnd()}\n${line}\n`;
  generated.push(key);
}

writeFileSync(envPath, contents);

if (generated.length > 0) {
  console.log(`Generated: ${generated.join(", ")}`);
}

console.log(`
Next steps:
  npx prisma db push     create the database
  npm run db:seed        load demo data (optional)
  npm run dev            start on http://localhost:3000

Keep CREDENTIAL_MASTER_KEY backed up. Lose it and every stored credential
becomes permanently unreadable.`);
