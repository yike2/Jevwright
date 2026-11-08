import type { Diagnostic } from "@/core/syntax/index.js";
import type { StepResult } from "@/core/executor/index.js";
import type { Report } from "@/core/report/index.js";

export function formatValidateDiagnostic(file: string, diagnostic: Diagnostic): string {
  return `✖ ${file}:${diagnostic.line} — Error: ${diagnostic.message}`;
}

export function formatValidatePassed(fileCount: number): string {
  return `✔ Validation PASSED (${fileCount} files).`;
}

export function formatValidateFailed(errorCount: number): string {
  return `Validation FAILED (${errorCount} errors).`;
}

export function formatValidateJson(
  results: readonly { file: string; diagnostics: readonly Diagnostic[] }[],
): string {
  const flattened: Array<{ file: string; code: string; message: string; line: number }> = [];

  for (const result of results) {
    for (const diagnostic of result.diagnostics) {
      flattened.push({
        file: result.file,
        code: diagnostic.code,
        message: diagnostic.message,
        line: diagnostic.line,
      });
    }
  }

  return JSON.stringify(flattened, null, 2);
}

export function formatRunFileHeader(file: string): string {
  return `▶ ${file}`;
}

export function formatStepResult(step: StepResult): string | undefined {
  if (step.status === "pending") {
    return undefined;
  }

  const glyph = step.status === "passed" ? "✔" : "✖";
  const duration = `${step.durationMs}ms`;
  const suffixParts: string[] = [];

  if (step.locateMethod) {
    suffixParts.push(`[${step.locateMethod}]`);
  }

  if (step.status === "failed") {
    suffixParts.push(step.reason);
  }

  const suffix = suffixParts.length > 0 ? `${duration.padEnd(7)} ${suffixParts.join(" ")}` : duration;

  return `  ${glyph} line ${String(step.line).padEnd(3)} ${step.action.padEnd(9)} ${suffix}`;
}

export function formatRunError(error: NonNullable<Report["error"]>): string {
  return `${error.kind}: ${error.message}`;
}

export function formatRunSummary(report: Report, reportDir: string): string {
  const seconds = (report.durationMs / 1000).toFixed(2);

  if (report.status === "passed") {
    return `✔ PASSED (${report.summary.passed}/${report.summary.total} passed) in ${seconds}s → ${reportDir}`;
  }

  const parts = [`${report.summary.passed}/${report.summary.total} passed`];

  if (report.summary.failed > 0) {
    parts.push(`${report.summary.failed} failed`);
  }

  if (report.summary.pending > 0) {
    parts.push(`${report.summary.pending} pending`);
  }

  return `✖ FAILED (${parts.join(", ")}) in ${seconds}s → ${reportDir}`;
}

export function formatUnexpectedError(file: string, errorName: string): string {
  return `${file}: unexpected error (${errorName})`;
}

export function formatMultiFileSummary(passed: number, failed: number, invalid: number): string {
  const total = passed + failed + invalid;
  return `${total} files: ${passed} passed, ${failed} failed, ${invalid} invalid`;
}
