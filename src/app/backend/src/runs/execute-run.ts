import type { z } from "zod";
import type { launchBrowser, Network } from "@/core/browser/index.js";
import type { JevClient } from "@/core/jev/index.js";
import type { LiveSnapshot, Step } from "../api/schemas.js";
import type { Db } from "../db.js";

export type LiveRun = z.infer<typeof LiveSnapshot>["run"];
export type ApiStep = z.infer<typeof Step>;

/** Where a Run's progress goes: Live Progress in the app, a recorder in tests. */
export type RunProgress = {
  status(run: LiveRun): void;
  step(runId: string, step: ApiStep): void;
};

export type RunDeps = {
  db: Db;
  runsDir: string;
  jev: JevClient;
  network: Network; // "public" on the server (backend.md 1.6)
  progress: RunProgress;
  launch?: typeof launchBrowser;
};

/** Runs one queued Run with Core: Run Files, the row's status and Report, and its progress (backend.md 1.4). */
export async function executeRun(_runId: string, _deps: RunDeps): Promise<void> {}

/** Fails the Runs a previous process left queued or running (backend.md 1.4); answers how many. */
export async function recoverInterruptedRuns(_db: Db): Promise<number> {
  return 0;
}
