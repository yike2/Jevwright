import type { FailedStep, RunError, StepResult } from "../executor/index.js";
import type { TestCase } from "../syntax/index.js";

export type RunOutcome = {
  file: string;
  testCase: TestCase;
  startedAt: Date;
  durationMs: number;
  steps: StepResult[];
  trace: Buffer; // empty when there is none
  error?: RunError;
};

export type ReportStep = Exclude<StepResult, FailedStep> | (Omit<FailedStep, "screenshot"> & { screenshot?: string }); // path in the Bundle

export type Report = {
  file: string;
  name: string;
  status: "passed" | "failed";
  startedAt: string; // ISO 8601
  durationMs: number;
  summary: { total: number; passed: number; failed: number; pending: number };
  steps: ReportStep[];
  trace?: string;
  error?: RunError;
};

export type ReportFile = { path: string; data: Buffer };

export type ReportBundle = { report: Report; files: ReportFile[] }; // files: trace first, then screenshots by step

/** Saves a Report Bundle; the CLI writes files, the backend writes Postgres and its Run Files directory. */
export interface ReportStore {
  save(bundle: ReportBundle): Promise<void>;
}
