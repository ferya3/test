import path from "node:path";
// Prisma 7 no longer reads .env implicitly; the CLI needs it loaded here.
import "dotenv/config";
import { defineConfig, env } from "prisma/config";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

export default defineConfig({
  schema: path.join("prisma", "schema.prisma"),
  migrations: { seed: "tsx --conditions=react-server --env-file=.env prisma/seed.ts" },
  datasource: { url: env("DATABASE_URL") },
  // `adapter` is consumed by the CLI but is missing from the exported config
  // type in this Prisma release, hence the cast.
  adapter: async () => new PrismaBetterSqlite3({ url: env("DATABASE_URL") }),
} as Parameters<typeof defineConfig>[0]);
