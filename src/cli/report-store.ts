import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { REPORT_PATH } from "@/core/report/index.js";
import type { ReportBundle, ReportStore } from "@/core/report/index.js";

class ReportStoreError extends Error {
  constructor(dir: string, code: string) {
    super(`Failed to write report to ${dir} (${code})`);
    this.name = "ReportStoreError";
  }
}

export function createFileReportStore(dir: string): ReportStore {
  return {
    async save(bundle: ReportBundle): Promise<void> {
      try {
        await mkdir(dir, { recursive: true });

        const reportPath = join(dir, REPORT_PATH);
        const reportContent = `${JSON.stringify(bundle.report, null, 2)}\n`;
        await writeFile(reportPath, reportContent);

        for (const file of bundle.files) {
          const filePath = join(dir, ...file.path.split("/"));
          await mkdir(dirname(filePath), { recursive: true });
          await writeFile(filePath, file.data);
        }
      } catch (error) {
        const code =
          typeof error === "object" &&
            error !== null &&
            "code" in error &&
            typeof error.code === "string"
            ? error.code
            : "UNKNOWN";
        throw new ReportStoreError(dir, code);
      }
    },
  };
}
