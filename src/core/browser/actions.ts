import { errors, type Locator, type Page } from "playwright";
import { VIEWPORT } from "./constants.js";
import { withCleanup } from "./errors.js";
import type { BrowserAction, ElementRef } from "./types.js";

/** Performs one action on `page` within `timeoutMs`; returns a failure reason, or throws Playwright's error. */
export async function runAction(
  page: Page,
  action: Exclude<BrowserAction, { action: "switchTab" }>,
  timeoutMs: number,
): Promise<string | undefined> {
  switch (action.action) {
    case "open":
      return navigate(() => page.goto(action.url), timeoutMs);
    case "back":
      if (!(await canGo(page, -1))) return "There is no previous page to go back to";
      return navigate(() => page.goBack(), timeoutMs);
    case "forward":
      if (!(await canGo(page, 1))) return "There is no next page to go forward to";
      return navigate(() => page.goForward(), timeoutMs);
    case "reload":
      return navigate(() => page.reload(), timeoutMs);
    case "press":
      await page.keyboard.press(action.key);
      break;
    case "scroll":
      await scroll(page, action.direction, action.distance);
      break;
    case "sleep":
      await page.waitForTimeout(action.ms);
      break;
    case "click":
      return onElement(page, action.element, "clicked", timeoutMs, (target) => target.click());
    case "doubleClick":
      return onElement(page, action.element, "double-clicked", timeoutMs, (target) => target.dblclick());
    case "rightClick":
      return onElement(page, action.element, "right-clicked", timeoutMs, (target) => target.click({ button: "right" }));
    case "hover":
      return onElement(page, action.element, "hovered", timeoutMs, (target) => target.hover());
    case "input":
      return onElement(page, action.element, "filled", timeoutMs, (target) => target.fill(action.value));
    default: {
      const unknown: never = action;
      throw new Error(`Unknown action ${JSON.stringify(unknown)}`);
    }
  }
  return undefined;
}

// goBack() also returns null after a same-document navigation, so it cannot tell "no history".
// The tab's CDP history is used because the Navigation API leaves out cross-origin entries.
// A new tab's first entry is the about:blank it started on, which is not a page of the test.
async function canGo(page: Page, step: -1 | 1): Promise<boolean> {
  const session = await page.context().newCDPSession(page);
  return withCleanup(
    async () => {
      const { currentIndex, entries } = await session.send("Page.getNavigationHistory");
      const target = currentIndex + step;
      return entries[target] !== undefined && !(target === 0 && entries[0].url === "about:blank");
    },
    () => session.detach(),
  );
}

// A navigation that times out is still loading, which Playwright's "Timeout exceeded" does not say.
async function navigate(go: () => Promise<unknown>, timeoutMs: number): Promise<string | undefined> {
  try {
    await go();
    return undefined;
  } catch (error) {
    if (error instanceof errors.TimeoutError) return `The page did not finish loading within ${timeoutMs}ms`;
    throw error;
  }
}

// Playwright's timeout does not say whether nothing matched or the match never became usable, so count them.
async function onElement(
  page: Page,
  element: ElementRef,
  done: string,
  timeoutMs: number,
  act: (target: Locator) => Promise<unknown>,
): Promise<string | undefined> {
  const target = locate(page, element);
  try {
    await act(target);
    return undefined;
  } catch (error) {
    if (!(error instanceof errors.TimeoutError)) throw error;
    const found = (await target.count()) > 0;
    if (!("selector" in element)) {
      return found
        ? `The element Jev located could not be ${done} within ${timeoutMs}ms: ${UNUSABLE}`
        : "The element Jev located is no longer on the page";
    }
    return found
      ? `"${element.selector}" was found but could not be ${done} within ${timeoutMs}ms: ${UNUSABLE}`
      : missingReason(element.selector, timeoutMs);
  }
}

const UNUSABLE = "it stayed hidden, disabled, or covered by another element";

/** The reason for a selector that matched no element within the timeout. */
export function missingReason(selector: string, timeoutMs: number): string {
  return `No element matches "${selector}" within ${timeoutMs}ms`;
}

function locate(page: Page, element: ElementRef): Locator {
  return "selector" in element
    ? page.locator(element.selector).first()
    : page.locator(`[data-jev-id="${element.snapshotId}"]`);
}

// The wheel scrolls whatever is under the mouse, so it starts from the viewport center.
async function scroll(page: Page, direction: "up" | "down" | "left" | "right", distance: number) {
  const delta = direction === "up" || direction === "left" ? -distance : distance;
  const vertical = direction === "up" || direction === "down";
  await page.mouse.move(VIEWPORT.width / 2, VIEWPORT.height / 2);
  await page.mouse.wheel(vertical ? 0 : delta, vertical ? delta : 0);
}
