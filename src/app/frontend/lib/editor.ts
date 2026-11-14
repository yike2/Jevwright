import type { Diagnostic } from "./api.js";

export function validationSummary(diagnostics: Diagnostic[]): string {
  if (diagnostics.length === 0) {
    return "Valid. Ready to run.";
  }

  if (diagnostics.length === 1) {
    return "1 validation error";
  }

  return `${diagnostics.length} validation errors`;
}

export function formatDiagnostic(d: Diagnostic): string {
  return `Line ${d.line}: ${d.message}`;
}

export function isVariableName(name: string): boolean {
  return /^[A-Z_][A-Z0-9_]*$/.test(name);
}
