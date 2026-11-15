import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { analyze } from "@/core/syntax/index.js";
import { isAction } from "@/core/syntax/steps.js";
import { quickStartProject } from "@/app/backend/src/workspace/quick-start.js";
import {
  ACTIONS,
  CHOICES,
  DEBUG_RECEIPT,
  DEMO_APP_URL,
  FIXES,
  LOCATE_METHODS,
  LOCATED_STEP,
  OUTPUT_RECEIPT,
  QUICK_START_FILES,
  QUICK_START_FOLDERS,
  REPLAY_RUNS,
  STATS,
  replayBadge,
  type Report,
} from "@/app/frontend/lib/landing.js";
import { asTestFile } from "../../docs/yaml-blocks.js";

const PUBLIC = new URL("../../../../app/frontend/public/", import.meta.url);
const seededFiles = () =>
  (
    quickStartProject("https://demo.example.com").folders as {
      create: { name: string; testFiles: { create: { name: string; source: string }[] } }[];
    }
  ).create.flatMap((folder) => folder.testFiles.create.map((testFile) => ({ ...testFile, folder: folder.name })));
// The receipts come from the Quick Start files as the backend seeds them.
const seeded = (name: string) => seededFiles().find((testFile) => testFile.name === name)!.source;
const runOf = (file: string) => REPLAY_RUNS.find((run) => run.file === file)!;
const SIGN_IN = "sign-in-and-see-products.yaml";
const STALE = "fall-back-from-a-stale-selector.yaml";
const JEV = "find-and-check-with-jev.yaml";
const methods = (file: string) =>
  runOf(file).report.steps.map((step) => ("locateMethod" in step ? (step.locateMethod ?? null) : null));

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

  it("shows the Debug console of the seven-errors file: the Syntax Analyzer's diagnostics, line by line", () => {
    const diagnostics = analyze(seeded("seven-errors-at-once.yaml")).diagnostics;

    expect(DEBUG_RECEIPT.split("\n")).toEqual([
      `${diagnostics.length} problems`,
      ...diagnostics.map((d) => `Line ${d.line}: ${d.message}  ${d.code}`),
    ]);
  });

  it("shows the Output console of the sign-in Run: one passed line per step of the seeded file", () => {
    const steps = analyze(seeded(SIGN_IN)).testCase!.steps;
    const lines = OUTPUT_RECEIPT.split("\n");

    expect(lines[0]).toBe(`Passed  ${steps.length}/${steps.length} passed`);
    expect(lines.slice(1)).toEqual(
      steps.map((step, index) => `Step ${index + 1}  ${step.action}  line ${step.line}  Passed`),
    );
  });

  it("replays real passed Run reports, the one with every Jev use first, whose screenshots are shipped", () => {
    expect(REPLAY_RUNS.map((run) => run.file)).toEqual([JEV, STALE, SIGN_IN]);
    for (const run of REPLAY_RUNS) {
      const total = analyze(seeded(run.file)).testCase!.steps.length;
      expect(run.report.status).toBe("passed");
      expect(run.report.summary).toEqual({ total, passed: total, failed: 0, pending: 0 });
      for (const step of run.report.steps) {
        expect(step.status).toBe("passed");
        expect(existsSync(new URL(`${run.assets}/step-${step.index}.webp`.slice(1), PUBLIC)), run.file).toBe(true);
      }
    }
    expect(methods(SIGN_IN)).toEqual([null, "selector", "selector", "selector", null, null]);
    expect(["visual", "dom"]).toContain(methods(STALE)[3]);
  });

  it("replays each Run of the seeded file: its name, and each step's action at the seeded line", () => {
    for (const run of REPLAY_RUNS) {
      const steps = analyze(seeded(run.file)).testCase!.steps;
      expect(run.report.file).toBe(run.file);
      expect(
        run.report.steps.map(({ index, action, line }) => ({ index, action, line })),
        run.file,
      ).toEqual(steps.map(({ action, line }, index) => ({ index, action, line })));
    }
  });

  it("replays a Run where Jev locates by screenshot and by DOM and judges a statement alone", () => {
    const steps = analyze(seeded(JEV)).testCase!.steps;

    expect(methods(JEV)).toEqual([null, "visual", "dom", null, "selector", "selector", null, null]);
    expect(runOf(JEV).judged).toEqual([7]);
    // Only a statement, so Playwright has nothing to check and Jev certainly judged it.
    expect(steps[7]).toMatchObject({ action: "assert", statement: expect.any(String) });
    expect(steps[7]).not.toHaveProperty("selector");
  });

  it("badges only the steps Jev worked on in the replayed Runs", () => {
    const badges = (file: string) => runOf(file).report.steps.map((step) => replayBadge(runOf(file), step));

    expect(badges(JEV)).toEqual([null, "AI locate", "AI locate", null, null, null, null, "AI assert"]);
    expect(badges(STALE)).toEqual([null, null, null, "AI locate", null, null]);
    expect(badges(SIGN_IN)).toEqual([null, null, null, null, null, null]);
  });

  it("shows under Report the first step Jev located in the first replayed Run", () => {
    expect(LOCATED_STEP).toBe(runOf(JEV).report.steps[1]);
    expect(methods(JEV)[1]).toBe("visual");
  });

  it("badges a Visual or DOM Locate as AI locate and a judged statement as AI assert, nothing else", () => {
    const base = { line: 1, startedAt: "", durationMs: 1, dialogs: [], status: "passed" as const };
    const run = { ...runOf(SIGN_IN), judged: [2] };
    const step = (index: number, action: string, locateMethod?: string) =>
      ({ ...base, index, action, ...(locateMethod ? { locateMethod } : {}) }) as Report["steps"][number];

    expect(replayBadge(run, step(0, "click", "visual"))).toBe("AI locate");
    expect(replayBadge(run, step(0, "click", "dom"))).toBe("AI locate");
    expect(replayBadge(run, step(0, "click", "selector"))).toBeNull();
    expect(replayBadge(run, step(1, "assert"))).toBeNull();
    expect(replayBadge(run, step(2, "assert"))).toBe("AI assert");
  });

  it("marks as judged only steps whose statement or condition Jev must judge", () => {
    for (const run of REPLAY_RUNS) {
      const steps = analyze(seeded(run.file)).testCase!.steps;
      for (const index of run.judged) {
        const step = steps[index]!;
        expect("statement" in step || "condition" in step, `${run.file} step ${index}`).toBe(true);
      }
    }
  });

  it("states only numbers the code and the shipped Run back up", () => {
    expect(STATS.map((stat) => stat.value)).toEqual([
      String(ACTIONS.length),
      String(LOCATE_METHODS.length),
      "0",
      `${(runOf(SIGN_IN).report.durationMs / 1000).toFixed(1)} s`,
    ]);
  });

  it("describes the Quick Start folders the backend creates, in order", () => {
    const folders = (quickStartProject("https://demo.example.com").folders as { create: { name: string }[] }).create;

    expect(QUICK_START_FOLDERS.map((folder) => folder.name)).toEqual(folders.map((folder) => folder.name));
  });

  it("names Quick Start files that the backend seeds, in the folder it puts them in", () => {
    expect(QUICK_START_FILES.length).toBeGreaterThanOrEqual(4);
    for (const file of QUICK_START_FILES)
      expect(seededFiles().find((seed) => seed.name === file.file)?.folder, file.file).toBe(file.folder);
    const cookieFile = QUICK_START_FILES.find((file) => /cookie/i.test(file.feature))!;
    expect(analyze(seeded(cookieFile.file)).testCase!.cookies).toBeDefined();
    expect(DEMO_APP_URL).toBe("https://demo.94.72.126.118.sslip.io");
  });

  it("shows a valid YAML snippet for each choice", () => {
    expect(CHOICES.map((choice) => choice.write)).toEqual([
      "selector",
      "target",
      "selector + target",
      "assert with selector, text or url",
      "assert with statement",
    ]);
    for (const choice of CHOICES) expect(analyze(asTestFile(choice.yaml)).diagnostics, choice.write).toEqual([]);
  });

  it("shows each fix as Playwright code next to a valid Jevwright step", () => {
    expect(FIXES.length).toBeGreaterThanOrEqual(3);
    for (const fix of FIXES) {
      expect(fix.playwright, fix.problem).toMatch(/page\./);
      expect(analyze(asTestFile(fix.jevwright)).diagnostics, fix.problem).toEqual([]);
    }
  });
});
