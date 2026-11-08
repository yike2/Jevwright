export type FileOutcome = "passed" | "failed" | "invalid";

export function getExitCode(outcomes: readonly FileOutcome[]): 0 | 1 | 2 {
  if (outcomes.some((outcome) => outcome === "invalid")) {
    return 2;
  }

  if (outcomes.some((outcome) => outcome === "failed")) {
    return 1;
  }

  return 0;
}
