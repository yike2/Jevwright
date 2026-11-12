import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { launchBrowser } from "@/core/browser/index.js";
import { data, useBrowser } from "./harness.js";
import { startRunServer } from "./run-server.js";

const fixtures = useBrowser();
let runServer: Awaited<ReturnType<typeof startRunServer>>;
beforeAll(async () => (runServer = await startRunServer()));
afterAll(() => runServer?.stop());

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

describe("launchBrowser with an endpoint", () => {
  it("drives the browser of a Playwright run-server: actions, screenshots, and the trace", async () => {
    const before = runServer.connections();
    const browser = await launchBrowser({ headed: false, timeoutMs: 5000, endpoint: runServer.endpoint });

    const opened = await browser.perform({ action: "open", url: fixtures.url("/plain.html") });
    const screenshot = data(await browser.screenshot());
    const trace = await browser.close();

    expect(runServer.connections()).toBe(before + 1);
    expect(opened.ok).toBe(true);
    expect(screenshot.subarray(0, 4)).toEqual(PNG_SIGNATURE);
    expect(trace.subarray(0, 2).toString()).toBe("PK");
  });

  it('still blocks private addresses with network: "public"', async () => {
    const before = runServer.connections();
    const browser = await launchBrowser({
      headed: false,
      timeoutMs: 2000,
      endpoint: runServer.endpoint,
      network: "public",
    });
    try {
      const result = await browser.perform({ action: "open", url: fixtures.url("/plain.html") });

      expect(runServer.connections()).toBe(before + 1);
      expect(!result.ok && result.reason).toContain("net::ERR_FAILED");
    } finally {
      await browser.close();
    }
  });

  it("fails to launch when no run-server listens at the endpoint", async () => {
    await expect(launchBrowser({ headed: false, timeoutMs: 1000, endpoint: "ws://127.0.0.1:1/" })).rejects.toThrow();
  });
});
