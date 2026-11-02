import { setTimeout as sleep } from "node:timers/promises";
import type { BrowserContext, Page } from "playwright";
import { TAB_POLL_MS } from "./constants.js";
import { matchesUrl } from "./url-match.js";

/** The open tabs of one context in opening order, and which one is current. */
export class Tabs {
  private readonly pages: Page[];
  current: Page;

  constructor(context: BrowserContext, first: Page, onOpen: (page: Page) => void) {
    this.pages = [first];
    this.current = first;
    this.forgetOnClose(first);
    context.on("page", (page) => {
      this.pages.push(page);
      this.forgetOnClose(page);
      onOpen(page);
    });
  }

  private forgetOnClose(page: Page): void {
    page.on("close", () => this.pages.splice(this.pages.indexOf(page), 1));
  }

  /** Makes the one tab matching `url` current, waiting up to `timeoutMs`; returns a failure reason. */
  async switchTo(url: string, baseUrl: string | undefined, timeoutMs: number): Promise<string | undefined> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const matches = this.pages.filter((page) => matchesUrl(page.url(), url, baseUrl));
      if (matches.length === 1) {
        this.current = matches[0];
        await this.current.bringToFront();
        return undefined;
      }
      if (matches.length > 1) {
        return `${matches.length} tabs match "${url}": ${matches.map((page) => page.url()).join(", ")}`;
      }
      if (Date.now() >= deadline) {
        const open = this.pages.map((page) => page.url()).join(", ");
        return `No tab matched "${url}" within ${timeoutMs}ms; open tabs: ${open}`;
      }
      await sleep(TAB_POLL_MS);
    }
  }
}
