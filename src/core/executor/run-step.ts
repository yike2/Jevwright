import type { BrowserAdapter, BrowserCheck, BrowserResult } from "../browser/index.js";
import type { AssertCheck, Step } from "../syntax/index.js";
import { missingVariables, NEEDS_ASSERTER, NEEDS_LOCATOR } from "./reasons.js";
import type { FailedStep, LocateMethod, PassedStep } from "./types.js";
import { substitute } from "./variables.js";

export type StepContext = {
  browser: BrowserAdapter;
  vars: Record<string, string>;
  redact: (text: string) => string;
};

type Outcome = { result: BrowserResult; locateMethod?: LocateMethod };

const fail = (reason: string): Outcome => ({ result: { ok: false, reason, dialogs: [] } });

function toCheck(check: AssertCheck): BrowserCheck {
  if ("url" in check) return { check: "url", url: check.url };
  return check.text === undefined
    ? { check: "visible", selector: check.selector }
    : { check: "text", selector: check.selector, text: check.text };
}

// The one Adapter call for a step whose Variables are filled in (executor.md 1.4).
async function act(step: Step, browser: BrowserAdapter): Promise<Outcome> {
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
    case "hover":
      // TODO: locate by target through the Element Locator.
      if (step.selector === undefined) return fail(NEEDS_LOCATOR);
      return {
        result: await browser.perform({ action: step.action, element: { selector: step.selector }, dialog: step.dialog }),
        locateMethod: "selector",
      };
    case "input":
      // TODO: locate by target through the Element Locator.
      if (step.selector === undefined) return fail(NEEDS_LOCATOR);
      return {
        result: await browser.perform({
          action: "input",
          element: { selector: step.selector },
          value: step.value,
          dialog: step.dialog,
        }),
        locateMethod: "selector",
      };
    case "waitFor":
      // TODO: judge the condition through the Asserter.
      if ("condition" in step) return fail(NEEDS_ASSERTER);
      if ("selector" in step) return { result: await browser.check({ check: "visible", selector: step.selector }) };
      return { result: await browser.check({ check: "url", url: step.url }) };
    case "assert": {
      // TODO: judge the statement through the Asserter, also as the fallback of a failed check.
      if (!("check" in step)) return fail(NEEDS_ASSERTER);
      const result = await browser.check(toCheck(step.check));
      if (result.ok || step.statement === undefined) return { result };
      return { result: { ...result, reason: `${result.reason}; ${NEEDS_ASSERTER}` } };
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
      const acted = await act(filled.step, browser);
      outcome = { ...acted, result: { ...acted.result, dialogs: [...ready.dialogs, ...acted.result.dialogs] } };
    }
  }

  const { result, locateMethod } = outcome;
  const ran = {
    index,
    line: step.line,
    action: step.action,
    startedAt: startedAt.toISOString(),
    durationMs: Date.now() - startedAt.getTime(),
    ...(locateMethod ? { locateMethod } : {}),
    dialogs: result.dialogs.map((dialog) => ({ ...dialog, message: redact(dialog.message) })),
  };
  if (result.ok) return { ...ran, status: "passed" };
  const screenshot = await browser.screenshot();
  return {
    ...ran,
    status: "failed",
    reason: redact(result.reason),
    ...(screenshot.ok ? { screenshot: screenshot.data } : {}),
  };
}
