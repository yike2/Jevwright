import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { createFileReportStore } from "@/cli/report-store.js";
import { REPORT_PATH } from "@/core/report/index.js";
import type { Report, ReportBundle } from "@/core/report/index.js";

const minimalReport: Report = {
  file: "suite/test.yaml",
  name: "Minimal",
  status: "passed",
  startedAt: "2026-11-08T00:00:00.000Z",
  durationMs: 0,
  summary: { total: 0, passed: 0, failed: 0, pending: 0 },
  steps: [],
};

describe("report-store", () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    for (const dir of tempDirs) {
      await rm(dir, { recursive: true, force: true });
    }
    tempDirs.length = 0;
  });

  it("writes report.json with 2-space indentation and a trailing newline", async () => {
    const dir = await mkdtemp(join(tmpdir(), "jevwright-report-store-"));
    tempDirs.push(dir);

    const store = createFileReportStore(dir);
    const bundle: ReportBundle = {
      report: minimalReport,
      files: [],
    };

    await store.save(bundle);

    const content = await readFile(join(dir, REPORT_PATH), "utf8");
    expect(content).toBe(`{
  "file": "suite/test.yaml",
  "name": "Minimal",
  "status": "passed",
  "startedAt": "2026-11-08T00:00:00.000Z",
  "durationMs": 0,
  "summary": {
    "total": 0,
    "passed": 0,
    "failed": 0,
    "pending": 0
  },
  "steps": []
}\n`);
  });

  it("writes each bundle file at its path", async () => {
    const dir = await mkdtemp(join(tmpdir(), "jevwright-report-store-"));
    tempDirs.push(dir);

    const store = createFileReportStore(dir);
    const trace = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
    const screenshot = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
    const bundle: ReportBundle = {
      report: minimalReport,
      files: [
        { path: "trace.zip", data: trace },
        { path: "screenshots/step-1.png", data: screenshot },
      ],
    };

    await store.save(bundle);

    expect(await readFile(join(dir, "trace.zip"))).toEqual(trace);
    expect(await readFile(join(dir, "screenshots", "step-1.png"))).toEqual(screenshot);
  });

  it("creates nested output directories that do not exist yet", async () => {
    const baseDir = await mkdtemp(join(tmpdir(), "jevwright-report-store-"));
    tempDirs.push(baseDir);

    const dir = join(baseDir, "nested", "reports", "run-1");
    const store = createFileReportStore(dir);
    const bundle: ReportBundle = {
      report: minimalReport,
      files: [{ path: "screenshots/step-2.png", data: Buffer.from([1, 2, 3]) }],
    };

    await store.save(bundle);

    expect(await readFile(join(dir, "screenshots", "step-2.png"))).toEqual(Buffer.from([1, 2, 3]));
  });

  it("writes only report.json when files is empty", async () => {
    const dir = await mkdtemp(join(tmpdir(), "jevwright-report-store-"));
    tempDirs.push(dir);

    const store = createFileReportStore(dir);
    const bundle: ReportBundle = {
      report: minimalReport,
      files: [],
    };

    await store.save(bundle);

    expect(await readdir(dir)).toEqual(["report.json"]);
  });

  it("throws ReportStoreError with the directory and error code when writing fails", async () => {
    const baseDir = await mkdtemp(join(tmpdir(), "jevwright-report-store-"));
    tempDirs.push(baseDir);

    const blockerFile = join(baseDir, "blocker");
    await writeFile(blockerFile, "x", "utf8");

    const dir = join(blockerFile, "child");
    const store = createFileReportStore(dir);
    const bundle: ReportBundle = {
      report: minimalReport,
      files: [],
    };

    await expect(store.save(bundle)).rejects.toMatchObject({
      name: "ReportStoreError",
      message: `Failed to write report to ${dir} (ENOTDIR)`,
    });
  });

  it("uses UNKNOWN when the error has no code", async () => {
    const dir = await mkdtemp(join(tmpdir(), "jevwright-report-store-"));
    tempDirs.push(dir);

    const store = createFileReportStore(dir);
    const circular = { ...minimalReport, steps: [] } as Report;
    (circular as Report & { self?: unknown }).self = circular;

    const bundle: ReportBundle = {
      report: circular,
      files: [],
    };

    await expect(store.save(bundle)).rejects.toMatchObject({
      name: "ReportStoreError",
      message: `Failed to write report to ${dir} (UNKNOWN)`,
    });
  });
});
