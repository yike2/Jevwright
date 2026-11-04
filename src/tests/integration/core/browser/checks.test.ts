import { describe, expect, it } from "vitest";
import { useBrowser } from "./harness.js";

const { run } = useBrowser();

describe("check url", () => {
  it("passes when the current URL matches", () =>
    run(async (browser) => {
      await browser.perform({ action: "open", url: "/plain.html" });

      expect(await browser.check({ check: "url", url: "/plain.html" })).toEqual({ ok: true, dialogs: [] });
    }));
});

describe("check url that never matches", () => {
  it("fails after the step timeout with Playwright's reason", () =>
    run(async (browser) => {
      await browser.perform({ action: "open", url: "/plain.html" });

      const result = await browser.check({ check: "url", url: "/other.html" });

      expect(result).toEqual({ ok: false, reason: expect.stringContaining("Timeout 2000ms"), dialogs: [] });
    }));
});

describe("check url with a pattern", () => {
  it("matches the same URLs as switchTab, with { and } taken literally", () =>
    run(async (browser) => {
      await browser.perform({ action: "open", url: "/plain.html" });

      expect(await browser.check({ check: "url", url: "**/plain.*" })).toEqual({ ok: true, dialogs: [] });
      expect(await browser.check({ check: "url", url: "**/{plain,checks}.html" })).toMatchObject({ ok: false });
      expect(await browser.perform({ action: "switchTab", url: "**/{plain,checks}.html" })).toMatchObject({ ok: false });
    }));
});

describe("check visible", () => {
  it("passes for a visible element", () =>
    run(async (browser) => {
      await browser.perform({ action: "open", url: "/checks.html" });

      expect(await browser.check({ check: "visible", selector: "#welcome" })).toEqual({ ok: true, dialogs: [] });
    }));
});

describe("check visible on a hidden element", () => {
  it("fails after the step timeout", () =>
    run(async (browser) => {
      await browser.perform({ action: "open", url: "/checks.html" });

      const result = await browser.check({ check: "visible", selector: "#secret" });

      expect(result).toEqual({ ok: false, reason: expect.stringContaining("Timeout 2000ms"), dialogs: [] });
    }));
});

describe("check text", () => {
  it("passes when the element's text, with whitespace collapsed, contains the text", () =>
    run(async (browser) => {
      await browser.perform({ action: "open", url: "/checks.html" });

      const result = await browser.check({ check: "text", selector: "#welcome", text: "Welcome back, Ada" });

      expect(result).toEqual({ ok: true, dialogs: [] });
    }));

  it("collapses whitespace in the expected text too, like toContainText", () =>
    run(async (browser) => {
      await browser.perform({ action: "open", url: "/checks.html" });

      const result = await browser.check({ check: "text", selector: "#welcome", text: " Welcome  back,\n Ada " });

      expect(result).toEqual({ ok: true, dialogs: [] });
    }));

  it("fails when the text never appears", () =>
    run(async (browser) => {
      await browser.perform({ action: "open", url: "/checks.html" });

      const result = await browser.check({ check: "text", selector: "#welcome", text: "Goodbye" });

      expect(result).toEqual({ ok: false, reason: expect.stringContaining("Goodbye"), dialogs: [] });
    }));
});

describe("checks on a selector with several matches", () => {
  it("use the first match instead of failing", () =>
    run(async (browser) => {
      await browser.perform({ action: "open", url: "/checks.html" });

      expect(await browser.check({ check: "visible", selector: ".item" })).toEqual({ ok: true, dialogs: [] });
      expect(await browser.check({ check: "text", selector: ".item", text: "First item" })).toEqual({
        ok: true,
        dialogs: [],
      });
    }));
});

describe("check text on an element that disappears", () => {
  it("fails with the last text it read, not a read timeout", () =>
    run(async (browser) => {
      await browser.perform({ action: "open", url: "/checks.html" });

      const result = await browser.check({ check: "text", selector: "#fleeting", text: "Saved" });

      expect(result).toEqual({
        ok: false,
        reason: 'Text of "#fleeting" did not contain "Saved" within 2000ms; it was "Saving"',
        dialogs: [],
      });
    }));
});

describe("check text on an element that never appears", () => {
  it("fails with Playwright's timeout", () =>
    run(async (browser) => {
      await browser.perform({ action: "open", url: "/checks.html" });

      const result = await browser.check({ check: "text", selector: "#missing", text: "Saved" });

      expect(result).toEqual({ ok: false, reason: expect.stringContaining("Timeout 2000ms"), dialogs: [] });
    }));
});
