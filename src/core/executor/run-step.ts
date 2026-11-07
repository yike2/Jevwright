import type { BrowserAdapter, BrowserCheck, BrowserResult } from "../browser/index.js";
import { judge, waitUntil } from "../asserter/index.js";
import type { JevClient } from "../jev/index.js";
import type { AssertCheck, Step } from "../syntax/index.js";
import { locate, LocateError } from "../locator/index.js";
import type { JudgeResult } from "../asserter/index.js";
import { missingVariables } from "./reasons.js";
import type { FailedStep, LocateMethod, PassedStep } from "./types.js";
import { substitute } from "./variables.js";

export type StepContext = {
  browser: BrowserAdapter;
  vars: Record<string, string>;
  redact: (text: string) => string;
  jev: JevClient;
  timeoutMs: number;
};

type Outcome = { result: BrowserResult; locateMethod?: LocateMethod };

/** A failed BrowserResult for a failure the Executor finds itself, with no dialogs. */
export const failure = (reason: string): BrowserResult => ({ ok: false, reason, dialogs: [] });

const fail = (reason: string): Outcome => ({ result: failure(reason) });

function mapJudgeResult(result: JudgeResult, dialogs: BrowserResult["dialogs"] = []): BrowserResult {
  if (result.ok) {
    return { ok: true, dialogs };
  }

  return { ok: false, reason: result.reason, dialogs };
}

function toCheck(check: AssertCheck): BrowserCheck {
  if ("url" in check) return { check: "url", url: check.url };
  return check.text === undefined
    ? { check: "visible", selector: check.selector }
    : { check: "text", selector: check.selector, text: check.text };
}

// The one Adapter call for a step whose Variables are filled in (executor.md 1.4).
async function act(step: Step, context: StepContext): Promise<Outcome> {
  const { browser, jev } = context;
  switch (step.action) {
    case "open":
    case "back":
    case "forward":
    case "reload":
    case "press":
    case "scroll":
    case "sleep":
    case "switchTab": {
      const { line: _line, ...action } = step;
      return { result: await browser.perform(action) };
    }
    case "click":
    case "doubleClick":
    case "rightClick":
    case "hover": {
      if (step.target === undefined) {
        return {
          result: await browser.perform({ action: step.action, element: { selector: step.selector }, dialog: step.dialog }),
          locateMethod: "selector",
        };
      }

      try {
        const located = await locate(
          { action: step.action, selector: step.selector, target: step.target, timeoutMs: context.timeoutMs },
          browser,
          jev,
        );
        return {
          result: await browser.perform({ action: step.action, element: located.element, dialog: step.dialog }),
          locateMethod: located.method,
        };
      } catch (error) {
        if (error instanceof LocateError) return fail(error.message);
        throw error;
      }
    }
    case "input":
      if (step.target === undefined) {
        return {
          result: await browser.perform({
            action: "input",
            element: { selector: step.selector },
            value: step.value,
            dialog: step.dialog,
          }),
          locateMethod: "selector",
        };
      }

      try {
        const located = await locate(
          { action: "input", selector: step.selector, target: step.target, timeoutMs: context.timeoutMs },
          browser,
          jev,
        );
        return {
          result: await browser.perform({
            action: "input",
            element: located.element,
            value: step.value,
            dialog: step.dialog,
          }),
          locateMethod: located.method,
        };
      } catch (error) {
        if (error instanceof LocateError) return fail(error.message);
        throw error;
      }
    case "waitFor":
      if ("condition" in step) {
        const judged = await waitUntil(step.condition, context.timeoutMs, browser, jev);
        return { result: mapJudgeResult(judged) };
      }
      if ("selector" in step) return { result: await browser.check({ check: "visible", selector: step.selector }) };
      return { result: await browser.check({ check: "url", url: step.url }) };
    case "assert": {
      if (!("check" in step)) {
        const judged = await judge(step.statement, browser, jev);
        return { result: mapJudgeResult(judged) };
      }

      const result = await browser.check(toCheck(step.check));
      if (result.ok || step.statement === undefined) return { result };

      const judged = await judge(step.statement, browser, jev);
      if (judged.ok) {
        return { result: { ok: true, dialogs: result.dialogs } };
      }

      return { result: { ok: false, reason: `${result.reason}; ${judged.reason}`, dialogs: result.dialogs } };
    }
    default: {
      const unknown: never = step;
      throw new Error(`Unknown step ${JSON.stringify(unknown)}`);
    }
  }
}

/** Runs one step on the browser: Variables, `ready()`, its Adapter call, and a screenshot on failure. */
export async function runStep(step: Step, index: number, context: StepContext): Promise<PassedStep | FailedStep> {
  const { browser, redact } = context;
  const startedAt = new Date();
  let outcome: Outcome;
  const filled = substitute(step, context.vars);
  if (!filled.ok) {
    outcome = fail(missingVariables(filled.missing));
  } else {
    const ready = await browser.ready();
    if (!ready.ok) {
      outcome = { result: ready };
    } else {
      const acted = await act(filled.value, context);
      outcome = { ...acted, result: { ...acted.result, dialogs: [...ready.dialogs, ...acted.result.dialogs] } };
    }
  }

  const durationMs = Date.now() - startedAt.getTime();
  const screenshot = outcome.result.ok ? undefined : await browser.screenshot();
  const ran = { startedAt, durationMs, ...outcome, screenshot: screenshot?.ok ? screenshot.data : undefined };
  return toStepResult(step, index, ran, redact);
}

type Ran = Outcome & { startedAt: Date; durationMs: number; screenshot?: Buffer };

/** The Step result of `step` once it ran, with its reason and dialog messages redacted. */
export function toStepResult(
  step: Step,
  index: number,
  ran: Ran,
  redact: (text: string) => string,
): PassedStep | FailedStep {
  const { result, locateMethod, screenshot } = ran;
  const base = {
    index,
    line: step.line,
    action: step.action,
    startedAt: ran.startedAt.toISOString(),
    durationMs: ran.durationMs,
    ...(locateMethod ? { locateMethod } : {}),
    dialogs: result.dialogs.map((dialog) => ({ ...dialog, message: redact(dialog.message) })),
  };
  if (result.ok) return { ...base, status: "passed" };
  return { ...base, status: "failed", reason: redact(result.reason), ...(screenshot ? { screenshot } : {}) };
}
