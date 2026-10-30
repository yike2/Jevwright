import type { BrowserDriver } from "./types.js";

export type SelectorStageOutcome =
  | { ok: true }
  | { ok: false; reason: string };

/** Runs the Selector stage by checking element visibility within the given timeout. */
export async function selectorLocate(
  selector: string,
  timeoutMs: number,
  driver: BrowserDriver,
): Promise<SelectorStageOutcome> {
  const visible = await driver.isVisible(selector, timeoutMs);
  if (visible) {
    return { ok: true };
  }
  return {
    ok: false,
    reason: `not visible within ${timeoutMs} ms`,
  };
}
