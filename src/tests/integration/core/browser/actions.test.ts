import { describe, expect, it } from "vitest";
import type { BrowserAdapter } from "@/core/browser/index.js";
import { useBrowser } from "./harness.js";

const { run } = useBrowser();

const passed = { ok: true, dialogs: [] };
const logged = (browser: BrowserAdapter, text: string) => browser.check({ check: "text", selector: "#log", text });

describe("click", () => {
  it("clicks the first element matching a selector", () =>
    run(async (browser) => {
      await browser.perform({ action: "open", url: "/actions.html" });

      expect(await browser.perform({ action: "click", element: { selector: "button" } })).toEqual(passed);
      expect(await logged(browser, "[click]")).toEqual(passed);
    }));
});

describe("click by snapshot id", () => {
  it("clicks the element the snapshot marked with that id", () =>
    run(async (browser) => {
      await browser.perform({ action: "open", url: "/actions.html" });
      const { elements } = await browser.snapshot();
      const save = elements.find((e) => e.name === "Save")!;

      expect(await browser.perform({ action: "click", element: { snapshotId: save.id } })).toEqual(passed);
      expect(await logged(browser, "[click]")).toEqual(passed);
    }));
});

describe("snapshot ids after a new snapshot", () => {
  it("point only at elements of the latest snapshot", () =>
    run(async (browser) => {
      await browser.perform({ action: "open", url: "/actions.html" });
      await browser.snapshot();
      await browser.perform({ action: "click", element: { selector: "#hide-save" } });
      const { elements } = await browser.snapshot();

      // Save is hidden now, so id 0 is "Hide Save"; a stale mark on Save would make this click time out.
      expect(elements[0].name).toBe("Hide Save");
      expect(await browser.perform({ action: "click", element: { snapshotId: 0 } })).toEqual(passed);
    }));
});

describe("element actions", () => {
  it("double-clicks", () =>
    run(async (browser) => {
      await browser.perform({ action: "open", url: "/actions.html" });

      expect(await browser.perform({ action: "doubleClick", element: { selector: "#save" } })).toEqual(passed);
      expect(await logged(browser, "[dblclick]")).toEqual(passed);
    }));

  it("right-clicks", () =>
    run(async (browser) => {
      await browser.perform({ action: "open", url: "/actions.html" });

      expect(await browser.perform({ action: "rightClick", element: { selector: "#save" } })).toEqual(passed);
      expect(await logged(browser, "[contextmenu]")).toEqual(passed);
    }));

  it("hovers", () =>
    run(async (browser) => {
      await browser.perform({ action: "open", url: "/actions.html" });

      expect(await browser.perform({ action: "hover", element: { selector: "#save" } })).toEqual(passed);
      expect(await logged(browser, "[hover]")).toEqual(passed);
    }));

  it("fills an input, replacing its value", () =>
    run(async (browser) => {
      await browser.perform({ action: "open", url: "/actions.html" });

      const result = await browser.perform({ action: "input", element: { selector: "#title" }, value: "New title" });

      expect(result).toEqual(passed);
      expect(await logged(browser, "[input New title]")).toEqual(passed);
    }));
});

describe("page actions", () => {
  it("presses a key on the focused element", () =>
    run(async (browser) => {
      await browser.perform({ action: "open", url: "/actions.html" });

      expect(await browser.perform({ action: "press", key: "Shift+A" })).toEqual(passed);
      expect(await logged(browser, "[key A]")).toEqual(passed);
    }));

  it("fails on a key name Playwright does not know", () =>
    run(async (browser) => {
      await browser.perform({ action: "open", url: "/actions.html" });

      const result = await browser.perform({ action: "press", key: "Enterr" });

      expect(result).toEqual({ ok: false, reason: expect.stringContaining("Enterr"), dialogs: [] });
    }));

  it("scrolls by the distance, toward the side of the content to reveal", () =>
    run(async (browser) => {
      await browser.perform({ action: "open", url: "/actions.html" });

      expect(await browser.perform({ action: "scroll", direction: "down", distance: 600 })).toEqual(passed);
      expect(await logged(browser, "[scroll 0,600]")).toEqual(passed);
    }));

  it("scrolls horizontally, with left and up moving back", () =>
    run(async (browser) => {
      await browser.perform({ action: "open", url: "/actions.html" });

      await browser.perform({ action: "scroll", direction: "right", distance: 300 });
      await browser.perform({ action: "scroll", direction: "left", distance: 100 });
      await browser.perform({ action: "scroll", direction: "down", distance: 300 });
      await browser.perform({ action: "scroll", direction: "up", distance: 300 });

      expect(await browser.check({ check: "text", selector: "#position", text: "200,0" })).toEqual(passed);
    }));

  it("sleeps for the given time", () =>
    run(async (browser) => {
      await browser.perform({ action: "open", url: "/actions.html" });
      const start = Date.now();

      expect(await browser.perform({ action: "sleep", ms: 300 })).toEqual(passed);
      expect(Date.now() - start).toBeGreaterThanOrEqual(300);
    }));
});

describe("scroll over a scrollable element in the corner", () => {
  it("scrolls the page under the viewport center, not the element under the mouse's start", () =>
    run(async (browser) => {
      await browser.perform({ action: "open", url: "/actions.html" });

      await browser.perform({ action: "scroll", direction: "down", distance: 600 });

      expect(await browser.check({ check: "text", selector: "#position", text: "0,600" })).toEqual(passed);
    }));
});

describe("history actions", () => {
  it("go back and forward between pages", () =>
    run(async (browser) => {
      await browser.perform({ action: "open", url: "/plain.html" });
      await browser.perform({ action: "open", url: "/actions.html" });

      expect(await browser.perform({ action: "back" })).toEqual(passed);
      expect(await browser.check({ check: "url", url: "/plain.html" })).toEqual(passed);
      expect(await browser.perform({ action: "forward" })).toEqual(passed);
      expect(await browser.check({ check: "url", url: "/actions.html" })).toEqual(passed);
    }));

  it("fail when there is no history entry to go to", () =>
    run(async (browser) => {
      await browser.perform({ action: "open", url: "/plain.html" });

      expect(await browser.perform({ action: "back" })).toEqual({
        ok: false,
        reason: "There is no previous page to go back to",
        dialogs: [],
      });
      expect(await browser.perform({ action: "forward" })).toEqual({
        ok: false,
        reason: "There is no next page to go forward to",
        dialogs: [],
      });
    }));

  it("reloads the page", () =>
    run(async (browser) => {
      await browser.perform({ action: "open", url: "/actions.html" });

      expect(await browser.perform({ action: "reload" })).toEqual(passed);
      expect(await logged(browser, "[load 2]")).toEqual(passed);
    }));
});

describe("open", () => {
  it("fails when the page cannot be reached", () =>
    run(async (browser) => {
      const result = await browser.perform({ action: "open", url: "http://127.0.0.1:1/" });

      expect(result).toEqual({ ok: false, reason: expect.stringMatching(/^page\.goto: net::ERR_/), dialogs: [] });
    }));
});

describe("an element action on a covered element", () => {
  it("fails after the step timeout", () =>
    run(async (browser) => {
      await browser.perform({ action: "open", url: "/hittable.html" });

      const result = await browser.perform({ action: "click", element: { selector: "text=Covered" } });

      expect(result).toEqual({ ok: false, reason: expect.stringContaining("Timeout 2000ms"), dialogs: [] });
    }));
});
