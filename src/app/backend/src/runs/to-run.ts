import type { z } from "zod";
import type { Report, Run as ApiRun, RunError } from "../api/schemas.js";
import type { Run } from "../generated/prisma/client.js";

type ApiRunShape = z.infer<typeof ApiRun>;

const iso = (date: Date | null) => (date ? date.toISOString() : null);

/** The API's Run (api/schemas.ts) of a row, without source and Report. */
export function toRun(run: Omit<Run, "source" | "report">): ApiRunShape {
  const summary =
    run.total === null || run.passed === null || run.failed === null || run.pending === null
      ? null
      : { total: run.total, passed: run.passed, failed: run.failed, pending: run.pending };
  const error =
    run.errorKind === null
      ? null
      : { kind: run.errorKind as z.infer<typeof RunError>["kind"], message: run.errorMessage ?? "" };
  return {
    id: run.id,
    testFileId: run.testFileId,
    projectId: run.projectId,
    moduleId: run.moduleId,
    fileName: run.fileName,
    name: run.name,
    status: run.status,
    createdAt: run.createdAt.toISOString(),
    startedAt: iso(run.startedAt),
    finishedAt: iso(run.finishedAt),
    durationMs: run.durationMs,
    summary,
    error,
  };
}

/** The API's Run with its source and, once it finished, its Report, for GET /runs/:runId. */
export function toRunDetail(run: Run): ApiRunShape {
  return {
    ...toRun(run),
    source: run.source,
    // The Report column holds Core's Report as the Run saved it (execute-run.ts).
    ...(run.report !== null ? { report: run.report as z.infer<typeof Report> } : {}),
  };
}
