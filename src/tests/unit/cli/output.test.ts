import { describe, expect, it } from "vitest";
import type { Diagnostic } from "@/core/syntax/index.js";
import type { StepResult } from "@/core/executor/index.js";
import type { Report } from "@/core/report/index.js";
import {
  formatMultiFileSummary,
  formatRunError,
  formatRunFileHeader,
  formatRunSummary,
  formatStepResult,
  formatUnexpectedError,
  formatValidateDiagnostic,
  formatValidateFailed,
  formatValidateJson,
  formatValidatePassed,
} from "@/cli/output.js";

describe("output", () => {
  it("formats a validate diagnostic line", () => {
    const diagnostic: Diagnostic = { code: "E005", message: 'Unknown action "aiAct"', line: 12 };

    expect(formatValidateDiagnostic("tests/broken.yaml", diagnostic)).toBe(
      '✖ tests/broken.yaml:12 — Error: Unknown action "aiAct"',
    );
  });

  it("formats the validation PASSED line", () => {
    expect(formatValidatePassed(2)).toBe("✔ Validation PASSED (2 files).");
  });

  it("formats the validation FAILED line", () => {
    expect(formatValidateFailed(3)).toBe("Validation FAILED (3 errors).");
  });

  it("formats --json for two files, one with a diagnostic and one valid (exact string, keys in order file, code, message, line)", () => {
    const results = [
      { file: "suite/broken.yaml", diagnostics: [{ code: "E005", message: 'Unknown action "aiAct"', line: 12 }] },
      { file: "suite/valid.yaml", diagnostics: [] },
    ];

    expect(formatValidateJson(results)).toBe(`[
  {
    "file": "suite/broken.yaml",
    "code": "E005",
    "message": "Unknown action \\"aiAct\\"",
    "line": 12
  }
]`);
  });

  it('formats --json as "[]" when there are no diagnostics', () => {
    expect(formatValidateJson([])).toBe("[]");
  });

  it("formats the run file header line", () => {
    expect(formatRunFileHeader("suite/target/login.yaml")).toBe("▶ suite/target/login.yaml");
  });

  it("matches the three step lines of the cli.md 1.4.2 example character for character", () => {
    const open: StepResult = {
      index: 0,
      line: 8,
      action: "open",
      status: "passed",
      startedAt: "2026-11-07T10:00:00.000Z",
      durationMs: 410,
      dialogs: [],
    };
    const click: StepResult = {
      index: 1,
      line: 11,
      action: "click",
      status: "passed",
      startedAt: "2026-11-07T10:00:00.000Z",
      durationMs: 1420,
      locateMethod: "visual",
      dialogs: [],
    };
    const assert: StepResult = {
      index: 2,
      line: 20,
      action: "assert",
      status: "failed",
      startedAt: "2026-11-07T10:00:00.000Z",
      durationMs: 980,
      dialogs: [],
      reason: "Statement does not hold (noul=0.12)",
    };

    expect(formatStepResult(open)).toBe("  ✔ line 8   open      410ms");
    expect(formatStepResult(click)).toBe("  ✔ line 11  click     1420ms  [visual]");
    expect(formatStepResult(assert)).toBe("  ✖ line 20  assert    980ms   Statement does not hold (noul=0.12)");
  });

  it("keeps a space before the duration for a 10-character action (rightClick)", () => {
    const step: StepResult = {
      index: 0,
      line: 3,
      action: "rightClick",
      status: "passed",
      startedAt: "2026-11-07T10:00:00.000Z",
      durationMs: 123,
      dialogs: [],
    };

    expect(formatStepResult(step)).toBe("  ✔ line 3   rightClick 123ms");
  });

  it("returns undefined for a pending step", () => {
    const step: StepResult = {
      index: 0,
      line: 3,
      action: "waitFor",
      status: "pending",
    };

    expect(formatStepResult(step)).toBeUndefined();
  });

  it("prints both [method] and the reason for a failed step with locateMethod", () => {
    const step: StepResult = {
      index: 0,
      line: 5,
      action: "click",
      status: "failed",
      startedAt: "2026-11-07T10:00:00.000Z",
      durationMs: 210,
      locateMethod: "dom",
      dialogs: [],
      reason: "Timed out waiting for selector",
    };

    expect(formatStepResult(step)).toBe("  ✖ line 5   click     210ms   [dom] Timed out waiting for selector");
  });

  it("formats the report error line", () => {
    expect(formatRunError({ kind: "infrastructure", message: "Could not stop the trace" })).toBe(
      "infrastructure: Could not stop the trace",
    );
  });

  it('formats the passed summary line (durationMs 2900 → "in 2.90s")', () => {
    const report: Report = {
      file: "suite/target/login.yaml",
      name: "User Login",
      status: "passed",
      startedAt: "2026-11-07T10:00:00.000Z",
      durationMs: 2900,
      summary: { total: 2, passed: 2, failed: 0, pending: 0 },
      steps: [],
      trace: "trace.zip",
    };

    expect(formatRunSummary(report, "jevwright-reports/2026-11-07T10-00-00.000Z/suite/target/login")).toBe(
      "✔ PASSED (2/2 passed) in 2.90s → jevwright-reports/2026-11-07T10-00-00.000Z/suite/target/login",
    );
  });

  it("omits zero counts in the failed summary line", () => {
    const report: Report = {
      file: "suite/target/login.yaml",
      name: "User Login",
      status: "failed",
      startedAt: "2026-11-07T10:00:00.000Z",
      durationMs: 2900,
      summary: { total: 4, passed: 2, failed: 1, pending: 0 },
      steps: [],
      trace: "trace.zip",
    };

    expect(formatRunSummary(report, "jevwright-reports/2026-11-07T10-00-00.000Z/suite/target/login")).toBe(
      "✖ FAILED (2/4 passed, 1 failed) in 2.90s → jevwright-reports/2026-11-07T10-00-00.000Z/suite/target/login",
    );

    const reportWithPending: Report = {
      file: "suite/target/login.yaml",
      name: "User Login",
      status: "failed",
      startedAt: "2026-11-07T10:00:00.000Z",
      durationMs: 2900,
      summary: { total: 3, passed: 0, failed: 1, pending: 2 },
      steps: [],
      trace: "trace.zip",
    };

    expect(formatRunSummary(reportWithPending, "jevwright-reports/2026-11-07T10-00-00.000Z/suite/target/login")).toBe(
      "✖ FAILED (0/3 passed, 1 failed, 2 pending) in 2.90s → jevwright-reports/2026-11-07T10-00-00.000Z/suite/target/login",
    );
  });

  it('rounds the summary duration to 2 decimals (durationMs 1234 → "1.23s")', () => {
    const report: Report = {
      file: "suite/target/login.yaml",
      name: "User Login",
      status: "passed",
      startedAt: "2026-11-07T10:00:00.000Z",
      durationMs: 1234,
      summary: { total: 1, passed: 1, failed: 0, pending: 0 },
      steps: [],
      trace: "trace.zip",
    };

    expect(formatRunSummary(report, "jevwright-reports/2026-11-07T10-00-00.000Z/suite/target/login")).toBe(
      "✔ PASSED (1/1 passed) in 1.23s → jevwright-reports/2026-11-07T10-00-00.000Z/suite/target/login",
    );
  });

  it("formats the unexpected error line", () => {
    expect(formatUnexpectedError("suite/target/login.yaml", "TypeError")).toBe(
      "suite/target/login.yaml: unexpected error (TypeError)",
    );
  });

  it("formats the multi-file final line", () => {
    expect(formatMultiFileSummary(2, 1, 0)).toBe("3 files: 2 passed, 1 failed, 0 invalid");
  });
});
