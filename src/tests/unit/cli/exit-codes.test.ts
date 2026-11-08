import { describe, expect, it } from "vitest";
import { getExitCode, type FileOutcome } from "@/cli/exit-codes.js";

describe("getExitCode", () => {
  it("returns 0 when all file outcomes are passed", () => {
    const outcomes: FileOutcome[] = ["passed", "passed"];

    expect(getExitCode(outcomes)).toBe(0);
  });

  it("returns 1 when any file outcome is failed and none are invalid", () => {
    const outcomes: FileOutcome[] = ["passed", "failed", "passed"];

    expect(getExitCode(outcomes)).toBe(1);
  });

  it("returns 2 when any file outcome is invalid", () => {
    const outcomes: FileOutcome[] = ["passed", "invalid", "passed"];

    expect(getExitCode(outcomes)).toBe(2);
  });

  it("returns 2 when invalid appears before or after failed", () => {
    expect(getExitCode(["failed", "invalid"])).toBe(2);
    expect(getExitCode(["invalid", "failed"])).toBe(2);
  });
});
