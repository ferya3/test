// Serve Monaco from /monaco/vs instead of a CDN (works offline and behind strict CSPs).
import { cpSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = join(root, "node_modules", "monaco-editor", "min", "vs");
const target = join(root, "public", "monaco", "vs");
if (!existsSync(source)) {
  console.warn("monaco-editor is not installed; skipping copy");
  process.exit(0);
}
mkdirSync(dirname(target), { recursive: true });
cpSync(source, target, { recursive: true });
console.log("Copied Monaco to public/monaco/vs");
