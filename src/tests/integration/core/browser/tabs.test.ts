import { describe, expect, it } from "vitest";
import { useBrowser } from "./harness.js";

const { run, url } = useBrowser();

const passed = { ok: true, dialogs: [] };

describe("switchTab", () => {
  it("makes a tab the page opened the current tab, and switches back", () =>
    run(async (browser) => {
      await browser.perform({ action: "open", url: "/tabs.html" });
      await browser.perform({ action: "click", element: { selector: "#help" } });
      expect(await browser.check({ check: "url", url: "/tabs.html" })).toEqual(passed);

      expect(await browser.perform({ action: "switchTab", url: "**/help.html" })).toEqual(passed);
      expect(await browser.check({ check: "text", selector: "h1", text: "Help center" })).toEqual(passed);

      expect(await browser.perform({ action: "switchTab", url: "/tabs.html" })).toEqual(passed);
      expect(await browser.isVisible("#popup", 500)).toEqual({ ok: true, data: true });
    }));

  it("fails when more than one tab matches", () =>
    run(async (browser) => {
      await browser.perform({ action: "open", url: "/tabs.html" });
      await browser.perform({ action: "click", element: { selector: "#popup" } });
      await browser.perform({ action: "click", element: { selector: "#popup" } });
      await browser.perform({ action: "sleep", ms: 1000 }); // both new tabs leave about:blank

      const plain = url("/plain.html");
      expect(await browser.perform({ action: "switchTab", url: "**/plain.html" })).toEqual({
        ok: false,
        reason: `2 tabs match "**/plain.html": ${plain}, ${plain}`,
        dialogs: [],
      });
    }));

  it("fails after the step timeout when no tab matches, listing the open tabs", () =>
    run(async (browser) => {
      await browser.perform({ action: "open", url: "/tabs.html" });

      expect(await browser.perform({ action: "switchTab", url: "**/nowhere.html" })).toEqual({
        ok: false,
        reason: `No tab matched "**/nowhere.html" within 2000ms; open tabs: ${url("/tabs.html")}`,
        dialogs: [],
      });
    }));

  it("fails the next step and every read when the page closes the current tab, and forgets the closed tab", () =>
    run(async (browser) => {
      await browser.perform({ action: "open", url: "/tabs.html" });
      await browser.perform({ action: "click", element: { selector: "#help" } });
      await browser.perform({ action: "switchTab", url: "**/help.html" });
      await browser.perform({ action: "click", element: { selector: "#close" } });

      expect(await browser.ready()).toEqual({ ok: false, reason: "The current tab was closed", dialogs: [] });
      const closed = { ok: false, reason: "The current tab was closed" };
      expect(await browser.screenshot()).toEqual(closed);
      expect(await browser.snapshot()).toEqual(closed);
      expect(await browser.isVisible("h1", 100)).toEqual(closed);
      expect(await browser.perform({ action: "switchTab", url: "**/help.html" })).toMatchObject({
        ok: false,
        reason: `No tab matched "**/help.html" within 2000ms; open tabs: ${url("/tabs.html")}`,
      });
    }));

  it("answers dialogs in a tab the page opened", () =>
    run(async (browser) => {
      await browser.perform({ action: "open", url: "/tabs.html" });
      await browser.perform({ action: "click", element: { selector: "#help" } });
      await browser.perform({ action: "switchTab", url: "**/help.html" });

      const result = await browser.perform({ action: "click", element: { selector: "#reset" }, dialog: { accept: true } });

      expect(result).toEqual({
        ok: true,
        dialogs: [{ type: "confirm", message: "Reset settings?", answer: "accepted", expected: true }],
      });
    }));
});
