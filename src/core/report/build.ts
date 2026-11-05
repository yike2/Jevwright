import type { ReportBundle, RunOutcome } from "./types.js";

/** Turns the outcome of one Run into its Report and the files the Report points to. */
export function buildReport(_run: RunOutcome): ReportBundle {
  return {
    report: {
      file: "",
      name: "",
      status: "failed",
      startedAt: "",
      durationMs: 0,
      summary: { total: 0, passed: 0, failed: 0, pending: 0 },
      steps: [],
    },
    files: [],
  };
}
