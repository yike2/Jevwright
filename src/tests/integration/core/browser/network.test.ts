import { describe, expect, it } from "vitest";
import { launchBrowser } from "@/core/browser/index.js";
import { useBrowser } from "./harness.js";

const fixtures = useBrowser();

describe('network: "public"', () => {
  it("blocks a page on 127.0.0.1, failing the step with net::ERR_FAILED", async () => {
    const browser = await launchBrowser({ headed: false, timeoutMs: 2000, network: "public" });
    try {
      const result = await browser.perform({ action: "open", url: fixtures.url("/plain.html") });

      expect(result.ok).toBe(false);
      expect(!result.ok && result.reason).toContain("net::ERR_FAILED");
    } finally {
      await browser.close();
    }
  });

  it('loads the same page with network "any"', async () => {
    const browser = await launchBrowser({ headed: false, timeoutMs: 2000, network: "any" });
    try {
      expect((await browser.perform({ action: "open", url: fixtures.url("/plain.html") })).ok).toBe(true);
    } finally {
      await browser.close();
    }
  });
});
