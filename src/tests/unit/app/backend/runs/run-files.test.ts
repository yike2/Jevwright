import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveRunFile, runFilesStore, writeRunFile } from "@/app/backend/src/runs/run-files.js";
import type { Report } from "@/core/report/index.js";

const RUNS = "/data/runs";
const RUN_ID = "0b1c2d3e-4f50-4a6b-8c7d-9e0f1a2b3c4d";

describe("resolveRunFile", () => {
  it("resolves files inside the Run's folder", () => {
    expect(resolveRunFile(RUNS, RUN_ID, "report.json")).toBe(`${RUNS}/${RUN_ID}/report.json`);
    expect(resolveRunFile(RUNS, RUN_ID, "screenshots/step-0.png")).toBe(`${RUNS}/${RUN_ID}/screenshots/step-0.png`);
  });

  it.each([
    ["../other/report.json"],
    ["screenshots/../../other/report.json"],
    [".."],
    ["/etc/passwd"],
    [""],
    ["."],
    ["screenshots/.."],
  ])("rejects %j, which is not a file inside the Run's folder", (path) => {
    expect(resolveRunFile(RUNS, RUN_ID, path)).toBeUndefined();
  });

  it("resolves a relative RUNS_DIR against the working directory", () => {
    expect(resolveRunFile("./data/runs", RUN_ID, "trace.zip")).toBe(
      join(process.cwd(), "data/runs", RUN_ID, "trace.zip"),
    );
  });
});

describe("Run Files on disk", () => {
  const report = { file: "add.yaml", name: "Add", status: "passed" } as Report;

  it("writes one file, creating its folders", async () => {
    const runsDir = await mkdtemp(join(tmpdir(), "run-files-"));

    await writeRunFile(runsDir, RUN_ID, "screenshots/step-0.png", Buffer.from("png"));

    expect(await readFile(join(runsDir, RUN_ID, "screenshots/step-0.png"), "utf8")).toBe("png");
  });

  it("saves the Bundle as report.json and its files under the Run's folder", async () => {
    const runsDir = await mkdtemp(join(tmpdir(), "run-files-"));

    await runFilesStore(runsDir, RUN_ID).save({
      report,
      files: [
        { path: "trace.zip", data: Buffer.from("zip") },
        { path: "screenshots/step-1.png", data: Buffer.from("png") },
      ],
    });

    expect(JSON.parse(await readFile(join(runsDir, RUN_ID, "report.json"), "utf8"))).toEqual(report);
    expect(await readFile(join(runsDir, RUN_ID, "trace.zip"), "utf8")).toBe("zip");
    expect(await readFile(join(runsDir, RUN_ID, "screenshots/step-1.png"), "utf8")).toBe("png");
  });

  it("refuses a Bundle file whose path leaves the Run's folder", async () => {
    const runsDir = await mkdtemp(join(tmpdir(), "run-files-"));
    await writeFile(join(runsDir, "outside.txt"), "kept");

    await expect(
      runFilesStore(runsDir, RUN_ID).save({ report, files: [{ path: "../outside.txt", data: Buffer.from("x") }] }),
    ).rejects.toThrow();
    expect(await readFile(join(runsDir, "outside.txt"), "utf8")).toBe("kept");
  });
});
