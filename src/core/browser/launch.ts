import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { runAction } from "./actions.js";
import { runCheck } from "./checks.js";
import { DIALOG_MIN_WAIT_MS, VIEWPORT } from "./constants.js";
import { DialogGuard } from "./dialogs.js";
import { failureReason } from "./errors.js";
import { takeSnapshot } from "./snapshot.js";
import { Tabs } from "./tabs.js";
import type { BrowserAction, BrowserAdapter, BrowserCheck, BrowserResult, LaunchOptions, PageSnapshot } from "./types.js";

/** Launches Chromium for one Run and returns its Browser Adapter. */
export async function launchBrowser(options: LaunchOptions): Promise<BrowserAdapter> {
  const browser = await chromium.launch({ headless: !options.headed });
  try {
    const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1, baseURL: options.baseUrl });
    context.setDefaultTimeout(options.timeoutMs);
    await context.tracing.start({ screenshots: true, snapshots: true });
    return new PlaywrightAdapter(browser, context, await context.newPage(), options);
  } catch (error) {
    // The caller gets no Adapter to close, so Chromium would keep running.
    await browser.close();
    throw error;
  }
}

class PlaywrightAdapter implements BrowserAdapter {
  private readonly dialogs = new DialogGuard();
  private readonly tabs: Tabs;

  constructor(
    private readonly browser: Browser,
    private readonly context: BrowserContext,
    first: Page,
    private readonly options: LaunchOptions,
  ) {
    this.dialogs.watch(first);
    this.tabs = new Tabs(context, first, (page) => this.dialogs.watch(page));
  }

  private get page(): Page {
    return this.tabs.current;
  }

  private get timeoutMs(): number {
    return this.options.timeoutMs;
  }

  ready(): Promise<BrowserResult> {
    return this.attempt(async () => {
      await this.page.waitForLoadState("load");
      // Dialogs taken here opened between steps, so they fail the step that is starting.
      return this.result(undefined);
    });
  }

  async isVisible(selector: string, timeoutMs: number): Promise<boolean> {
    try {
      await this.page.locator(selector).first().waitFor({ state: "visible", timeout: timeoutMs });
      return true;
    } catch (error) {
      failureReason(error, this.browser.isConnected());
      return false;
    }
  }

  screenshot(): Promise<Buffer> {
    return this.page.screenshot();
  }

  snapshot(): Promise<PageSnapshot> {
    return takeSnapshot(this.page);
  }

  perform(action: BrowserAction): Promise<BrowserResult> {
    return this.attempt(async () => {
      const response = "dialog" in action ? action.dialog : undefined;
      const answered = response && this.dialogs.arm(response);
      try {
        const actionFailure =
          action.action === "switchTab"
            ? await this.tabs.switchTo(action.url, this.options.baseUrl, this.timeoutMs)
            : await runAction(this.page, action);
        const missing = answered && actionFailure === undefined ? await this.waitForDialog(answered) : undefined;
        return this.result(actionFailure ?? missing);
      } finally {
        this.dialogs.disarm();
      }
    }, action.action !== "switchTab");
  }

  check(check: BrowserCheck): Promise<BrowserResult> {
    return this.attempt(async () => this.result(await runCheck(this.page, check, this.timeoutMs, this.options.baseUrl)));
  }

  // Adds the dialogs answered since the last result; an unexpected one fails it.
  private result(reason: string | undefined): BrowserResult {
    const { dialogs, failure } = this.dialogs.take();
    const failed = reason ?? failure;
    return failed === undefined ? { ok: true, dialogs } : { ok: false, reason: failed, dialogs };
  }

  // A dialog may open after its action returns (e.g. after a fetch), so it gets at least DIALOG_MIN_WAIT_MS.
  private async waitForDialog(answered: Promise<void>): Promise<string | undefined> {
    const waitMs = Math.max(this.timeoutMs, DIALOG_MIN_WAIT_MS);
    const timer = new AbortController();
    const timedOut = sleep(waitMs, true, { signal: timer.signal }).catch(() => false);
    const missing = await Promise.race([answered.then(() => false), timedOut]);
    timer.abort();
    return missing ? `The expected dialog did not appear within ${waitMs}ms` : undefined;
  }

  // Expected Playwright failures become a failed result; see failureReason for what is rethrown.
  // switchTab still runs after the current tab closed, since it is how a test moves on to another tab.
  private async attempt(run: () => Promise<BrowserResult>, needsOpenTab = true): Promise<BrowserResult> {
    if (!this.browser.isConnected()) throw new Error("The browser is closed or has crashed");
    if (needsOpenTab && this.page.isClosed()) return this.result("The current tab was closed");
    try {
      return await run();
    } catch (error) {
      return this.result(failureReason(error, this.browser.isConnected()));
    }
  }

  async close(): Promise<Buffer> {
    // Playwright writes the trace only to a file, so it goes through a temporary directory.
    const dir = await mkdtemp(join(tmpdir(), "jevwright-trace-"));
    try {
      const path = join(dir, "trace.zip");
      await this.context.tracing.stop({ path });
      return await readFile(path);
    } finally {
      await this.browser.close();
      await rm(dir, { recursive: true, force: true });
    }
  }
}
