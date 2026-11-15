import type { StepResult } from "../executor/index.js";
import { screenshotPath, TRACE_PATH } from "./paths.js";
import type { BrowserStateNames, Report, ReportBundle, ReportFile, ReportStep, RunOutcome } from "./types.js";

// A step's screenshot moves into `files`; the ReportStep keeps only its path.
function toReportStep(step: StepResult, files: ReportFile[]): ReportStep {
  if (step.status === "pending") return step;
  const { screenshot, ...rest } = step;
  if (screenshot === undefined) return rest;
  const path = screenshotPath(step.index);
  files.push({ path, data: screenshot });
  return { ...rest, screenshot: path };
}

// The names of the headers, cookies, and storage entries the TestCase sets; their values stay out of the Report.
function browserStateNames({ headers, cookies, localStorage, sessionStorage }: RunOutcome["testCase"]) {
  const fields = { headers, cookies, localStorage, sessionStorage };
  const names: BrowserStateNames = Object.fromEntries(
    Object.entries(fields).flatMap(([field, entries]) => (entries ? [[field, Object.keys(entries)]] : [])),
  );
  return Object.keys(names).length > 0 ? names : undefined;
}

/** Turns the outcome of one Run into its Report and the files the Report points to. */
export function buildReport(run: RunOutcome): ReportBundle {
  const hasTrace = run.trace.length > 0;
  const files: ReportFile[] = hasTrace ? [{ path: TRACE_PATH, data: run.trace }] : [];
  const steps = run.steps.map((step) => toReportStep(step, files));
  const count = (status: StepResult["status"]) => run.steps.filter((step) => step.status === status).length;
  const summary = {
    total: run.steps.length,
    passed: count("passed"),
    failed: count("failed"),
    pending: count("pending"),
  };
  const browserState = browserStateNames(run.testCase);
  const report: Report = {
    file: run.file,
    name: run.testCase.name,
    status: summary.failed > 0 || run.error ? "failed" : "passed",
    startedAt: run.startedAt.toISOString(),
    durationMs: run.durationMs,
    summary,
    steps,
    ...(hasTrace ? { trace: TRACE_PATH } : {}),
    // Only the two fields: a RunAbortedError also fits RunError, but its message would not serialize and its trace would.
    ...(run.error ? { error: { kind: run.error.kind, message: run.error.message } } : {}),
    ...(browserState ? { browserState } : {}),
  };
  return { report, files };
}
