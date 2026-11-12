import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { JevClient } from "@/core/jev/index.js";
import { createApp } from "@/app/backend/src/app.js";
import { signToken, verifyToken } from "@/app/backend/src/auth/token.js";
import type { Db } from "@/app/backend/src/db.js";
import { createHandlers } from "@/app/backend/src/handlers.js";
import { executeRun, type RunDeps } from "@/app/backend/src/runs/execute-run.js";
import { RunQueue } from "@/app/backend/src/runs/queue.js";
import { throwingJev } from "../../../unit/core/executor/fake-adapter.js";

export const JWT_SECRET = "test-secret-".padEnd(32, "x");
export const CORS_ORIGIN = "http://localhost:3000";

export type TestBackendOptions = Partial<Omit<RunDeps, "db">> & { jev?: JevClient; concurrency?: number };

/**
 * The app, Run Queue, and Run Files folder as main.ts builds them, over the test database. Runs use
 * `network: "any"` unless set, since the HTML fixtures are served on 127.0.0.1, and a Jev that throws if called.
 */
export function createTestBackend(db: Db, options: TestBackendOptions = {}) {
  const runsDir = options.runsDir ?? mkdtempSync(join(tmpdir(), "jevwright-runs-"));
  const deps: RunDeps = {
    db,
    runsDir,
    jev: options.jev ?? throwingJev,
    network: options.network ?? "any",
    progress: options.progress ?? { status: () => {}, step: () => {} },
    ...(options.launch ? { launch: options.launch } : {}),
    ...(options.maxRunTimeoutMs ? { maxRunTimeoutMs: options.maxRunTimeoutMs } : {}),
  };
  const queue = new RunQueue((runId) => executeRun(runId, deps), options.concurrency ?? 1);
  const app = createApp({
    corsOrigin: CORS_ORIGIN,
    handlers: createHandlers({ db, jwtSecret: JWT_SECRET, runsDir, enqueue: (runId) => queue.enqueue(runId) }),
    verifyToken: (token) => verifyToken(token, JWT_SECRET),
  });
  return { app, queue, runsDir };
}

/** The app as main.ts builds it, over the test database. */
export function createTestApp(db: Db) {
  return createTestBackend(db).app;
}

/** A user stored directly, without bcrypt's cost, with a valid token. */
export async function createUser(db: Db, email = "ada@example.com") {
  const user = await db.user.create({ data: { email, passwordHash: "not-a-real-hash" } });
  return { user, token: await signToken(user.id, JWT_SECRET) };
}
