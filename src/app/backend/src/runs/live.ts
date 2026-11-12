import type { Server } from "node:http";
import { WebSocketServer } from "ws";
import type { z } from "zod";
import { analyze } from "@/core/syntax/index.js";
import type { LiveMessage } from "../api/schemas.js";
import type { Db } from "../db.js";
import type { Run } from "../generated/prisma/client.js";
import type { ApiStep, LiveRun, RunProgress } from "./execute-run.js";
import { toRun } from "./to-run.js";

export type LiveMessageShape = z.infer<typeof LiveMessage>;

/** The part of a WebSocket the hub uses, so tests can pass a fake. */
export type LiveSocket = { send(data: string): void; close(code: number, reason?: string): void };

/** Loads the user's Run with its source and Report, or undefined for a missing Run or another user's. */
export type LoadRun = (runId: string, userId: string) => Promise<Run | undefined>;

/** LoadRun over Postgres, scoped to the user. */
export function loadRunFrom(db: Db): LoadRun {
  return async (id, userId) => (await db.run.findFirst({ where: { id, userId } })) ?? undefined;
}

/** Close codes of Live Progress (backend.md 1.5). */
export const CLOSE = { done: 1000, error: 1011, unauthorized: 4401, notFound: 4404 } as const;

// A subscriber buffers the messages sent while its Run loads; they follow its snapshot.
type Subscriber = { socket: LiveSocket; buffer?: LiveMessageShape[] };

const isFinal = (status: LiveRun["status"]) => status === "passed" || status === "failed";

/** Per-Run Live Progress: the steps so far and the subscribers of each running Run (backend.md 1.5). */
export class LiveHub implements RunProgress {
  // Steps so far of each Run between its first non-final status and its final one.
  private readonly steps = new Map<string, Map<number, ApiStep>>();
  private readonly subscribers = new Map<string, Set<Subscriber>>();

  constructor(private readonly loadRun: LoadRun) {}

  status(run: LiveRun): void {
    if (isFinal(run.status)) this.steps.delete(run.id);
    else if (!this.steps.has(run.id)) this.steps.set(run.id, new Map());
    this.publish(run.id, { type: "status", run });
  }

  step(runId: string, step: ApiStep): void {
    this.steps.get(runId)?.set(step.index, step);
    this.publish(runId, { type: "step", step });
  }

  /** Stops sending to a socket the client closed. */
  unsubscribe(runId: string, socket: LiveSocket): void {
    const subscribers = this.subscribers.get(runId);
    for (const subscriber of subscribers ?? []) if (subscriber.socket === socket) subscribers?.delete(subscriber);
    if (subscribers?.size === 0) this.subscribers.delete(runId);
  }

  /** Sends the Run's snapshot, then its messages until the final status; false when the Run is not the user's. */
  async subscribe(runId: string, userId: string, socket: LiveSocket): Promise<boolean> {
    // Subscribed before the load, so a message sent meanwhile is buffered, not missed. The Run's row is updated
    // before its status is published, so a final status sent before this point is already in the loaded row.
    const subscriber: Subscriber = { socket, buffer: [] };
    const subscribers = this.subscribers.get(runId) ?? new Set();
    this.subscribers.set(runId, subscribers.add(subscriber));
    let run: Run | undefined;
    try {
      run = await this.loadRun(runId, userId);
    } finally {
      if (!run) this.unsubscribe(runId, socket);
    }
    if (!run) return false;

    send(socket, this.snapshot(run));
    if (isFinal(run.status)) return (this.done(runId, subscriber), true);
    // Buffered messages may repeat what the snapshot shows; a step or status message replaces its earlier state.
    for (const message of subscriber.buffer ?? []) {
      send(socket, message);
      if (message.type === "status" && isFinal(message.run.status)) return (this.done(runId, subscriber), true);
    }
    subscriber.buffer = undefined;
    return true;
  }

  private snapshot(run: Run): LiveMessageShape {
    const report = run.report as { steps?: ApiStep[] } | null;
    if (isFinal(run.status) && report?.steps) return { type: "snapshot", run: toRun(run), steps: report.steps };
    // Every step of the source, those not run yet pending; a Run that ended without a Report keeps them pending.
    const sofar = this.steps.get(run.id);
    const steps = (analyze(run.source).testCase?.steps ?? []).map(
      (step, index): ApiStep => sofar?.get(index) ?? { index, line: step.line, action: step.action, status: "pending" },
    );
    return { type: "snapshot", run: toRun(run), steps };
  }

  private publish(runId: string, message: LiveMessageShape): void {
    const final = message.type === "status" && isFinal(message.run.status);
    for (const subscriber of this.subscribers.get(runId) ?? []) {
      if (subscriber.buffer) {
        subscriber.buffer.push(message);
        continue;
      }
      send(subscriber.socket, message);
      if (final) this.done(runId, subscriber);
    }
  }

  private done(runId: string, subscriber: Subscriber): void {
    this.unsubscribe(runId, subscriber.socket);
    subscriber.socket.close(CLOSE.done, "The Run has finished");
  }
}

const send = (socket: LiveSocket, message: LiveMessageShape) => socket.send(JSON.stringify(message));

const LIVE_PATH = /^\/api\/v1\/runs\/([^/]+)\/live$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Serves GET /api/v1/runs/:runId/live?token= as a WebSocket on `server`. */
export function attachLive(
  server: Server,
  deps: { hub: LiveHub; verifyToken: (token: string) => Promise<string | undefined> },
): void {
  const sockets = new WebSocketServer({ noServer: true });
  server.on("upgrade", (req, stream, head) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const runId = LIVE_PATH.exec(url.pathname)?.[1];
    if (runId === undefined) return void stream.destroy();
    sockets.handleUpgrade(req, stream, head, (ws) => {
      // A browser WebSocket cannot set headers, so the token comes as ?token= (backend.md 1.2).
      const socket: LiveSocket = { send: (data) => ws.send(data), close: (code, reason) => ws.close(code, reason) };
      ws.on("close", () => deps.hub.unsubscribe(runId, socket));
      void serve(runId, url.searchParams.get("token"), socket, deps);
    });
  });
}

async function serve(
  runId: string,
  token: string | null,
  socket: LiveSocket,
  { hub, verifyToken }: Parameters<typeof attachLive>[1],
) {
  try {
    const userId = token ? await verifyToken(token) : undefined;
    if (userId === undefined) return socket.close(CLOSE.unauthorized, "No valid token");
    // Like a REST path id, a runId that is not a uuid names no Run.
    if (!UUID.test(runId) || !(await hub.subscribe(runId, userId, socket))) socket.close(CLOSE.notFound, "No such Run");
  } catch (error) {
    console.error(error);
    socket.close(CLOSE.error, "Internal server error");
  }
}
