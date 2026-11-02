import { afterAll, beforeAll } from "vitest";
import { launchBrowser, type BrowserAdapter, type ReadResult } from "@/core/browser/index.js";
import { serveFixtures } from "./server.js";

/** The data of a successful read; fails the test with the read's reason otherwise. */
export function data<T>(result: ReadResult<T>): T {
  if (!result.ok) throw new Error(`The read failed: ${result.reason}`);
  return result.data;
}

/** Serves the fixtures for one test file; `run` launches a browser, runs `body`, and always closes it. */
export function useBrowser(timeoutMs = 2000) {
  let server: Awaited<ReturnType<typeof serveFixtures>>;
  beforeAll(async () => (server = await serveFixtures()));
  afterAll(() => server.stop());

  const launch = () => launchBrowser({ headed: false, baseUrl: server.baseUrl, timeoutMs });
  return {
    url: (path: string) => server.baseUrl + path,
    launch,
    async run(body: (browser: BrowserAdapter) => Promise<void>) {
      const browser = await launch();
      try {
        await body(browser);
      } finally {
        await browser.close();
      }
    },
  };
}
