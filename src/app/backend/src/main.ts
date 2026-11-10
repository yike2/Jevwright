import { existsSync } from "node:fs";
import { createApp } from "./app.js";
import { parseEnv } from "./env.js";

// Like the CLI, read .env from the working directory without overriding variables already set.
if (existsSync(".env")) process.loadEnvFile(".env");

const parsed = parseEnv(process.env);
if (!parsed.ok) {
  console.error(`Invalid environment (see .env.example):\n  ${parsed.problems.join("\n  ")}`);
  process.exit(1);
}
const { env } = parsed;

createApp({ corsOrigin: env.CORS_ORIGIN, handlers: {}, verifyToken: async () => undefined }).listen(env.PORT, () => {
  console.log(`Backend on http://localhost:${env.PORT}/api/v1, API docs at /api/v1/docs`);
});
