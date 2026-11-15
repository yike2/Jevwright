import { describe, expect, it } from "vitest";

import type { Diagnostic } from "@/app/frontend/lib/api.js";
import {
  diagnosticRanges,
  fileState,
  fileStateLabel,
  formatDiagnostic,
  hasNewDiagnostics,
  problemsSummary,
} from "@/app/frontend/lib/editor.js";

const aiAct: Diagnostic = { code: "E005", message: 'Unknown action "aiAct"', line: 3 };
const noUrl: Diagnostic = { code: "E003", message: 'Missing required field "url"', line: 4 };

describe("problemsSummary", () => {
  it("returns 'No problems' for no diagnostics", () => {
    expect(problemsSummary([])).toBe("No problems");
  });

  it("returns '1 problem' for a single diagnostic", () => {
    expect(problemsSummary([aiAct])).toBe("1 problem");
  });

  it("returns '2 problems' for two diagnostics", () => {
    expect(problemsSummary([aiAct, noUrl])).toBe("2 problems");
  });
});

describe("formatDiagnostic", () => {
  it('formats a diagnostic as "Line 3: Unknown action "aiAct""', () => {
    expect(formatDiagnostic(aiAct)).toBe('Line 3: Unknown action "aiAct"');
  });
});

describe("diagnosticRanges", () => {
  const source = 'name: "x"\nsteps:\n  - aiAct: "go"\n';

  it("marks the diagnostic's line from its first non-blank character to its end", () => {
    expect(diagnosticRanges(source, [aiAct])).toEqual([
      { from: 19, to: 32, line: 3, message: 'Unknown action "aiAct"', code: "E005" },
    ]);
  });

  it("marks an empty line as an empty range at its start", () => {
    expect(diagnosticRanges(source, [{ ...noUrl, line: 4 }])).toEqual([
      { from: 33, to: 33, line: 4, message: 'Missing required field "url"', code: "E003" },
    ]);
  });

  it("marks the last line for a line past the end of the source", () => {
    expect(diagnosticRanges("a: 1", [{ ...aiAct, line: 9 }])).toEqual([
      { from: 0, to: 4, line: 1, message: 'Unknown action "aiAct"', code: "E005" },
    ]);
  });

  it("marks the first line of an empty source", () => {
    expect(diagnosticRanges("", [{ code: "E002", message: "The root must be an object", line: 1 }])).toEqual([
      { from: 0, to: 0, line: 1, message: "The root must be an object", code: "E002" },
    ]);
  });
});

describe("hasNewDiagnostics", () => {
  it("is true when a diagnostic appears", () => {
    expect(hasNewDiagnostics([aiAct], [aiAct, noUrl])).toBe(true);
  });

  it("is false when the diagnostics are the same", () => {
    expect(hasNewDiagnostics([aiAct, noUrl], [{ ...noUrl }, { ...aiAct }])).toBe(false);
  });

  it("is false when diagnostics only go away", () => {
    expect(hasNewDiagnostics([aiAct, noUrl], [aiAct])).toBe(false);
  });

  it("is true when a diagnostic moves to another line", () => {
    expect(hasNewDiagnostics([aiAct], [{ ...aiAct, line: 5 }])).toBe(true);
  });
});

describe("fileState", () => {
  it("is unsaved while the draft differs, even during a Run", () => {
    expect(fileState({ dirty: true, runStatus: "running", savedSinceRun: false })).toBe("unsaved");
  });

  it.each(["queued", "running"] as const)("is running while the latest Run is %s", (runStatus) => {
    expect(fileState({ dirty: false, runStatus, savedSinceRun: true })).toBe("running");
  });

  it.each(["passed", "failed"] as const)("is the latest Run's %s status when nothing was saved since", (runStatus) => {
    expect(fileState({ dirty: false, runStatus, savedSinceRun: false })).toBe(runStatus);
  });

  it("is saved when the file was saved after its latest Run", () => {
    expect(fileState({ dirty: false, runStatus: "failed", savedSinceRun: true })).toBe("saved");
  });

  it("is saved for a file that never ran", () => {
    expect(fileState({ dirty: false, runStatus: null, savedSinceRun: false })).toBe("saved");
  });
});

describe("fileStateLabel", () => {
  it.each([
    ["saved", "Saved"],
    ["unsaved", "Unsaved"],
    ["running", "Running"],
    ["passed", "Passed"],
    ["failed", "Failed"],
  ] as const)("labels %s as %s", (state, label) => {
    expect(fileStateLabel(state)).toBe(label);
  });
});
