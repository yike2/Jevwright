import { SELECTOR_PROBE_MS } from "./constants.js";
import { domLocate } from "./dom.js";
import { selectorLocate } from "./selector.js";
import type {
  BrowserDriver,
  JevClient,
  LocateAttempt,
  LocateRequest,
  LocateResult,
  PageSnapshot,
} from "./types.js";
import { visualLocate } from "./visual.js";

function formatLocateErrorMessage(request: LocateRequest, attempts: LocateAttempt[]): string {
  const label = request.target ?? request.selector ?? "";
  const lines = attempts.map((a) => {
    const head =
      a.method === "selector" && request.selector ? `selector "${request.selector}"` : a.method;
    return `  ${head} — ${a.reason ?? "failed"}`;
  });
  return `Could not locate "${label}":\n${lines.join("\n")}`;
}

function sumDuration(attempts: LocateAttempt[]): number {
  return attempts.reduce((acc, a) => acc + a.durationMs, 0);
}

export class LocateError extends Error {
  attempts: LocateAttempt[];
  constructor(request: LocateRequest, attempts: LocateAttempt[]) {
    super(formatLocateErrorMessage(request, attempts));
    this.name = "LocateError";
    this.attempts = attempts;
  }
}

export async function locate(
  request: LocateRequest,
  driver: BrowserDriver,
  jev: JevClient,
): Promise<LocateResult> {
  if (!request.selector && !request.target) {
    throw new LocateError(request, [
      {
        method: "selector",
        ok: false,
        durationMs: 0,
        reason: "LocateRequest requires at least one of selector or target",
      },
    ]);
  }

  const attempts: LocateAttempt[] = [];
  if (request.selector) {
    const probeTimeout = request.target ? SELECTOR_PROBE_MS : request.timeoutMs;
    const attempt = await selectorLocate(request.selector, probeTimeout, driver);
    attempts.push(attempt);
    if (attempt.ok) {
      return {
        method: "selector",
        durationMs: sumDuration(attempts),
        attempts,
      };
    }
  }

  if (!request.target) {
    throw new LocateError(request, attempts);
  }

  let cachedSnapshot: PageSnapshot | undefined;
  const getSnapshot = async (): Promise<PageSnapshot> => {
    if (!cachedSnapshot) {
      cachedSnapshot = await driver.snapshot();
    }
    return cachedSnapshot;
  };

  const visualOutcome = await visualLocate(
    request.target,
    request.action,
    driver,
    getSnapshot,
    jev,
  );
  attempts.push(visualOutcome.attempt);
  if (visualOutcome.attempt.ok) {
    return {
      method: "visual",
      elementId: visualOutcome.elementId,
      confidence: visualOutcome.attempt.confidence,
      durationMs: sumDuration(attempts),
      attempts,
    };
  }

  const domOutcome = await domLocate(request.target, request.action, getSnapshot, jev);
  attempts.push(domOutcome.attempt);
  if (domOutcome.attempt.ok) {
    return {
      method: "dom",
      elementId: domOutcome.elementId,
      confidence: domOutcome.attempt.confidence,
      durationMs: sumDuration(attempts),
      attempts,
    };
  }

  throw new LocateError(request, attempts);
}
