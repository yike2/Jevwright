import { launchBrowser, type BrowserAdapter } from "../browser/index.js";
import { firstLine } from "../browser/errors.js";
import type { Step, TestCase } from "../syntax/index.js";
import { RunAbortedError } from "./errors.js";
import { missingVariables, runTimedOut } from "./reasons.js";
import { failure, runStep, toStepResult, type StepContext } from "./run-step.js";
import type { ExecuteOptions, ExecuteResult, RunError, StepResult } from "./types.js";
import { createRedact, substitute } from "./variables.js";

const TIMED_OUT = Symbol("timed out");
const NO_TRACE = Buffer.alloc(0);

// What the step loop and an abort share: `running` is the step in flight, so an aborted Run can fail it;
// `aborted` makes its late result be dropped.
type RunState = {
  results: StepResult[];
  onEvent: ExecuteOptions["onEvent"];
  aborted: boolean;
  running?: { step: Step; index: number; startedAt: Date };
};

type Aborted = RunError & { cause?: unknown };

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
  const state: RunState = {
    results: testCase.steps.map((step, index) => ({ index, line: step.line, action: step.action, status: "pending" })),
    onEvent,
    aborted: false,
  };
  const { results } = state;
  const infrastructure = (error: unknown): Aborted => ({
    kind: "infrastructure",
    message: redact(firstLine(error)),
    cause: error,
  });
  const timedOut: Aborted = { kind: "timeout", message: runTimedOut(testCase.runTimeoutMs) };
  const abortWith = (aborted: Aborted, trace: Buffer) =>
    new RunAbortedError(aborted.kind, aborted.message, results, trace, { cause: aborted.cause });

  const baseUrl = substitute(testCase.baseUrl, vars);
  if (!baseUrl.ok) {
    // Without a baseUrl there is no browser to run on, so the first step carries the failure.
    const first = testCase.steps[0];
    if (first === undefined) return { steps: [], trace: NO_TRACE };
    onEvent({ type: "started", step: { index: 0, line: first.line, action: first.action } });
    const ran = { startedAt: new Date(), durationMs: 0, result: failure(missingVariables(baseUrl.missing)) };
    const result = toStepResult(first, 0, ran, redact);
    results[0] = result;
    onEvent({ type: "finished", result });
    return { steps: results, trace: NO_TRACE };
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
    throw abortWith(infrastructure(error), NO_TRACE);
  }
  if (browser === TIMED_OUT) {
    // Nothing can use a browser that starts after the Run ended, so it is closed; its trace and errors are
    // dropped on purpose (executor.md 1.7), since the Run already ended with its timeout.
    launching.then((late) => late.close()).catch(() => {});
    throw abortWith(timedOut, NO_TRACE);
  }

  let aborted: Aborted | undefined;
  try {
    // After a timeout, closing the browser rejects the pending Adapter call; the race has already settled, so it is ignored.
    const steps = runSteps(testCase, { browser, vars, redact }, state);
    if ((await Promise.race([steps, expired])) === TIMED_OUT) aborted = timedOut;
  } catch (error) {
    aborted = infrastructure(error);
  } finally {
    clearTimeout(timer);
  }
  if (aborted) {
    state.aborted = true;
    try {
      failRunning(state, aborted.message);
    } catch (listenerError) {
      // The browser must still close, so a throwing onEvent only joins the cause.
      aborted = withCause(aborted, listenerError);
    }
  }
  let trace: Buffer = NO_TRACE;
  try {
    trace = await browser.close();
  } catch (closeError) {
    aborted = aborted ? withCause(aborted, closeError) : infrastructure(closeError);
  }
  if (aborted) throw abortWith(aborted, trace);
  return { steps: results, trace };
}

// The Run's own error stays the message; the cause keeps every error, so none is lost.
const withCause = (aborted: Aborted, error: unknown): Aborted => ({
  ...aborted,
  cause: aborted.cause === undefined ? error : new AggregateError([aborted.cause, error]),
});

// Fails the step that was running when the Run was aborted, and sends its finished event.
function failRunning(state: RunState, reason: string) {
  if (!state.running) return;
  const { step, index, startedAt } = state.running;
  const ran = { startedAt, durationMs: Date.now() - startedAt.getTime(), result: failure(reason) };
  const result = toStepResult(step, index, ran, (text) => text);
  state.results[index] = result;
  state.onEvent({ type: "finished", result });
}

// Fills `state.results` in order and stops at the first failed step, leaving the rest pending.
async function runSteps(testCase: TestCase, context: StepContext, state: RunState) {
  for (const [index, step] of testCase.steps.entries()) {
    // Set first, so an onEvent that throws for this step fails it.
    state.running = { step, index, startedAt: new Date() };
    state.onEvent({ type: "started", step: { index, line: step.line, action: step.action } });
    const result = await runStep(step, index, context);
    // The Run was aborted while this step ran; its step result is already failed.
    if (state.aborted) return;
    state.running = undefined;
    state.results[index] = result;
    state.onEvent({ type: "finished", result });
    if (result.status === "failed") return;
  }
}
