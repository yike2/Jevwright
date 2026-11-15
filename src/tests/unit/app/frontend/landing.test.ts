import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { analyze } from "@/core/syntax/index.js";
import { isAction } from "@/core/syntax/steps.js";
import { quickStartProject } from "@/app/backend/src/workspace/quick-start.js";
import {
  ACTIONS,
  LOCATE_METHODS,
  QUICK_START_FOLDERS,
  REPLAY_RUNS,
  RUN_RECEIPT,
  STATS,
  VALIDATE_RECEIPT,
} from "@/app/frontend/lib/landing.js";

const PUBLIC = new URL("../../../../app/frontend/public/", import.meta.url);
// The receipts come from the Quick Start files as the backend seeds them.
const seeded = (name: string) =>
  (
    quickStartProject("https://demo.example.com").folders as {
      create: { testFiles: { create: { name: string; source: string }[] } }[];
    }
  ).create
    .flatMap((folder) => folder.testFiles.create)
    .find((testFile) => testFile.name === name)!.source;

// Every claim on the landing page is checked against the code it describes (frontend.md 1.14).
describe("landing page content", () => {
  it("lists the actions the Syntax Analyzer accepts", () => {
    expect(ACTIONS).toHaveLength(15);
    for (const action of ACTIONS) expect(isAction(action), action).toBe(true);
    expect(new Set(ACTIONS).size).toBe(ACTIONS.length);
  });

  it("names the three locate methods a report records", () => {
    expect(LOCATE_METHODS).toEqual(["selector", "visual", "dom"]);
  });

  it("shows validate output whose errors are the Syntax Analyzer's, line by line", () => {
    const expected = analyze(seeded("seven-errors-at-once.yaml")).diagnostics.map(
      (d) => `✖ tests/seven-errors-at-once.yaml:${d.line} — Error: ${d.message}`,
    );

    expect(VALIDATE_RECEIPT.split("\n").filter((line) => line.startsWith("✖"))).toEqual(expected);
    expect(VALIDATE_RECEIPT).toContain(`Validation FAILED (${expected.length} errors).`);
  });

  it("shows run output with one passed line per step of the sign-in file", () => {
    const steps = analyze(seeded("sign-in-and-see-products.yaml")).testCase!.steps;
    const passed = RUN_RECEIPT.split("\n").filter((line) => line.trimStart().startsWith("✔ line"));

    expect(passed.map((line) => Number(/line (\d+)/.exec(line)![1]))).toEqual(steps.map((step) => step.line));
    expect(RUN_RECEIPT).toContain(`PASSED (${steps.length}/${steps.length} passed)`);
  });

  it("replays real passed Run reports whose screenshots are shipped with the page", () => {
    expect(REPLAY_RUNS.map((run) => run.file)).toEqual([
      "sign-in-and-see-products.yaml",
      "fall-back-from-a-stale-selector.yaml",
    ]);
    for (const run of REPLAY_RUNS) {
      expect(run.report.status).toBe("passed");
      expect(run.report.summary).toEqual({ total: 6, passed: 6, failed: 0, pending: 0 });
      for (const step of run.report.steps) {
        expect(step.status).toBe("passed");
        expect(existsSync(new URL(`${run.assets}/step-${step.index}.webp`.slice(1), PUBLIC)), run.file).toBe(true);
      }
    }
    expect(
      REPLAY_RUNS[0]!.report.steps.map((step) => ("locateMethod" in step ? (step.locateMethod ?? null) : null)),
    ).toEqual([null, "selector", "selector", "selector", null, null]);
    const fallback = REPLAY_RUNS[1]!.report.steps[3]!;
    expect(["visual", "dom"]).toContain("locateMethod" in fallback ? fallback.locateMethod : null);
  });

  it("states only numbers the code and the shipped Run back up", () => {
    expect(STATS.map((stat) => stat.value)).toEqual([
      String(ACTIONS.length),
      String(LOCATE_METHODS.length),
      "0",
      `${(REPLAY_RUNS[0]!.report.durationMs / 1000).toFixed(1)} s`,
    ]);
  });

  it("describes the Quick Start folders the backend creates, in order", () => {
    const folders = (quickStartProject("https://demo.example.com").folders as { create: { name: string }[] }).create;

    expect(QUICK_START_FOLDERS.map((folder) => folder.name)).toEqual(folders.map((folder) => folder.name));
  });
});
