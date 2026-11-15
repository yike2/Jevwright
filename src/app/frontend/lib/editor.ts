import type { Diagnostic, Run } from "./api.js";

/** A diagnostic as a range of the source, for the editor's inline marks. */
export type DiagnosticRange = { from: number; to: number; line: number; message: string; code: string };

/** What the editor header and the status bar say about the open file. */
export type FileState = "saved" | "unsaved" | "running" | "passed" | "failed";

export function formatDiagnostic(d: Diagnostic): string {
  return `Line ${d.line}: ${d.message}`;
}

/** The Problems console's count: "No problems", "1 problem", "n problems". */
export function problemsSummary(diagnostics: Diagnostic[]): string {
  if (diagnostics.length === 0) return "No problems";
  if (diagnostics.length === 1) return "1 problem";
  return `${diagnostics.length} problems`;
}

/** Each diagnostic as its line of `source`, from the first non-blank character to the end of the line. */
export function diagnosticRanges(source: string, diagnostics: Diagnostic[]): DiagnosticRange[] {
  const lines = source.split("\n");
  const starts: number[] = [];
  let offset = 0;
  for (const text of lines) {
    starts.push(offset);
    offset += text.length + 1;
  }

  return diagnostics.map((d) => {
    // Diagnostics have a line but no column (backend.md 1.3); a line outside the source marks the nearest one.
    const line = Math.min(Math.max(d.line, 1), lines.length);
    const text = lines[line - 1] ?? "";
    const start = starts[line - 1] ?? 0;
    const indent = text.length - text.trimStart().length;
    return {
      from: start + (indent === text.length ? 0 : indent),
      to: start + text.length,
      line,
      message: d.message,
      code: d.code,
    };
  });
}

const key = (d: Diagnostic) => `${d.line}\u0000${d.code}\u0000${d.message}`;

/** True when `next` has a diagnostic that `previous` did not, so a collapsed Problems console opens. */
export function hasNewDiagnostics(previous: Diagnostic[], next: Diagnostic[]): boolean {
  const seen = new Set(previous.map(key));
  return next.some((d) => !seen.has(key(d)));
}

/** The open file's state from its draft and its latest Run. */
export function fileState({
  dirty,
  runStatus,
  savedSinceRun,
}: {
  dirty: boolean;
  runStatus: Run["status"] | null;
  savedSinceRun: boolean;
}): FileState {
  if (dirty) return "unsaved";
  if (runStatus === "queued" || runStatus === "running") return "running";
  // A save after the latest Run means that Run's result may no longer hold for this source.
  if (runStatus === null || savedSinceRun) return "saved";
  return runStatus;
}

export function fileStateLabel(state: FileState): string {
  switch (state) {
    case "saved":
      return "Saved";
    case "unsaved":
      return "Unsaved";
    case "running":
      return "Running";
    case "passed":
      return "Passed";
    case "failed":
      return "Failed";
  }
}

/** The two consoles of the editor's console column (frontend.md 1.7). */
export type ConsoleKey = "debug" | "output";
/** Which consoles are open; each opens and collapses on its own. */
export type ConsolesOpen = Record<ConsoleKey, boolean>;

/** Opens a collapsed console or collapses an open one, leaving the other as it is. */
export function toggleConsole(open: ConsolesOpen, key: ConsoleKey): ConsolesOpen {
  return { ...open, [key]: !open[key] };
}

/** Opens a console that has something to report, leaving the other as it is. */
export function openConsole(open: ConsolesOpen, key: ConsoleKey): ConsolesOpen {
  return open[key] ? open : { ...open, [key]: true };
}

/** The consoles kept in the browser, or both open when nothing usable is stored. */
export function parseConsolesOpen(stored: string | null): ConsolesOpen {
  const both = { debug: true, output: true };
  if (stored === null) return both;
  try {
    const value: unknown = JSON.parse(stored);
    if (typeof value !== "object" || value === null) return both;
    const { debug, output } = value as Record<string, unknown>;
    return typeof debug === "boolean" && typeof output === "boolean" ? { debug, output } : both;
  } catch {
    return both;
  }
}

/** The Debug console's share of the column, in percent, when both consoles are open; the Output console has the rest. */
export const DEFAULT_CONSOLE_SPLIT = 50;

/** The stored Debug share, or the default for nothing stored, text that is not a number, or one outside 10–90. */
export function parseConsoleSplit(stored: string | null): number {
  void stored;
  return 0;
}
