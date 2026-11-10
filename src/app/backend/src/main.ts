import { existsSync } from "node:fs";
import { createApp } from "./app.js";
import { verifyToken } from "./auth/token.js";
import { createDb } from "./db.js";
import { parseEnv } from "./env.js";
import { createHandlers } from "./handlers.js";

// Like the CLI, read .env from the working directory without overriding variables already set.
if (existsSync(".env")) process.loadEnvFile(".env");

const parsed = parseEnv(process.env);
if (!parsed.ok) {
  console.error(`Invalid environment (see .env.example):\n  ${parsed.problems.join("\n  ")}`);
  process.exit(1);
}
const { env } = parsed;
const db = createDb(env.DATABASE_URL);

const app = createApp({
  corsOrigin: env.CORS_ORIGIN,
  handlers: createHandlers({ db, jwtSecret: env.JWT_SECRET, runsDir: env.RUNS_DIR, enqueue: () => {} }),
  verifyToken: (token) => verifyToken(token, env.JWT_SECRET),
});
app.listen(env.PORT, () => {
  console.log(`Backend on http://localhost:${env.PORT}/api/v1, API docs at /api/v1/docs`);
});
