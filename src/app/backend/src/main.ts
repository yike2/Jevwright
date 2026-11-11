import { existsSync } from "node:fs";
import { createServer } from "node:http";
import { createJevClient } from "@/core/jev/index.js";
import { createApp } from "./app.js";
import { verifyToken } from "./auth/token.js";
import { createDb } from "./db.js";
import { parseEnv } from "./env.js";
import { createHandlers } from "./handlers.js";
import { browserLauncher } from "./runs/browser.js";
import { executeRun, recoverInterruptedRuns } from "./runs/execute-run.js";
import { attachLive, LiveHub, loadRunFrom } from "./runs/live.js";
import { RunQueue } from "./runs/queue.js";

// Like the CLI, read .env from the working directory without overriding variables already set.
if (existsSync(".env")) process.loadEnvFile(".env");

const parsed = parseEnv(process.env);
if (!parsed.ok) {
  console.error(`Invalid environment (see .env.example):\n  ${parsed.problems.join("\n  ")}`);
  process.exit(1);
}
const { env } = parsed;
const db = createDb(env.DATABASE_URL);

// Before the queue starts: a Run left queued or running by the last process never finishes (backend.md 1.4).
const recovered = await recoverInterruptedRuns(db);
if (recovered > 0) console.log(`Marked ${recovered} interrupted Run(s) as failed`);

const jev = createJevClient({ apiKey: env.OPENROUTER_API_KEY, fetch: globalThis.fetch });
const hub = new LiveHub(loadRunFrom(db));
const launch = browserLauncher(env.BROWSER_ENDPOINT);
const queue = new RunQueue(
  (runId) => executeRun(runId, { db, runsDir: env.RUNS_DIR, jev, network: "public", progress: hub, launch }),
  env.RUN_CONCURRENCY,
);

const tokenUser = (token: string) => verifyToken(token, env.JWT_SECRET);
const app = createApp({
  corsOrigin: env.CORS_ORIGIN,
  handlers: createHandlers({
    db,
    jwtSecret: env.JWT_SECRET,
    runsDir: env.RUNS_DIR,
    enqueue: (runId) => queue.enqueue(runId),
  }),
  verifyToken: tokenUser,
});
// One port for HTTP and Live Progress's WebSocket upgrades.
const server = createServer(app);
attachLive(server, { hub, verifyToken: tokenUser });
server.listen(env.PORT, () => {
  console.log(`Backend on http://localhost:${env.PORT}/api/v1, API docs at /api/v1/docs`);
});
