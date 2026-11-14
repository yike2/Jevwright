import type { Diagnostic } from "./api.js";

export function validationSummary(_diagnostics: Diagnostic[]): string {
  throw new Error("Not implemented");
}

export function formatDiagnostic(_d: Diagnostic): string {
  throw new Error("Not implemented");
}

export function isVariableName(_name: string): boolean {
  throw new Error("Not implemented");
}
