import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { launchBrowser } from "@/core/browser/index.js";
import { serveFixtures } from "./server.js";

let server: Awaited<ReturnType<typeof serveFixtures>>;
beforeAll(async () => (server = await serveFixtures()));
afterAll(() => server.stop());

const launch = () => launchBrowser({ headed: false, baseUrl: server.baseUrl, timeoutMs: 5000 });

// PNG stores width and height as big-endian integers at bytes 16 and 20.
const pngSize = (png: Buffer) => ({ width: png.readUInt32BE(16), height: png.readUInt32BE(20) });

describe("launchBrowser", () => {
  it("takes viewport screenshots at one image pixel per CSS pixel", async () => {
    const browser = await launch();
    try {
      await browser.perform({ action: "open", url: "/plain.html" });

      expect(pngSize(await browser.screenshot())).toEqual({ width: 1280, height: 800 });
    } finally {
      await browser.close();
    }
  });

  it("records a trace and hands it over as a zip on close", async () => {
    const browser = await launch();
    await browser.perform({ action: "open", url: "/plain.html" });

    const trace = await browser.close();

    expect(trace.subarray(0, 2).toString()).toBe("PK");
  });

  it("is ready once the page has loaded", async () => {
    const browser = await launch();
    try {
      await browser.perform({ action: "open", url: "/plain.html" });

      expect(await browser.ready()).toEqual({ ok: true, dialogs: [] });
    } finally {
      await browser.close();
    }
  });

  it("throws instead of returning a result once the browser is gone", async () => {
    const browser = await launch();
    await browser.close();

    await expect(browser.perform({ action: "open", url: "/plain.html" })).rejects.toThrow();
    await expect(browser.ready()).rejects.toThrow();
  });

  it("waits in ready() for the load event of a page a click navigated to", async () => {
    const browser = await launch();
    try {
      await browser.perform({ action: "open", url: "/plain.html" });
      await browser.perform({ action: "click", element: { selector: "#slow" } });

      expect(await browser.ready()).toEqual({ ok: true, dialogs: [] });
      expect((await browser.snapshot()).title).toBe("Loaded");
    } finally {
      await browser.close();
    }
  });
});
