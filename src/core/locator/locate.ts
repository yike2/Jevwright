import type { BrowserAdapter } from "@/core/browser/index.js";
import type { JevClient } from "@/core/jev/index.js";
import { runDom } from "./dom.js";
import { runSelector } from "./selector.js";
import { runVisual } from "./visual.js";
import { LocateError } from "./types.js";
import type { LocateAttempt, LocateRequest, LocateResult, StageResult } from "./types.js";

function formatLocateErrorMessage(request: LocateRequest, attempts: LocateAttempt[]): string {
  const query = request.target ?? request.selector;
  if (query === undefined) {
    throw new Error("Could not build locate error message without target or selector");
  }

  const lines = [`Could not locate "${query}":`];
  for (const attempt of attempts) {
    lines.push(`  ${attempt.method} — ${attempt.reason ?? "unknown reason"}`);
  }
  return lines.join("\n");
}

function toLocateResult(totalStartedAt: number, attempts: LocateAttempt[], stageResult: StageResult): LocateResult {
  if (stageResult.element === undefined) {
    throw new Error("Successful locate stage must include an element");
  }

  return {
    method: stageResult.attempt.method,
    element: stageResult.element,
    confidence: stageResult.attempt.confidence,
    durationMs: Date.now() - totalStartedAt,
    attempts,
  };
}

export async function locate(
  request: LocateRequest,
  adapter: Pick<BrowserAdapter, "isVisible" | "screenshot" | "snapshot">,
  jev: Pick<JevClient, "bbox" | "choice">,
): Promise<LocateResult> {
  if (request.selector === undefined && request.target === undefined) {
    throw new Error("Locate requires either selector or target");
  }

  const totalStartedAt = Date.now();
  const attempts: LocateAttempt[] = [];

  if (request.selector !== undefined) {
    const selectorResult = await runSelector(request, adapter);
    attempts.push(selectorResult.attempt);

    if (selectorResult.attempt.ok) {
      return toLocateResult(totalStartedAt, attempts, selectorResult);
    }
  }

  if (request.target === undefined) {
    throw new LocateError(formatLocateErrorMessage(request, attempts), attempts);
  }

  const visualResult = await runVisual(request, adapter, jev);
  attempts.push(visualResult.attempt);

  if (visualResult.attempt.ok) {
    return toLocateResult(totalStartedAt, attempts, visualResult);
  }

  const domResult = await runDom(request, adapter, jev, visualResult.snapshot);
  attempts.push(domResult.attempt);

  if (domResult.attempt.ok) {
    return toLocateResult(totalStartedAt, attempts, domResult);
  }

  throw new LocateError(formatLocateErrorMessage(request, attempts), attempts);
}
