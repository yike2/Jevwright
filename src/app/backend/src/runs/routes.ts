import type { Handlers } from "../app.js";
import type { Db } from "../db.js";

export type RunsDeps = { db: Db; runsDir: string; enqueue: (runId: string) => void };

/** Trigger, history, Run, and Run File routes (backend.md 1.4, 3.1). */
export function runsHandlers(_deps: RunsDeps): Handlers {
  return {};
}
