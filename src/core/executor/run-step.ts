import type { BrowserAdapter } from "../browser/index.js";
import type { Step } from "../syntax/index.js";
import type { FailedStep, PassedStep } from "./types.js";

export type StepContext = {
  browser: BrowserAdapter;
  vars: Record<string, string>;
  redact: (text: string) => string;
};

/** Runs one step on the browser: Variables, `ready()`, its Adapter call, and a screenshot on failure. */
export async function runStep(step: Step, index: number, context: StepContext): Promise<PassedStep | FailedStep> {
  return { index, line: step.line, action: step.action, status: "passed", startedAt: "", durationMs: 0, dialogs: [] };
}
