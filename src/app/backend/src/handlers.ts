import type { Handlers } from "./app.js";
import { authHandlers } from "./auth/routes.js";
import type { Db } from "./db.js";

export type HandlerDeps = { db: Db; jwtSecret: string };

/** Every implemented route's handler, keyed like AppDeps.handlers. */
export function createHandlers(deps: HandlerDeps): Handlers {
  return { ...authHandlers(deps) };
}
