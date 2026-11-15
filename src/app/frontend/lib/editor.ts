import type { Diagnostic, Run } from "./api.js";

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

/** A diagnostic as a range of the source, for the editor's inline marks. */
export type DiagnosticRange = { from: number; to: number; line: number; message: string; code: string };

/** What the editor header and the status bar say about the open file. */
export type FileState = "saved" | "unsaved" | "running" | "passed" | "failed";

/** The Problems console's count: "No problems", "1 problem", "n problems". */
export function problemsSummary(diagnostics: Diagnostic[]): string {
  void diagnostics;
  return "";
}

/** Each diagnostic as its line of `source`, from the first non-blank character to the end of the line. */
export function diagnosticRanges(source: string, diagnostics: Diagnostic[]): DiagnosticRange[] {
  void source;
  void diagnostics;
  return [];
}

/** True when `next` has a diagnostic that `previous` did not, so a collapsed Problems console opens. */
export function hasNewDiagnostics(previous: Diagnostic[], next: Diagnostic[]): boolean {
  void previous;
  void next;
  return false;
}

/** The open file's state from its draft and its latest Run. */
export function fileState(input: {
  dirty: boolean;
  runStatus: Run["status"] | null;
  savedSinceRun: boolean;
}): FileState {
  void input;
  return "saved";
}

export function fileStateLabel(state: FileState): string {
  void state;
  return "";
}
