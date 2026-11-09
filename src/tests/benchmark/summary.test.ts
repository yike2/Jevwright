import { describe, expect, it } from "vitest";
import type { LocateMethod } from "@/core/executor/index.js";
import type { Report, ReportStep } from "@/core/report/index.js";
import type { Step, TestCase } from "@/core/syntax/index.js";
import { isRight, summarize, type SuiteRun } from "./summary.js";

type Ran = { step: Step; status: "passed" | "failed" | "pending"; durationMs?: number; locateMethod?: LocateMethod };

const click: Step = { line: 3, action: "click", target: "Login button" };
const check: Step = { line: 4, action: "assert", check: { selector: "h1", text: "Products" } };
const statement: Step = { line: 5, action: "assert", statement: "The cart is empty" };
const condition: Step = { line: 6, action: "waitFor", condition: "The products are shown" };
const open: Step = { line: 2, action: "open", url: "/" };

const ran = (step: Step, status: Ran["status"] = "passed", more: Partial<Ran> = {}): Ran => ({ step, status, ...more });

// The Report of one try whose steps ran as `steps` describe; it passes when every step passed.
function report(file: string, steps: Ran[]): Report {
  const reportSteps = steps.map(({ step, status, durationMs = 100, locateMethod }, index): ReportStep => {
    const info = { index, line: step.line, action: step.action };
    if (status === "pending") return { ...info, status };
    const done = { ...info, startedAt: "2026-11-09T10:00:00.000Z", durationMs, dialogs: [], locateMethod };
    return status === "passed" ? { ...done, status } : { ...done, status, reason: `step ${index} failed` };
  });
  const failed = reportSteps.filter((step) => step.status === "failed").length;
  const passed = reportSteps.filter((step) => step.status === "passed").length;
  return {
    file: `src/tests/benchmark/suite/${file}`,
    name: file,
    status: passed === steps.length ? "passed" : "failed",
    startedAt: "2026-11-09T10:00:00.000Z",
    durationMs: 1000,
    summary: { total: steps.length, passed, failed, pending: steps.length - passed - failed },
    steps: reportSteps,
  };
}

const testCase = (steps: Ran[]): TestCase => ({
  name: "case",
  timeoutMs: 15000,
  runTimeoutMs: 600000,
  steps: steps.map(({ step }) => step),
});

// A SuiteRun of `file` with one Report per try; every try runs the same steps.
function run(file: string, ...tries: Ran[][]): SuiteRun {
  return { file, tags: [], testCase: testCase(tries[0]), tries: tries.map((steps) => report(file, steps)) };
}

const tagged = (tags: string[], suiteRun: SuiteRun): SuiteRun => ({ ...suiteRun, tags });
const passing = (file: string) => run(file, [ran(open)]);
const failing = (file: string) => run(file, [ran(open, "failed")]);
const flaky = (file: string) => run(file, [ran(open, "failed")], [ran(open)]);

describe("isRight", () => {
  it("is right for a passed try outside assert/fails/", () => {
    const steps = [ran(open)];

    expect(isRight("target/sign-in.yaml", report("target/sign-in.yaml", steps), testCase(steps))).toBe(true);
    expect(isRight("target/sign-in.yaml", report("target/sign-in.yaml", [ran(open, "failed")]), testCase(steps))).toBe(
      false,
    );
  });

  it("is right for an assert/fails/ try only when its last step failed", () => {
    const file = "assert/fails/a.yaml";
    const steps = [ran(open), ran(statement)];

    expect(isRight(file, report(file, [ran(open), ran(statement, "failed")]), testCase(steps))).toBe(true);
    expect(isRight(file, report(file, [ran(open, "failed"), ran(statement, "pending")]), testCase(steps))).toBe(false);
    expect(isRight(file, report(file, [ran(open), ran(statement)]), testCase(steps))).toBe(false);
  });
});

describe("summarize", () => {
  it("gives each file its outcome: stable on the first try, flaky on the retry, wrong on neither", () => {
    const summary = summarize([
      tagged(["button"], passing("atomic/a.yaml")),
      flaky("atomic/b.yaml"),
      run("atomic/c.yaml", [ran(open, "failed")], [ran(open, "failed")]),
    ]);

    expect(summary.cases).toEqual([
      { file: "atomic/a.yaml", tags: ["button"], outcome: "stable" },
      { file: "atomic/b.yaml", tags: [], outcome: "flaky" },
      { file: "atomic/c.yaml", tags: [], outcome: "wrong" },
    ]);
  });

  it("gives the pass rate of each locating folder, counting flaky files as passed and alone", () => {
    const summary = summarize([
      passing("selector/sign-in.yaml"),
      failing("selector/checkout.yaml"),
      flaky("atomic/a.yaml"),
    ]);

    expect(summary.passRates).toEqual({
      selector: { passed: 1, flaky: 0, total: 2, rate: 0.5 },
      target: { passed: 0, flaky: 0, total: 0, rate: 0 },
      both: { passed: 0, flaky: 0, total: 0, rate: 0 },
      atomic: { passed: 1, flaky: 1, total: 1, rate: 1 },
    });
  });

  it("gives the pass rate of each Flow group in each Flow folder", () => {
    const summary = summarize([
      passing("target/sign-in.yaml"),
      failing("target/checkout.yaml"),
      passing("target/spinner.yaml"),
      flaky("target/visual-user-checkout.yaml"),
      passing("atomic/sign-in-username.yaml"),
    ]);

    expect(summary.groups).toEqual([
      { folder: "target", group: "Shopping", passed: 1, flaky: 0, total: 2, rate: 0.5 },
      { folder: "target", group: "Dynamic pages", passed: 1, flaky: 0, total: 1, rate: 1 },
      { folder: "target", group: "Other users", passed: 1, flaky: 1, total: 1, rate: 1 },
    ]);
  });

  it("gives the judging accuracy of holds/, fails/, and both, a fails/ file right only when it fails at its last step", () => {
    const summary = summarize([
      run("assert/holds/a.yaml", [ran(open), ran(statement)]),
      run("assert/holds/b.yaml", [ran(open), ran(statement, "failed")]),
      run("assert/fails/at-last.yaml", [ran(open), ran(statement, "failed")]),
      run("assert/fails/early.yaml", [ran(open, "failed"), ran(statement, "pending")]),
      run("assert/fails/passed.yaml", [ran(open), ran(statement)], [ran(open), ran(statement, "failed")]),
    ]);

    expect(summary.judging).toEqual({
      holds: { passed: 1, flaky: 0, total: 2, rate: 0.5 },
      fails: { passed: 2, flaky: 1, total: 3, rate: 2 / 3 },
      all: { passed: 3, flaky: 1, total: 5, rate: 0.6 },
    });
  });

  it("gives the rate of each tag over the files that carry it", () => {
    const summary = summarize([
      tagged(["button", "offscreen"], failing("atomic/a.yaml")),
      tagged(["button"], passing("atomic/b.yaml")),
      tagged(["price"], flaky("assert/holds/c.yaml")),
    ]);

    expect(summary.tags).toEqual({
      button: { passed: 1, flaky: 0, total: 2, rate: 0.5 },
      offscreen: { passed: 0, flaky: 0, total: 1, rate: 0 },
      price: { passed: 1, flaky: 1, total: 1, rate: 1 },
    });
  });

  it("times every Jev step of every try by kind: visual and dom locating, and steps Jev judges", () => {
    const summary = summarize([
      run(
        "target/sign-in.yaml",
        [ran(click, "failed", { locateMethod: "dom", durationMs: 3000 })],
        [ran(click, "passed", { locateMethod: "visual", durationMs: 800 })],
      ),
      run("target/checkout.yaml", [ran(click, "passed", { locateMethod: "visual", durationMs: 1200 })]),
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

  it("lists each flaky or wrong file with the failed step of its first try", () => {
    const summary = summarize([
      run(
        "target/checkout.yaml",
        [ran(open), ran(click, "failed", { locateMethod: "visual" })],
        [ran(open), ran(click, "failed")],
      ),
      flaky("atomic/a.yaml"),
      run("assert/fails/passed.yaml", [ran(statement)], [ran(statement)]),
      passing("selector/sign-in.yaml"),
    ]);

    expect(summary.failures).toEqual([
      { file: "target/checkout.yaml", outcome: "wrong", line: 3, action: "click", reason: "step 1 failed" },
      { file: "atomic/a.yaml", outcome: "flaky", line: 2, action: "open", reason: "step 0 failed" },
      {
        file: "assert/fails/passed.yaml",
        outcome: "wrong",
        reason: "Expected the last step to fail, but the file passed",
      },
    ]);
  });

  it("gives a Run error as the reason when no step failed", () => {
    const timedOut = run("target/slider.yaml", [ran(open), ran(click, "pending")]);
    timedOut.tries[0].error = { kind: "timeout", message: "Run timed out after 600000ms" };

    expect(summarize([timedOut]).failures).toEqual([
      { file: "target/slider.yaml", outcome: "wrong", reason: "timeout: Run timed out after 600000ms" },
    ]);
  });
});
