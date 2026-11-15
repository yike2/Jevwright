import { describe, expect, it } from "vitest";
import { analyze } from "@/core/syntax/index.js";
import { FEATURES, SAMPLE_TEST } from "@/app/frontend/lib/landing.js";

describe("landing page content", () => {
  it("shows a sample test file that the Syntax Analyzer accepts", () => {
    expect(SAMPLE_TEST).toContain("steps:");
    expect(analyze(SAMPLE_TEST).diagnostics).toEqual([]);
  });

  it("presents the five feature areas in order", () => {
    expect(FEATURES.map((feature) => feature.title)).toEqual([
      "Plain YAML steps",
      "Jev locating",
      "Live runs",
      "History and reports",
      "CLI and API",
    ]);
  });
});
