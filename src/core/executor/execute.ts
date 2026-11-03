import { launchBrowser, type BrowserAdapter } from "../browser/index.js";
import type { TestCase } from "../syntax/index.js";
import { missingVariables } from "./reasons.js";
import { runStep } from "./run-step.js";
import type { ExecuteOptions, ExecuteResult, StepResult } from "./types.js";
import { createRedact, substitute } from "./variables.js";

/** Runs `testCase` on its own browser, stopping at the first failed step; returns every Step result and the trace. */
export async function execute(
  testCase: TestCase,
  options: ExecuteOptions,
  launch: typeof launchBrowser = launchBrowser,
): Promise<ExecuteResult> {
  const { headed, vars, onEvent } = options;
  const results: StepResult[] = testCase.steps.map((step, index) => ({
    index,
    line: step.line,
    action: step.action,
    status: "pending",
  }));

  const baseUrl = substitute(testCase.baseUrl, vars);
  if (!baseUrl.ok) {
    // Without a baseUrl there is no browser to run on, so the first step carries the failure.
    const { status: _pending, ...step } = results[0]!;
    onEvent({ type: "started", step });
    const result: StepResult = {
      ...step,
      status: "failed",
      startedAt: new Date().toISOString(),
      durationMs: 0,
      dialogs: [],
      reason: missingVariables(baseUrl.missing),
    };
    results[0] = result;
    onEvent({ type: "finished", result });
    return { steps: results, trace: Buffer.alloc(0) };
  }

  const browser = await launch({ headed, baseUrl: baseUrl.value, timeoutMs: testCase.timeoutMs });
  try {
    await runSteps(testCase, browser, options, results);
  } catch (error) {
    await close(browser, error);
    throw error;
  }
  return { steps: results, trace: await browser.close() };
}

// Fills `results` in order and stops at the first failed step, leaving the rest pending.
async function runSteps(testCase: TestCase, browser: BrowserAdapter, options: ExecuteOptions, results: StepResult[]) {
  const { vars, onEvent } = options;
  const redact = createRedact(testCase, vars);
  for (const [index, step] of testCase.steps.entries()) {
    onEvent({ type: "started", step: { index, line: step.line, action: step.action } });
    const result = await runStep(step, index, { browser, vars, redact });
    results[index] = result;
    onEvent({ type: "finished", result });
    if (result.status === "failed") return;
  }
}

// Closes the browser after `error`; if that fails too, both are thrown together.
async function close(browser: BrowserAdapter, error: unknown) {
  try {
    await browser.close();
  } catch (closeError) {
    throw new AggregateError([error, closeError], "The run failed and the browser could not be closed");
  }
}
