import { describe, expect, it } from "vitest";
import type { LocateMethod } from "@/core/executor/index.js";
import type { Report, ReportStep } from "@/core/report/index.js";
import type { Step } from "@/core/syntax/index.js";
import { summarize, type SuiteRun } from "./summary.js";

type Ran = { step: Step; status: "passed" | "failed" | "pending"; durationMs?: number; locateMethod?: LocateMethod };

const click: Step = { line: 3, action: "click", target: "Login button" };
const check: Step = { line: 4, action: "assert", check: { selector: "h1", text: "Products" } };
const statement: Step = { line: 5, action: "assert", statement: "The cart is empty" };
const condition: Step = { line: 6, action: "waitFor", condition: "The products are shown" };
const open: Step = { line: 2, action: "open", url: "/" };

const ran = (step: Step, status: Ran["status"] = "passed", more: Partial<Ran> = {}): Ran => ({ step, status, ...more });

// A SuiteRun for `file` whose steps ran as `steps` describe; the Report passes when every step passed.
function run(file: string, steps: Ran[]): SuiteRun {
  const reportSteps = steps.map(({ step, status, durationMs = 100, locateMethod }, index): ReportStep => {
    const info = { index, line: step.line, action: step.action };
    if (status === "pending") return { ...info, status };
    const done = { ...info, startedAt: "2026-11-09T10:00:00.000Z", durationMs, dialogs: [], locateMethod };
    return status === "passed" ? { ...done, status } : { ...done, status, reason: `step ${index} failed` };
  });
  const failed = reportSteps.filter((step) => step.status === "failed").length;
  const passed = reportSteps.filter((step) => step.status === "passed").length;
  const report: Report = {
    file: `src/tests/benchmark/suite/${file}`,
    name: file,
    status: passed === steps.length ? "passed" : "failed",
    startedAt: "2026-11-09T10:00:00.000Z",
    durationMs: 1000,
    summary: { total: steps.length, passed, failed, pending: steps.length - passed - failed },
    steps: reportSteps,
  };
  return {
    file,
    report,
    testCase: { name: file, timeoutMs: 15000, runTimeoutMs: 600000, steps: steps.map((s) => s.step) },
  };
}

const passing = (file: string) => run(file, [ran(open)]);
const failing = (file: string) => run(file, [ran(open, "failed")]);

describe("summarize", () => {
  it("gives the pass rate of each locating folder, zero for a folder with no runs", () => {
    const summary = summarize([
      passing("selector/sign-in.yaml"),
      failing("selector/checkout.yaml"),
      passing("atomic/a.yaml"),
    ]);

    expect(summary.passRates).toEqual({
      selector: { passed: 1, total: 2, rate: 0.5 },
      target: { passed: 0, total: 0, rate: 0 },
      both: { passed: 0, total: 0, rate: 0 },
      atomic: { passed: 1, total: 1, rate: 1 },
    });
  });

  it("gives the pass rate of each Flow group in each Flow folder", () => {
    const summary = summarize([
      passing("target/sign-in.yaml"),
      failing("target/checkout.yaml"),
      passing("target/spinner.yaml"),
      passing("target/visual-user-checkout.yaml"),
      passing("atomic/sign-in-username.yaml"),
    ]);

    expect(summary.groups).toEqual([
      { folder: "target", group: "Shopping", passed: 1, total: 2, rate: 0.5 },
      { folder: "target", group: "Dynamic pages", passed: 1, total: 1, rate: 1 },
      { folder: "target", group: "Other users", passed: 1, total: 1, rate: 1 },
    ]);
  });

  it("judges a holds/ file right when it passes", () => {
    const summary = summarize([
      run("assert/holds/a.yaml", [ran(open), ran(statement)]),
      run("assert/holds/b.yaml", [ran(open), ran(statement, "failed")]),
    ]);

    expect(summary.judging.holds).toEqual({ passed: 1, total: 2, rate: 0.5 });
  });

  it("judges a fails/ file right only when it fails at its last step", () => {
    const summary = summarize([
      run("assert/fails/at-last.yaml", [ran(open), ran(statement, "failed")]),
      run("assert/fails/early.yaml", [ran(open, "failed"), ran(statement, "pending")]),
      run("assert/fails/passed.yaml", [ran(open), ran(statement)]),
    ]);

    expect(summary.judging.fails).toEqual({ passed: 1, total: 3, rate: 1 / 3 });
  });

  it("sums up the judging of holds/ and fails/ together", () => {
    const summary = summarize([
      run("assert/holds/a.yaml", [ran(statement)]),
      run("assert/fails/b.yaml", [ran(statement)]),
    ]);

    expect(summary.judging.all).toEqual({ passed: 1, total: 2, rate: 0.5 });
  });

  it("times every Jev step by kind: visual and dom locating, and steps Jev judges", () => {
    const summary = summarize([
      run("target/sign-in.yaml", [
        ran(click, "passed", { locateMethod: "visual", durationMs: 800 }),
        ran(click, "passed", { locateMethod: "visual", durationMs: 1200 }),
        ran(click, "failed", { locateMethod: "dom", durationMs: 3000 }),
      ]),
      run("assert/holds/a.yaml", [
        ran(statement, "passed", { durationMs: 1500 }),
        ran(condition, "passed", { durationMs: 2500 }),
      ]),
    ]);

    expect(summary.latency.byKind).toEqual({
      visual: { steps: 2, averageMs: 1000, slowestMs: 1200 },
      dom: { steps: 1, averageMs: 3000, slowestMs: 3000 },
      judged: { steps: 2, averageMs: 2000, slowestMs: 2500 },
    });
    expect(summary.latency.all).toEqual({ steps: 5, averageMs: 1800, slowestMs: 3000 });
  });

  it("leaves out steps that never called Jev: selector locating, Playwright checks, and pending steps", () => {
    const summary = summarize([
      run("both/sign-in.yaml", [
        ran(open),
        ran(click, "passed", { locateMethod: "selector" }),
        ran(check),
        ran(statement, "pending"),
      ]),
    ]);

    expect(summary.latency.all).toEqual({ steps: 0, averageMs: 0, slowestMs: 0 });
  });

  it("shows the PRD target of 3 seconds for a Jev step", () => {
    expect(summarize([]).latency.prdTargetMs).toBe(3000);
  });

  it("lists each file that did not do what it should, with its failed step", () => {
    const summary = summarize([
      run("target/checkout.yaml", [ran(open), ran(click, "failed", { locateMethod: "visual" })]),
      run("assert/fails/passed.yaml", [ran(statement)]),
      run("assert/fails/at-last.yaml", [ran(statement, "failed")]),
      passing("selector/sign-in.yaml"),
    ]);

    expect(summary.failures).toEqual([
      { file: "target/checkout.yaml", line: 3, action: "click", reason: "step 1 failed" },
      { file: "assert/fails/passed.yaml", reason: "Expected the last step to fail, but the file passed" },
    ]);
  });

  it("gives a Run error as the reason when no step failed", () => {
    const timedOut = run("target/slider.yaml", [ran(open), ran(click, "pending")]);
    timedOut.report.error = { kind: "timeout", message: "Run timed out after 600000ms" };

    expect(summarize([timedOut]).failures).toEqual([
      { file: "target/slider.yaml", reason: "timeout: Run timed out after 600000ms" },
    ]);
  });
});
