import path from "node:path";
// Prisma 7 no longer reads .env implicitly; the CLI needs it loaded here.
import "dotenv/config";
import { defineConfig } from "prisma/config";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

// `prisma generate` runs from `postinstall`, before .env exists on a fresh
// clone, so loading this file must not depend on the variable being set.
// Codegen never opens a connection — the fallback only keeps the config
// loadable. The app itself fails loudly on a missing URL (see src/lib/db.ts).
const databaseUrl = process.env.DATABASE_URL ?? "file:./dev.db";

export default defineConfig({
  schema: path.join("prisma", "schema.prisma"),
  migrations: { seed: "tsx --conditions=react-server --env-file=.env prisma/seed.ts" },
  datasource: { url: databaseUrl },
  // `adapter` is consumed by the CLI but is missing from the exported config
  // type in this Prisma release, hence the cast.
  adapter: async () => new PrismaBetterSqlite3({ url: databaseUrl }),
} as Parameters<typeof defineConfig>[0]);
