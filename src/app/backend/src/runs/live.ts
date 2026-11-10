import type { Server } from "node:http";
import type { z } from "zod";
import type { LiveMessage } from "../api/schemas.js";
import type { Db } from "../db.js";
import type { Run } from "../generated/prisma/client.js";
import type { ApiStep, LiveRun, RunProgress } from "./execute-run.js";

export type LiveMessageShape = z.infer<typeof LiveMessage>;

/** The part of a WebSocket the hub uses, so tests can pass a fake. */
export type LiveSocket = { send(data: string): void; close(code: number, reason?: string): void };

/** Loads the user's Run with its source and Report, or undefined for a missing Run or another user's. */
export type LoadRun = (runId: string, userId: string) => Promise<Run | undefined>;

/** LoadRun over Postgres, scoped to the user. */
export function loadRunFrom(_db: Db): LoadRun {
  return async () => undefined;
}

/** Close codes of Live Progress (backend.md 1.5). */
export const CLOSE = { done: 1000, unauthorized: 4401, notFound: 4404 } as const;

/** Per-Run Live Progress: the steps so far and the subscribers of each running Run (backend.md 1.5). */
export class LiveHub implements RunProgress {
  constructor(private readonly loadRun: LoadRun) {}

  status(_run: LiveRun): void {}

  step(_runId: string, _step: ApiStep): void {}

  /** Sends the Run's snapshot, then its messages until the final status; false when the Run is not the user's. */
  async subscribe(_runId: string, _userId: string, _socket: LiveSocket): Promise<boolean> {
    return false;
  }
}

/** Serves GET /api/v1/runs/:runId/live?token= as a WebSocket on `server`. */
export function attachLive(
  _server: Server,
  _deps: { hub: LiveHub; verifyToken: (token: string) => Promise<string | undefined> },
): void {}
