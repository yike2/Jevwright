import type { Handlers } from "./app.js";
import { authHandlers } from "./auth/routes.js";
import type { Db } from "./db.js";
import { runsHandlers } from "./runs/routes.js";
import { workspaceHandlers } from "./workspace/routes.js";

export type HandlerDeps = { db: Db; jwtSecret: string; runsDir: string; enqueue: (runId: string) => void };

/** Every implemented route's handler, keyed like AppDeps.handlers. */
export function createHandlers(deps: HandlerDeps): Handlers {
  return { ...authHandlers(deps), ...workspaceHandlers(deps), ...runsHandlers(deps) };
}
