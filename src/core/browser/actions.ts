import type { Locator, Page } from "playwright";
import { VIEWPORT } from "./constants.js";
import type { BrowserAction, ElementRef } from "./types.js";

// Chromium has the Navigation API, but TypeScript's DOM types do not include it yet.
type NavigationWindow = { navigation: { canGoBack: boolean; canGoForward: boolean } };

/** Performs one action on `page`; returns a failure reason, or throws Playwright's error. */
export async function runAction(
  page: Page,
  action: Exclude<BrowserAction, { action: "switchTab" }>,
): Promise<string | undefined> {
  switch (action.action) {
    case "open":
      await page.goto(action.url);
      break;
    case "back":
      if (!(await canGo(page, "canGoBack"))) return "There is no previous page to go back to";
      await page.goBack();
      break;
    case "forward":
      if (!(await canGo(page, "canGoForward"))) return "There is no next page to go forward to";
      await page.goForward();
      break;
    case "reload":
      await page.reload();
      break;
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
      await locate(page, action.element).click();
      break;
    case "doubleClick":
      await locate(page, action.element).dblclick();
      break;
    case "rightClick":
      await locate(page, action.element).click({ button: "right" });
      break;
    case "hover":
      await locate(page, action.element).hover();
      break;
    case "input":
      await locate(page, action.element).fill(action.value);
      break;
    default: {
      const unknown: never = action;
      throw new Error(`Unknown action ${JSON.stringify(unknown)}`);
    }
  }
  return undefined;
}

// goBack() also returns null after a same-document navigation, so it cannot tell "no history".
function canGo(page: Page, direction: "canGoBack" | "canGoForward"): Promise<boolean> {
  return page.evaluate((key) => (window as unknown as NavigationWindow).navigation[key], direction);
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
