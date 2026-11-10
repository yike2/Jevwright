import type { Handlers } from "../app.js";
import type { Db } from "../db.js";

export type WorkspaceDeps = { db: Db };

/** Projects, Modules, Test Files, Project Variables, and the tree (backend.md 1.3). */
export function workspaceHandlers(_deps: WorkspaceDeps): Handlers {
  return {};
}
