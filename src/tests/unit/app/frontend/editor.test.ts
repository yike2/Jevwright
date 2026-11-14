import { describe, expect, it } from "vitest";

import { formatDiagnostic, isVariableName, validationSummary } from "@/app/frontend/lib/editor.js";

describe("validationSummary", () => {
  it("returns 'Valid. Ready to run.' for no diagnostics", () => {
    expect(validationSummary([])).toBe("Valid. Ready to run.");
  });

  it("returns '1 validation error' for a single diagnostic", () => {
    expect(validationSummary([{ code: "E005", message: 'Unknown action "aiAct"', line: 3 }])).toBe(
      "1 validation error",
    );
  });

  it("returns '2 validation errors' for two diagnostics", () => {
    expect(
      validationSummary([
        { code: "E005", message: 'Unknown action "aiAct"', line: 3 },
        { code: "E003", message: 'Missing required field "url"', line: 4 },
      ]),
    ).toBe("2 validation errors");
  });
});

describe("formatDiagnostic", () => {
  it('formats a diagnostic as "Line 3: Unknown action "aiAct""', () => {
    expect(formatDiagnostic({ code: "E005", message: 'Unknown action "aiAct"', line: 3 })).toBe(
      'Line 3: Unknown action "aiAct"',
    );
  });
});

describe("isVariableName", () => {
  it("accepts uppercase and underscore names", () => {
    expect(isVariableName("BASE")).toBe(true);
    expect(isVariableName("_X1")).toBe(true);
  });

  it("rejects lowercase names and invalid patterns", () => {
    expect(isVariableName("base")).toBe(false);
    expect(isVariableName("1A")).toBe(false);
    expect(isVariableName("")).toBe(false);
    expect(isVariableName("SWAG-PASSWORD")).toBe(false);
  });
});
