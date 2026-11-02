import { setTimeout as sleep } from "node:timers/promises";
import { errors, type Page } from "playwright";
import { TEXT_POLL_MS } from "./constants.js";
import type { BrowserCheck } from "./types.js";
import { matchesUrl } from "./url-match.js";

/** Runs one Playwright check on `page`, waiting up to `timeoutMs`; returns a failure reason, or throws. */
export async function runCheck(
  page: Page,
  check: BrowserCheck,
  timeoutMs: number,
  baseUrl?: string,
): Promise<string | undefined> {
  switch (check.check) {
    case "visible":
      await page.locator(check.selector).first().waitFor({ state: "visible", timeout: timeoutMs });
      break;
    case "text":
      return waitForText(page, check.selector, check.text, timeoutMs);
    case "url":
      // switchTab's matcher, so a pattern matches the same URLs in both.
      await page.waitForURL((url) => matchesUrl(url.href, check.url, baseUrl), { timeout: timeoutMs });
      break;
    default: {
      const unknown: never = check;
      throw new Error(`Unknown check ${JSON.stringify(unknown)}`);
    }
  }
  return undefined;
}

// Polls like toContainText: the first match's textContent, whitespace collapsed, case-sensitive.
async function waitForText(page: Page, selector: string, text: string, timeoutMs: number): Promise<string | undefined> {
  const locator = page.locator(selector).first();
  const deadline = Date.now() + timeoutMs;
  let content: string | undefined;
  for (;;) {
    try {
      const read = await locator.textContent({ timeout: Math.max(1, deadline - Date.now()) });
      content = (read ?? "").replace(/\s+/g, " ").trim();
    } catch (error) {
      // Before the first read Playwright's timeout is the reason; after it, the text that was there is.
      if (content === undefined || !(error instanceof errors.TimeoutError)) throw error;
    }
    if (content.includes(text)) return undefined;
    // Stop before a poll that would start after the deadline, so the last read is never cut short.
    if (Date.now() + TEXT_POLL_MS >= deadline) {
      return `Text of "${selector}" did not contain "${text}" within ${timeoutMs}ms; it was "${content}"`;
    }
    await sleep(TEXT_POLL_MS);
  }
}
