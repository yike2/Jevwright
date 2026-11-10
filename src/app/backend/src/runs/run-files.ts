import type { ReportStore } from "@/core/report/index.js";

/** The absolute path of a Run File, or undefined when `path` leaves the Run's folder. */
export function resolveRunFile(_runsDir: string, _runId: string, _path: string): string | undefined {
  return undefined;
}

/** Writes one Run File, creating its folders. */
export async function writeRunFile(_runsDir: string, _runId: string, _path: string, _data: Buffer): Promise<void> {}

/** The Report Store of one Run: report.json and the Bundle's files under RUNS_DIR/<runId>/. */
export function runFilesStore(_runsDir: string, _runId: string): ReportStore {
  return { save: async () => {} };
}
