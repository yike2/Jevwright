import { setTimeout as sleep } from "node:timers/promises";
import { describe, expect, it } from "vitest";
import { data, useBrowser } from "./harness.js";

const { run } = useBrowser();

describe("isVisible", () => {
  it("reads true once the first match is visible", () =>
    run(async (browser) => {
      await browser.perform({ action: "open", url: "/checks.html" });

      expect(await browser.isVisible(".item", 500)).toEqual({ ok: true, data: true });
    }));
});

describe("isVisible when nothing visible matches", () => {
  it("reads false after its own timeout", () =>
    run(async (browser) => {
      await browser.perform({ action: "open", url: "/checks.html" });

      const start = Date.now();

      expect(await browser.isVisible("#secret", 300)).toEqual({ ok: true, data: false });
      expect(Date.now() - start).toBeLessThan(1500); // the step timeout is 2000ms
    }));

  it("reads false at once for a timeout of 0, which Playwright would treat as no timeout", () =>
    run(async (browser) => {
      await browser.perform({ action: "open", url: "/checks.html" });

      const read = await Promise.race([browser.isVisible("#secret", 0), sleep(1500).then(() => "still waiting")]);

      expect(read).toEqual({ ok: true, data: false });
    }));

  it("fails with Playwright's reason when it rejects the selector", () =>
    run(async (browser) => {
      await browser.perform({ action: "open", url: "/checks.html" });

      expect(await browser.isVisible("#[", 300)).toEqual({
        ok: false,
        reason: expect.stringMatching(/^locator\.waitFor: /),
      });
    }));
});

describe("snapshot", () => {
  it("describes the page and each interactive element with its box in CSS pixels", () =>
    run(async (browser) => {
      await browser.perform({ action: "open", url: "/snapshot.html" });

      const snapshot = data(await browser.snapshot());

      expect(snapshot).toMatchObject({
        url: expect.stringMatching(/\/snapshot\.html$/),
        title: "Snapshot",
        viewport: { width: 1280, height: 800 },
      });
      expect(snapshot.elements[0]).toEqual({
        id: 0,
        tag: "button",
        role: "button",
        name: "Save",
        attrs: {},
        bbox: { x: 10, y: 20, width: 100, height: 30 },
        hittable: true,
      });
    }));
});

describe("snapshot element filter", () => {
  it("keeps only visible interactive elements inside the viewport", () =>
    run(async (browser) => {
      await browser.perform({ action: "open", url: "/snapshot.html" });

      const { elements } = data(await browser.snapshot());

      expect(elements.map((e) => e.name)).toEqual(["Save"]);
    }));
});

describe("snapshot roles", () => {
  it("collects interactive elements with their explicit or implicit role", () =>
    run(async (browser) => {
      await browser.perform({ action: "open", url: "/roles.html" });

      const { elements } = data(await browser.snapshot());

      expect(elements.map((e) => [e.name, e.role])).toEqual([
        ["Home", "link"],
        ["Email", "textbox"],
        ["Remember me", "checkbox"],
        ["Weekly", "radio"],
        ["Search tasks", "searchbox"],
        ["Sign in", "button"],
        ["Status", "combobox"],
        ["Notes", "textbox"],
        ["Weekly summary", "switch"],
        ["Done", "tab"],
        ["Focusable card", "div"],
        ["More", "button"],
      ]);
    }));
});

describe("snapshot names", () => {
  it("uses aria-label, aria-labelledby, <label>, visible text, title, then placeholder", () =>
    run(async (browser) => {
      await browser.perform({ action: "open", url: "/names.html" });

      const { elements } = data(await browser.snapshot());

      expect(elements.map((e) => e.name)).toEqual([
        "Send a weekly summary",
        "Email address",
        "Search everything",
        "Close dialog",
        "Rename",
        "Archive",
      ]);
    }));
});

describe("snapshot text and attrs", () => {
  it("adds text only when it differs from the name, and the state attributes", () =>
    run(async (browser) => {
      await browser.perform({ action: "open", url: "/attrs.html" });

      const { elements } = data(await browser.snapshot());

      expect(elements.map(({ name, text, attrs }) => ({ name, text, attrs }))).toEqual([
        { name: "Delete task", text: "Remove", attrs: {} },
        { name: "Save", attrs: {} },
        {
          name: "Email",
          attrs: { type: "email", placeholder: "you@example.com", "aria-invalid": "true", value: "ada@example.com" },
        },
        { name: "Remember me", attrs: { type: "checkbox", checked: true } },
        { name: "Archive", attrs: { disabled: true } },
        { name: "Home", attrs: { href: "/plain.html", "aria-current": "page" } },
        { name: "Done", attrs: { "aria-selected": "true" } },
        { name: "Weekly", attrs: { "aria-checked": "false" } },
        { name: "Name", attrs: { disabled: true } },
      ]);
    }));
});

describe("snapshot hittable", () => {
  it("is false when another element covers the center, unless it is the element's label", () =>
    run(async (browser) => {
      await browser.perform({ action: "open", url: "/hittable.html" });

      const { elements } = data(await browser.snapshot());

      expect(elements.map((e) => [e.name, e.hittable])).toEqual([
        ["Open", true],
        ["Covered", false],
        ["Remember me", true],
      ]);
    }));
});
