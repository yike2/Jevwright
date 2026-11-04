import { setTimeout as sleep } from "node:timers/promises";
import { describe, expect, it } from "vitest";
import type { BrowserAdapter } from "@/core/browser/index.js";
import { useBrowser } from "./harness.js";

const { run } = useBrowser();

const passed = { ok: true, dialogs: [] };
const logged = (browser: BrowserAdapter, text: string) => browser.check({ check: "text", selector: "#log", text });
const click = (browser: BrowserAdapter, selector: string, dialog?: { accept: boolean; text?: string; message?: string }) =>
  browser.perform({ action: "click", element: { selector }, dialog });

describe("a dialog response", () => {
  it("accepts the dialog its action opens and reports it", () =>
    run(async (browser) => {
      await browser.perform({ action: "open", url: "/dialogs.html" });

      expect(await click(browser, "#confirm", { accept: true })).toEqual({
        ok: true,
        dialogs: [{ type: "confirm", message: "Delete this task?", answer: "accepted", expected: true }],
      });
      expect(await logged(browser, "[confirmed]")).toEqual(passed);
    }));

  it("dismisses the dialog when accept is false", () =>
    run(async (browser) => {
      await browser.perform({ action: "open", url: "/dialogs.html" });

      expect(await click(browser, "#confirm", { accept: false })).toEqual({
        ok: true,
        dialogs: [{ type: "confirm", message: "Delete this task?", answer: "dismissed", expected: true }],
      });
      expect(await logged(browser, "[cancelled]")).toEqual(passed);
    }));

  it("types text into a prompt before accepting it", () =>
    run(async (browser) => {
      await browser.perform({ action: "open", url: "/dialogs.html" });

      expect(await click(browser, "#prompt", { accept: true, text: "Groceries" })).toMatchObject({ ok: true });
      expect(await logged(browser, "[prompt Groceries]")).toEqual(passed);
    }));

  it("fails after answering when the dialog text does not contain the expected message", () =>
    run(async (browser) => {
      await browser.perform({ action: "open", url: "/dialogs.html" });

      expect(await click(browser, "#confirm", { accept: true, message: "Archive" })).toEqual({
        ok: false,
        reason: 'The dialog said "Delete this task?", which does not contain "Archive"',
        dialogs: [{ type: "confirm", message: "Delete this task?", answer: "accepted", expected: true }],
      });
      expect(await logged(browser, "[confirmed]")).toEqual(passed);
    }));

  it("fails when no dialog appears within max(timeoutMs, DIALOG_MIN_WAIT_MS)", () =>
    run(async (browser) => {
      await browser.perform({ action: "open", url: "/dialogs.html" });
      const start = Date.now();

      expect(await click(browser, "#none", { accept: true })).toEqual({
        ok: false,
        reason: "The expected dialog did not appear within 3000ms",
        dialogs: [],
      });
      expect(Date.now() - start).toBeGreaterThanOrEqual(3000);
    }), 10_000);

  it("waits for a dialog that opens a moment after the action", () =>
    run(async (browser) => {
      await browser.perform({ action: "open", url: "/dialogs.html" });

      expect(await click(browser, "#late", { accept: true })).toMatchObject({ ok: true });
      expect(await logged(browser, "[confirmed]")).toEqual(passed);
    }));
});

describe("an unexpected dialog", () => {
  it("is dismissed and fails the step it appeared in", () =>
    run(async (browser) => {
      await browser.perform({ action: "open", url: "/dialogs.html" });

      expect(await click(browser, "#alert")).toEqual({
        ok: false,
        reason: 'Unexpected alert dialog: "Saved"',
        dialogs: [{ type: "alert", message: "Saved", answer: "dismissed", expected: false }],
      });
    }));

  it("fails the step when a second dialog follows the expected one", () =>
    run(async (browser) => {
      await browser.perform({ action: "open", url: "/dialogs.html" });

      expect(await click(browser, "#twice", { accept: true })).toEqual({
        ok: false,
        reason: 'Unexpected confirm dialog: "Second?"',
        dialogs: [
          { type: "confirm", message: "First?", answer: "accepted", expected: true },
          { type: "confirm", message: "Second?", answer: "dismissed", expected: false },
        ],
      });
    }));

  it("fails the next step at ready() when it opened between steps", () =>
    run(async (browser) => {
      await browser.perform({ action: "open", url: "/dialogs.html" });
      expect(await click(browser, "#delayed")).toEqual(passed);
      await sleep(500);

      expect(await browser.ready()).toEqual({
        ok: false,
        reason: 'Unexpected alert dialog: "Saved in the background"',
        dialogs: [{ type: "alert", message: "Saved in the background", answer: "dismissed", expected: false }],
      });
    }));

  it("is left by reads for the result of the next step", () =>
    run(async (browser) => {
      await browser.perform({ action: "open", url: "/dialogs.html" });
      await click(browser, "#delayed");
      await sleep(500);

      expect(await browser.screenshot()).toMatchObject({ ok: true });
      expect(await browser.snapshot()).toMatchObject({ ok: true });
      expect(await browser.isVisible("#alert", 100)).toEqual({ ok: true, data: true });
      expect(await browser.ready()).toEqual({
        ok: false,
        reason: 'Unexpected alert dialog: "Saved in the background"',
        dialogs: [{ type: "alert", message: "Saved in the background", answer: "dismissed", expected: false }],
      });
    }));

  it("fails a check it appeared during", () =>
    run(async (browser) => {
      await browser.perform({ action: "open", url: "/dialogs.html" });
      await click(browser, "#then-done");

      expect(await browser.check({ check: "url", url: "**/dialogs.html#done" })).toEqual({
        ok: false,
        reason: 'Unexpected alert dialog: "Heads up"',
        dialogs: [{ type: "alert", message: "Heads up", answer: "dismissed", expected: false }],
      });
    }));

  it("is reported with the step even when the step's action fails", () =>
    run(async (browser) => {
      await browser.perform({ action: "open", url: "/dialogs.html" });
      await click(browser, "#then-done");

      expect(await click(browser, "#missing")).toEqual({
        ok: false,
        reason: expect.stringContaining("Timeout 2000ms"),
        dialogs: [{ type: "alert", message: "Heads up", answer: "dismissed", expected: false }],
      });
      expect(await browser.ready()).toEqual(passed);
    }));

  it("counts as unexpected after an armed response whose dialog never came", () =>
    run(async (browser) => {
      await browser.perform({ action: "open", url: "/dialogs.html" });
      await click(browser, "#none", { accept: true });

      expect(await click(browser, "#alert")).toMatchObject({ ok: false, reason: 'Unexpected alert dialog: "Saved"' });
    }), 10_000);
});

describe("a dialog response on an action that fails", () => {
  it("does not wait for the dialog after the action reported its failure", () =>
    run(async (browser) => {
      await browser.perform({ action: "open", url: "/dialogs.html" });
      const start = Date.now();

      expect(await browser.perform({ action: "back", dialog: { accept: true } })).toMatchObject({
        ok: false,
        reason: "There is no previous page to go back to",
      });
      expect(Date.now() - start).toBeLessThan(3000);
    }), 10_000);
});
