import { existsSync } from "node:fs";
import { defineConfig } from "prisma/config";

// Like main.ts, read the repository's .env for local runs without overriding variables already set.
const envFile = new URL("../../../.env", import.meta.url);
if (existsSync(envFile)) process.loadEnvFile(envFile);

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  // `prisma generate` needs no database, so a missing DATABASE_URL only fails the migrate commands.
  datasource: { url: process.env.DATABASE_URL },
});
