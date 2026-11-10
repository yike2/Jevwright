import type { Response } from "express";
import { analyze } from "@/core/syntax/index.js";
import type { Handlers } from "../app.js";
import type { Db } from "../db.js";
import type { Prisma, Run } from "../generated/prisma/client.js";
import { requireUserId } from "../http/auth.js";
import { ApiError } from "../http/errors.js";
import { resolveRunFile } from "./run-files.js";
import { toRun, toRunDetail } from "./to-run.js";

export type RunsDeps = { db: Db; runsDir: string; enqueue: (runId: string) => void };

type RunsQuery = { testFileId?: string; projectId?: string; limit: number; cursor?: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// A cursor is the last Run of a page, by the list's order: createdAt, then id for Runs created at the same time.
type Cursor = { createdAt: Date; id: string };

const encodeCursor = (run: Pick<Run, "createdAt" | "id">) =>
  Buffer.from(`${run.createdAt.toISOString()} ${run.id}`).toString("base64url");

function decodeCursor(cursor: string): Cursor {
  const [time = "", id = "", ...rest] = Buffer.from(cursor, "base64url").toString().split(" ");
  const createdAt = new Date(time);
  if (rest.length > 0 || Number.isNaN(createdAt.getTime()) || !UUID.test(id))
    throw new ApiError("invalid_request", "The request fails its schema", [
      { path: "query.cursor", message: "Not a nextCursor from a previous page" },
    ]);
  return { createdAt, id };
}

async function ownedRun(db: Db, userId: string, id: string): Promise<Run> {
  const run = await db.run.findFirst({ where: { id, userId } });
  if (!run) throw new ApiError("not_found", "No such Run");
  return run;
}

function sendFile(res: Response, file: string): Promise<void> {
  return new Promise((resolve, reject) =>
    res.sendFile(file, (error?: Error & { status?: number }) => {
      if (!error) return resolve();
      // A missing file, or a folder, is not a Run File.
      reject(error.status === 404 && !res.headersSent ? new ApiError("not_found", "No such Run File") : error);
    }),
  );
}

/** Trigger, history, Run, and Run File routes (backend.md 1.4, 3.1). */
export function runsHandlers({ db, runsDir, enqueue }: RunsDeps): Handlers {
  return {
    "post /test-files/:testFileId/runs": async (input, res) => {
      const { testFileId } = input.params as { testFileId: string };
      const userId = requireUserId(input);
      const testFile = await db.testFile.findFirst({
        where: { id: testFileId, module: { project: { userId } } },
        include: { module: { select: { projectId: true } } },
      });
      if (!testFile) throw new ApiError("not_found", "No such Test File");
      const { diagnostics, testCase } = analyze(testFile.source);
      if (diagnostics.length > 0 || testCase === undefined)
        throw new ApiError("invalid_test", "The Test File has diagnostics", diagnostics);
      // The Run keeps its own copy of the source and names, so later edits and deletes do not change it.
      const run = await db.run.create({
        data: {
          userId,
          testFileId,
          moduleId: testFile.moduleId,
          projectId: testFile.module.projectId,
          fileName: testFile.name,
          name: testCase.name,
          source: testFile.source,
        },
      });
      enqueue(run.id);
      res.status(202).json(toRun(run));
    },

    "get /runs": async (input, res) => {
      const { testFileId, projectId, limit, cursor } = input.query as RunsQuery;
      const after = cursor === undefined ? undefined : decodeCursor(cursor);
      const where: Prisma.RunWhereInput = {
        userId: requireUserId(input),
        ...(testFileId ? { testFileId } : {}),
        ...(projectId ? { projectId } : {}),
        ...(after
          ? {
              OR: [{ createdAt: { lt: after.createdAt } }, { createdAt: after.createdAt, id: { lt: after.id } }],
            }
          : {}),
      };
      // One Run more than the page tells whether there is a next page.
      const runs = await db.run.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: limit + 1,
        omit: { source: true, report: true },
      });
      const page = runs.slice(0, limit);
      const last = page.at(-1);
      res.json({
        items: page.map((run) => toRun(run)),
        nextCursor: runs.length > limit && last ? encodeCursor(last) : null,
      });
    },

    "get /runs/:runId": async (input, res) => {
      const { runId } = input.params as { runId: string };
      res.json(toRunDetail(await ownedRun(db, requireUserId(input), runId)));
    },

    // Live Progress is a WebSocket served by live.ts; a plain GET reaches the app instead.
    "get /runs/:runId/live": () => {
      throw new ApiError("invalid_request", "Open Live Progress as a WebSocket", [
        { path: "headers.upgrade", message: "Expected a WebSocket upgrade" },
      ]);
    },

    "get /runs/:runId/files/*path": async (input, res) => {
      const { runId, path } = input.params as { runId: string; path: string };
      await ownedRun(db, requireUserId(input), runId);
      const file = resolveRunFile(runsDir, runId, path);
      if (file === undefined) throw new ApiError("not_found", "No such Run File");
      await sendFile(res, file);
    },
  };
}
