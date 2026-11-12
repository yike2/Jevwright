import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import { REPORT_PATH, type ReportStore } from "@/core/report/index.js";

/** The absolute path of a Run File, or undefined when `path` leaves the Run's folder. */
export function resolveRunFile(runsDir: string, runId: string, path: string): string | undefined {
  const folder = resolve(runsDir, runId);
  const file = resolve(folder, path);
  // A path must name something inside the folder, never the folder itself or anything beside it.
  return file.startsWith(folder + sep) ? file : undefined;
}

/** Writes one Run File, creating its folders. */
export async function writeRunFile(runsDir: string, runId: string, path: string, data: Buffer): Promise<void> {
  const file = resolveRunFile(runsDir, runId, path);
  if (file === undefined) throw new Error(`The Run File path ${JSON.stringify(path)} leaves the Run's folder`);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, data);
}

/** The Report Store of one Run: report.json and the Bundle's files under RUNS_DIR/<runId>/. */
export function runFilesStore(runsDir: string, runId: string): ReportStore {
  return {
    async save({ report, files }) {
      for (const file of files) await writeRunFile(runsDir, runId, file.path, file.data);
      await writeRunFile(runsDir, runId, REPORT_PATH, Buffer.from(`${JSON.stringify(report, null, 2)}\n`));
    },
  };
}
