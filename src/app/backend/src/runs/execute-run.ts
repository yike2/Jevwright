import type { z } from "zod";
import type { launchBrowser, Network } from "@/core/browser/index.js";
import type { StepEvent, StepResult } from "@/core/executor/index.js";
import type { JevClient } from "@/core/jev/index.js";
import { runTest } from "@/core/pipeline/index.js";
import { screenshotPath, type Report } from "@/core/report/index.js";
import type { LiveSnapshot, Step } from "../api/schemas.js";
import type { Db } from "../db.js";
import type { Prisma, Run } from "../generated/prisma/client.js";
import { runFilesStore, writeRunFile } from "./run-files.js";
import { toRun } from "./to-run.js";

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

const INTERRUPTED = "Interrupted by a server restart";

/** Runs one queued Run with Core: Run Files, the row's status and Report, and its progress (backend.md 1.4). */
export async function executeRun(runId: string, deps: RunDeps): Promise<void> {
  const { db, progress } = deps;
  const startedAt = new Date();
  // Only a queued Run starts, so a Run that is already running or finished is never run twice.
  const { count } = await db.run.updateMany({
    where: { id: runId, status: "queued" },
    data: { status: "running", startedAt },
  });
  if (count === 0) return;
  const run = await db.run.findUniqueOrThrow({ where: { id: runId } });
  progress.status(toRun(run));

  let data: Prisma.RunUpdateInput;
  try {
    data = finished(await runWithCore(run, deps));
  } catch (error) {
    // The message may hold a Variable value, so only the error's name is kept (backend.md 1.4).
    const name = error instanceof Error ? error.name : "Error";
    console.error(`Run ${runId} failed with ${name}`);
    data = {
      status: "failed",
      finishedAt: new Date(),
      durationMs: Date.now() - startedAt.getTime(),
      errorKind: "internal",
      errorMessage: name,
    };
  }
  progress.status(toRun(await db.run.update({ where: { id: runId }, data })));
}

async function runWithCore(run: Run, deps: RunDeps): Promise<Report> {
  const { db, runsDir, progress } = deps;
  const variables = run.projectId ? await db.variable.findMany({ where: { projectId: run.projectId } }) : [];
  // Step events are synchronous, so their messages chain here: each step is published after its screenshot exists,
  // and in the order Core sent them.
  // The first write error is kept and thrown once Core is done, so it fails the Run instead of going unhandled.
  let written: Promise<void> = Promise.resolve();
  let writeError: { error: unknown } | undefined;
  const publish = (next: () => Promise<void> | void) => {
    written = written.then(next).catch((error: unknown) => void (writeError ??= { error }));
  };
  const onEvent = (event: StepEvent) => {
    if (event.type === "started") {
      // Through the chain too, so a step starts after the step before it has been published as finished.
      const startedAt = new Date().toISOString();
      publish(() => progress.step(run.id, { ...event.step, status: "running", startedAt }));
      return;
    }
    const { result } = event;
    publish(async () => {
      if (result.status !== "pending" && result.screenshot)
        await writeRunFile(runsDir, run.id, screenshotPath(result.index), result.screenshot);
      progress.step(run.id, toApiStep(result));
    });
  };

  let outcome: Awaited<ReturnType<typeof runTest>>;
  try {
    outcome = await runTest(
      { file: run.fileName, source: run.source },
      {
        headed: false,
        vars: Object.fromEntries(variables.map((variable) => [variable.name, variable.value])),
        jev: deps.jev,
        store: runFilesStore(runsDir, run.id),
        onEvent,
        screenshotEveryStep: true,
        network: deps.network,
      },
      deps.launch,
    );
  } finally {
    await written;
  }
  if (writeError) throw writeError.error;
  // The source was analyzed when the Run was triggered, so diagnostics here are a bug, not a user error.
  if (outcome.kind === "invalid") throw new Error("A triggered Run's source has diagnostics");
  return outcome.report;
}

// A Step result as the API has it: its screenshot is the Run File's path instead of the PNG.
function toApiStep(result: StepResult): ApiStep {
  if (result.status === "pending") return result;
  const { screenshot, ...rest } = result;
  return screenshot ? { ...rest, screenshot: screenshotPath(result.index) } : rest;
}

function finished(report: Report): Prisma.RunUpdateInput {
  return {
    status: report.status,
    finishedAt: new Date(),
    durationMs: report.durationMs,
    ...report.summary,
    errorKind: report.error?.kind ?? null,
    errorMessage: report.error?.message ?? null,
    report: report as unknown as Prisma.InputJsonValue,
  };
}

/** Fails the Runs a previous process left queued or running (backend.md 1.4); answers how many. */
export async function recoverInterruptedRuns(db: Db): Promise<number> {
  const { count } = await db.run.updateMany({
    where: { status: { in: ["queued", "running"] } },
    data: { status: "failed", finishedAt: new Date(), errorKind: "interrupted", errorMessage: INTERRUPTED },
  });
  return count;
}
