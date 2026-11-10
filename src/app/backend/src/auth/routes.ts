import type { Handlers } from "../app.js";
import type { Db } from "../db.js";

export type AuthDeps = { db: Db; jwtSecret: string };

/** Register, login, and the logged-in user (backend.md 1.2). */
export function authHandlers(_deps: AuthDeps): Handlers {
  return {};
}
