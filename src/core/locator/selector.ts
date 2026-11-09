import type { BrowserAdapter } from "@/core/browser/index.js";
import { SELECTOR_PROBE_MS } from "./constants.js";
import type { LocateRequest, StageResult } from "./types.js";

export async function runSelector(
  request: LocateRequest,
  adapter: Pick<BrowserAdapter, "isVisible">,
): Promise<StageResult> {
  if (request.selector === undefined) {
    throw new Error("Selector locate requires request.selector");
  }

  const startedAt = Date.now();
  const timeoutMs = request.target !== undefined ? Math.min(SELECTOR_PROBE_MS, request.timeoutMs) : request.timeoutMs;

  const visible = await adapter.isVisible(request.selector, timeoutMs);
  if (!visible.ok) {
    return {
      attempt: {
        method: "selector",
        ok: false,
        durationMs: Date.now() - startedAt,
        reason: visible.reason,
      },
    };
  }

  if (!visible.data) {
    return {
      attempt: {
        method: "selector",
        ok: false,
        durationMs: Date.now() - startedAt,
        reason: `selector "${request.selector}" not visible within ${timeoutMs} ms`,
      },
    };
  }

  return {
    attempt: {
      method: "selector",
      ok: true,
      durationMs: Date.now() - startedAt,
    },
    element: { selector: request.selector },
  };
}
