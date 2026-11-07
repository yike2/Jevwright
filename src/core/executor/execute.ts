import { launchBrowser, type BrowserAdapter } from "../browser/index.js";
import type { TestCase } from "../syntax/index.js";
import { missingVariables } from "./reasons.js";
import { runStep, toStepResult } from "./run-step.js";
import type { ExecuteOptions, ExecuteResult, StepResult } from "./types.js";
import { createRedact, substitute } from "./variables.js";

/** Runs `testCase` on its own browser, stopping at the first failed step; returns every Step result and the trace. */
export async function execute(
  testCase: TestCase,
  options: ExecuteOptions,
  launch: typeof launchBrowser = launchBrowser,
): Promise<ExecuteResult> {
  const { headed, vars, onEvent, jev } = options;
  const results: StepResult[] = testCase.steps.map((step, index) => ({
    index,
    line: step.line,
    action: step.action,
    status: "pending",
  }));

  const baseUrl = substitute(testCase.baseUrl, vars);
  if (!baseUrl.ok) {
    // Without a baseUrl there is no browser to run on, so the first step carries the failure.
    const first = testCase.steps[0];
    if (first === undefined) return { steps: [], trace: Buffer.alloc(0) };
    onEvent({ type: "started", step: { index: 0, line: first.line, action: first.action } });
    const failure = { ok: false as const, reason: missingVariables(baseUrl.missing), dialogs: [] };
    const ran = { startedAt: new Date(), durationMs: 0, result: failure };
    const result = toStepResult(first, 0, ran, createRedact(testCase, vars));
    results[0] = result;
    onEvent({ type: "finished", result });
    return { steps: results, trace: Buffer.alloc(0) };
  }

  const browser = await launch({ headed, baseUrl: baseUrl.value, timeoutMs: testCase.timeoutMs });
  let failure: { error: unknown } | undefined;
  let trace: Buffer = Buffer.alloc(0);
  try {
    await runSteps(testCase, browser, options, results);
  } catch (error) {
    failure = { error };
    throw error;
  } finally {
    try {
      trace = await browser.close();
    } catch (closeError) {
      // Thrown from finally, this replaces the error of the steps, so it carries both.
      if (!failure) throw closeError;
      throw new AggregateError([failure.error, closeError], "The run failed and the browser could not be closed");
    }
  }
  return { steps: results, trace };
}

// Fills `results` in order and stops at the first failed step, leaving the rest pending.
async function runSteps(testCase: TestCase, browser: BrowserAdapter, options: ExecuteOptions, results: StepResult[]) {
  const { vars, onEvent, jev } = options;
  const redact = createRedact(testCase, vars);
  for (const [index, step] of testCase.steps.entries()) {
    onEvent({ type: "started", step: { index, line: step.line, action: step.action } });
    const result = await runStep(step, index, { browser, vars, redact, jev, timeoutMs: testCase.timeoutMs });
    results[index] = result;
    onEvent({ type: "finished", result });
    if (result.status === "failed") return;
  }
}
