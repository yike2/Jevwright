import type { BrowserDriver, LocateAttempt } from "./types.js";

export async function selectorLocate(
  selector: string,
  timeoutMs: number,
  driver: BrowserDriver,
): Promise<LocateAttempt> {
  const start = Date.now();
  const visible = await driver.isVisible(selector, timeoutMs);
  const durationMs = Math.max(0, Date.now() - start);
  if (visible) {
    return { method: "selector", ok: true, durationMs };
  }
  return {
    method: "selector",
    ok: false,
    durationMs,
    reason: `not visible within ${timeoutMs} ms`,
  };
}
