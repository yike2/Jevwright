import { launchBrowser, type BrowserAdapter } from "../browser/index.js";
import { firstLine } from "../browser/errors.js";
import type { Step, TestCase } from "../syntax/index.js";
import { RunAbortedError } from "./errors.js";
import { missingVariables, runTimedOut } from "./reasons.js";
import { runStep, toStepResult, type StepContext } from "./run-step.js";
import type { ExecuteOptions, ExecuteResult, RunError, StepResult } from "./types.js";
import { createRedact, substitute } from "./variables.js";

const TIMED_OUT = Symbol("timed out");

// `running` is the step in flight, so an aborted Run can fail it; `aborted` makes its late result be dropped.
type Run = { aborted: boolean; running?: { step: Step; index: number; startedAt: Date } };

/**
 * Runs `testCase` on its own browser, stopping at the first failed step; returns every Step result and the trace.
 * Throws a RunAbortedError when the Run timeout expires or the browser crashes (executor.md 1.7).
 */
export async function execute(
  testCase: TestCase,
  options: ExecuteOptions,
  launch: typeof launchBrowser = launchBrowser,
): Promise<ExecuteResult> {
  const { headed, vars, onEvent } = options;
  const redact = createRedact(testCase, vars);
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
    const result = toStepResult(first, 0, ran, redact);
    results[0] = result;
    onEvent({ type: "finished", result });
    return { steps: results, trace: Buffer.alloc(0) };
  }

  let timer: NodeJS.Timeout | undefined;
  const expired = new Promise<typeof TIMED_OUT>((resolve) => {
    timer = setTimeout(() => resolve(TIMED_OUT), testCase.runTimeoutMs);
  });
  const launching = launch({ headed, baseUrl: baseUrl.value, timeoutMs: testCase.timeoutMs });
  let browser: BrowserAdapter | typeof TIMED_OUT;
  try {
    browser = await Promise.race([launching, expired]);
  } catch (error) {
    clearTimeout(timer);
    throw new RunAbortedError("infrastructure", redact(firstLine(error)), results, Buffer.alloc(0), { cause: error });
  }
  if (browser === TIMED_OUT) {
    // Nothing can use a browser that starts after the Run ended, so it is closed; its trace and errors are
    // dropped on purpose (executor.md 1.7), since the Run already ended with its timeout.
    launching.then((late) => late.close()).catch(() => {});
    const message = runTimedOut(testCase.runTimeoutMs);
    throw new RunAbortedError("timeout", message, results, Buffer.alloc(0));
  }
  const run: Run = { aborted: false };
  let aborted: Aborted | undefined;
  try {
    // After a timeout, closing the browser rejects the pending Adapter call; the race has already settled, so it is ignored.
    const steps = runSteps(testCase, { browser, vars, redact }, onEvent, results, run);
    if ((await Promise.race([steps, expired])) === TIMED_OUT) {
      aborted = { kind: "timeout", message: runTimedOut(testCase.runTimeoutMs) };
    }
  } catch (error) {
    aborted = { kind: "infrastructure", message: redact(firstLine(error)), cause: error };
  } finally {
    clearTimeout(timer);
  }
  if (aborted) {
    run.aborted = true;
    try {
      failRunning(run, aborted.message, results, onEvent);
    } catch (listenerError) {
      // The browser must still close, so a throwing onEvent only joins the cause.
      aborted = withCause(aborted, listenerError);
    }
  }
  let trace: Buffer = Buffer.alloc(0);
  try {
    trace = await browser.close();
  } catch (closeError) {
    aborted = aborted
      ? withCause(aborted, closeError)
      : { kind: "infrastructure", message: redact(firstLine(closeError)), cause: closeError };
  }
  if (aborted) throw new RunAbortedError(aborted.kind, aborted.message, results, trace, { cause: aborted.cause });
  return { steps: results, trace };
}

type Aborted = RunError & { cause?: unknown };

// The Run's own error stays the message; the cause keeps every error, so none is lost.
const withCause = (aborted: Aborted, error: unknown): Aborted => ({
  ...aborted,
  cause: aborted.cause === undefined ? error : new AggregateError([aborted.cause, error]),
});

// Fails the step that was running when the Run was aborted, and sends its finished event.
function failRunning(run: Run, reason: string, results: StepResult[], onEvent: ExecuteOptions["onEvent"]) {
  if (!run.running) return;
  const { step, index, startedAt } = run.running;
  const ran = { startedAt, durationMs: Date.now() - startedAt.getTime(), result: { ok: false as const, reason, dialogs: [] } };
  const result = toStepResult(step, index, ran, (text) => text);
  results[index] = result;
  onEvent({ type: "finished", result });
}

// Fills `results` in order and stops at the first failed step, leaving the rest pending.
async function runSteps(
  testCase: TestCase,
  context: StepContext,
  onEvent: ExecuteOptions["onEvent"],
  results: StepResult[],
  run: Run,
) {
  for (const [index, step] of testCase.steps.entries()) {
    // Set first, so an onEvent that throws for this step fails it.
    run.running = { step, index, startedAt: new Date() };
    onEvent({ type: "started", step: { index, line: step.line, action: step.action } });
    const result = await runStep(step, index, context);
    // The Run was aborted while this step ran; its step result is already failed.
    if (run.aborted) return;
    run.running = undefined;
    results[index] = result;
    onEvent({ type: "finished", result });
    if (result.status === "failed") return;
  }
}
