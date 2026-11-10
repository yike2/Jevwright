import { describe, expect, it } from "vitest";
import { RunAbortedError, type StepResult } from "@/core/executor/index.js";
import { buildReport, type RunOutcome } from "@/core/report/index.js";

const TRACE = Buffer.from("trace");
const PNG = Buffer.from("png");

const passed = (index: number, line: number): StepResult => ({
  index,
  line,
  action: "open",
  status: "passed",
  startedAt: "2026-11-05T10:00:00.100Z",
  durationMs: 40,
  dialogs: [],
});

const outcome = (overrides: Partial<RunOutcome> = {}): RunOutcome => ({
  file: "tests/login.yaml",
  testCase: { name: "User Login", timeoutMs: 1000, runTimeoutMs: 600000, steps: [] },
  startedAt: new Date("2026-11-05T10:00:00.000Z"),
  durationMs: 2900,
  steps: [passed(0, 3), passed(1, 5)],
  trace: TRACE,
  ...overrides,
});

describe("buildReport", () => {
  it("reports a passing Run with its steps, summary, and trace", () => {
    const { report, files } = buildReport(outcome());

    expect(report).toEqual({
      file: "tests/login.yaml",
      name: "User Login",
      status: "passed",
      startedAt: "2026-11-05T10:00:00.000Z",
      durationMs: 2900,
      summary: { total: 2, passed: 2, failed: 0, pending: 0 },
      steps: [passed(0, 3), passed(1, 5)],
      trace: "trace.zip",
    });
    expect(files).toEqual([{ path: "trace.zip", data: TRACE }]);
  });

  it("writes a failed step's screenshot as a file and puts its path in the Report", () => {
    const failed: StepResult = {
      index: 1,
      line: 5,
      action: "click",
      status: "failed",
      startedAt: "2026-11-05T10:00:00.200Z",
      durationMs: 1000,
      locateMethod: "selector",
      dialogs: [],
      reason: "Timed out after 1000 ms waiting for #go",
      screenshot: PNG,
    };
    const { report, files } = buildReport(
      outcome({ steps: [passed(0, 3), failed, { index: 2, line: 7, action: "back", status: "pending" }] }),
    );

    expect(report.status).toBe("failed");
    expect(report.summary).toEqual({ total: 3, passed: 1, failed: 1, pending: 1 });
    expect(report.steps[1]).toEqual({ ...failed, screenshot: "screenshots/step-1.png" });
    expect(files).toEqual([
      { path: "trace.zip", data: TRACE },
      { path: "screenshots/step-1.png", data: PNG },
    ]);
    expect(JSON.stringify(report)).not.toContain("Buffer");
  });

  it("writes a passed step's screenshot as a file and puts its path in the Report", () => {
    const shot: StepResult = {
      index: 0,
      line: 3,
      action: "open",
      status: "passed",
      startedAt: "2026-11-05T10:00:00.100Z",
      durationMs: 40,
      dialogs: [],
      screenshot: PNG,
    };

    const { report, files } = buildReport(outcome({ steps: [shot, passed(1, 5)] }));

    expect(report.steps).toEqual([{ ...passed(0, 3), screenshot: "screenshots/step-0.png" }, passed(1, 5)]);
    expect(files).toEqual([
      { path: "trace.zip", data: TRACE },
      { path: "screenshots/step-0.png", data: PNG },
    ]);
  });

  it("keeps a failed step without a screenshot as it is, with no file", () => {
    const failed: StepResult = {
      index: 0,
      line: 3,
      action: "open",
      status: "failed",
      startedAt: "2026-11-05T10:00:00.100Z",
      durationMs: 0,
      dialogs: [],
      reason: "Variable {{BASE}} is not set",
    };
    const { report, files } = buildReport(outcome({ steps: [failed] }));

    expect(report.steps).toEqual([failed]);
    expect(files.map(({ path }) => path)).toEqual(["trace.zip"]);
  });

  it("fails the Run and copies the Run error when the Run was aborted", () => {
    const error = { kind: "infrastructure" as const, message: "Could not stop the trace" };
    const { report } = buildReport(outcome({ error }));

    expect(report.status).toBe("failed");
    expect(report.error).toEqual(error);
  });

  it("keeps only the kind and message when the caller passes the RunAbortedError itself", () => {
    const error = new RunAbortedError("timeout", "The run did not finish within runTimeoutMs (50 ms)", [], TRACE);
    const { report } = buildReport(outcome({ error }));

    expect(JSON.parse(JSON.stringify(report)).error).toEqual({
      kind: "timeout",
      message: "The run did not finish within runTimeoutMs (50 ms)",
    });
  });

  it("leaves out the trace when it is empty", () => {
    const { report, files } = buildReport(outcome({ trace: Buffer.alloc(0) }));

    expect(report).not.toHaveProperty("trace");
    expect(files).toEqual([]);
  });
});
