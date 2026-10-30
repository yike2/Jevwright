import { SELECTOR_PROBE_MS } from "./constants.js";
import { domLocate } from "./dom.js";
import { selectorLocate } from "./selector.js";
import {
  type BrowserDriver,
  type JevClient,
  type LocateAttempt,
  LocateError,
  type LocateRequest,
  type LocateResult,
  type PageSnapshot,
} from "./types.js";
import { visualLocate } from "./visual.js";

/** Locates a page element using the selector -> visual -> DOM fallback chain. */
export async function locate(
  request: LocateRequest,
  driver: BrowserDriver,
  jev: JevClient,
): Promise<LocateResult> {
  const attempts: LocateAttempt[] = [];
  const startTotal = Date.now();

  if (request.selector) {
    const stageTimeout = request.target ? SELECTOR_PROBE_MS : request.timeoutMs;
    const t0 = Date.now();
    const selOutcome = await selectorLocate(request.selector, stageTimeout, driver);
    const durationMs = Date.now() - t0;

    if (selOutcome.ok) {
      attempts.push({ method: "selector", ok: true, durationMs });
      return {
        method: "selector",
        durationMs: Date.now() - startTotal,
        attempts,
      };
    }

    attempts.push({
      method: "selector",
      ok: false,
      durationMs,
      reason: selOutcome.reason,
    });
  }

  if (request.target) {
    let cachedSnapshot: PageSnapshot | undefined;

    // Stage 2: Visual Locate
    const tVisual = Date.now();
    const visOutcome = await visualLocate(request.target, request.action, driver, jev);
    const visDuration = Date.now() - tVisual;

    if (visOutcome.ok) {
      attempts.push({
        method: "visual",
        ok: true,
        durationMs: visDuration,
        confidence: visOutcome.confidence,
      });
      return {
        method: "visual",
        elementId: visOutcome.elementId,
        confidence: visOutcome.confidence,
        durationMs: Date.now() - startTotal,
        attempts,
      };
    }

    cachedSnapshot = visOutcome.snapshot;
    attempts.push({
      method: "visual",
      ok: false,
      durationMs: visDuration,
      ...(visOutcome.confidence !== undefined ? { confidence: visOutcome.confidence } : {}),
      reason: visOutcome.reason,
    });

    // Stage 3: DOM Locate (reusing snapshot if Visual Locate already took it)
    const tDom = Date.now();
    const snapshot = cachedSnapshot ?? (await driver.snapshot());
    const domOutcome = await domLocate(request.target, request.action, snapshot, jev);
    const domDuration = Date.now() - tDom;

    if (domOutcome.ok) {
      attempts.push({
        method: "dom",
        ok: true,
        durationMs: domDuration,
        confidence: domOutcome.confidence,
      });
      return {
        method: "dom",
        elementId: domOutcome.elementId,
        confidence: domOutcome.confidence,
        durationMs: Date.now() - startTotal,
        attempts,
      };
    }

    attempts.push({
      method: "dom",
      ok: false,
      durationMs: domDuration,
      ...(domOutcome.confidence !== undefined ? { confidence: domOutcome.confidence } : {}),
      reason: domOutcome.reason,
    });
  }

  const label = request.target ?? request.selector ?? "";
  throw new LocateError(label, attempts, request.selector);
}
