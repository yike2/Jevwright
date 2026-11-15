import type { IncomingHttpHeaders } from "node:http";
import { setTimeout as sleep } from "node:timers/promises";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { launchBrowser, type BrowserAdapter, type LaunchOptions } from "@/core/browser/index.js";
import { serveFixtures } from "./server.js";

type Recorded = { path: string; headers: IncomingHttpHeaders };

// Two servers of the same fixtures on two ports, so two origins; each records the requests it gets.
let app: Awaited<ReturnType<typeof serveFixtures>>;
let other: Awaited<ReturnType<typeof serveFixtures>>;
const toApp: Recorded[] = [];
const toOther: Recorded[] = [];
const recorder = (into: Recorded[]) => (req: { url?: string; headers: IncomingHttpHeaders }) =>
  void into.push({ path: req.url ?? "", headers: req.headers });

beforeAll(async () => {
  app = await serveFixtures(undefined, recorder(toApp));
  other = await serveFixtures(undefined, recorder(toOther));
});
afterAll(async () => {
  await app.stop();
  await other.stop();
});
beforeEach(() => {
  toApp.length = 0;
  toOther.length = 0;
});

const passed = { ok: true, dialogs: [] };

async function run(options: Partial<LaunchOptions>, body: (browser: BrowserAdapter) => Promise<void>) {
  const browser = await launchBrowser({ headed: false, baseUrl: app.baseUrl, timeoutMs: 2000, ...options });
  try {
    await body(browser);
  } finally {
    await browser.close();
  }
}

// The fetch to the other origin runs after the page loaded, so it is awaited on the server side.
async function until(condition: () => boolean) {
  for (let i = 0; i < 50 && !condition(); i++) await sleep(50);
  expect(condition()).toBe(true);
}

const text = (selector: string, value: string) => ({ check: "text" as const, selector, text: value });

describe("browser state", () => {
  describe("headers", () => {
    const headers = { Authorization: "Bearer t0ken", "X-Tenant": "acme" };

    it("sends the headers with every request to the baseUrl's origin and with none to another origin", () =>
      run({ headers, cookies: { "session-username": { value: "standard_user" } } }, async (browser) => {
        await browser.perform({ action: "open", url: `/state.html?other=${other.baseUrl}/plain.html` });
        await until(() => toOther.length > 0);
        await browser.perform({ action: "open", url: `${other.baseUrl}/plain.html` });

        expect(toApp.length).toBeGreaterThan(0);
        for (const { headers: sent } of toApp) {
          expect(sent).toMatchObject({ authorization: "Bearer t0ken", "x-tenant": "acme" });
          // Adding the headers keeps the cookies the browser sends.
          expect(sent.cookie).toContain("session-username=standard_user");
        }
        expect(toOther.length).toBe(2);
        for (const { headers: sent } of toOther) {
          expect(sent).not.toHaveProperty("authorization");
          expect(sent).not.toHaveProperty("x-tenant");
        }
      }));

    it("sends the headers to every origin without a baseUrl", () =>
      run({ baseUrl: undefined, headers }, async (browser) => {
        await browser.perform({ action: "open", url: `${app.baseUrl}/plain.html` });
        await browser.perform({ action: "open", url: `${other.baseUrl}/plain.html` });

        expect([...toApp, ...toOther].map(({ headers: sent }) => sent.authorization)).toEqual([
          "Bearer t0ken",
          "Bearer t0ken",
        ]);
      }));
  });

  describe("cookies", () => {
    it("sets a short-form cookie for the baseUrl's host on every path, readable by the page", () =>
      run({ cookies: { "session-username": { value: "standard_user" } } }, async (browser) => {
        await browser.perform({ action: "open", url: "/state.html" });
        await browser.perform({ action: "open", url: "/deep/path/plain.html" });

        expect(toApp.map(({ headers: sent }) => sent.cookie)).toEqual([
          "session-username=standard_user",
          "session-username=standard_user",
        ]);
        await browser.perform({ action: "open", url: "/state.html" });
        expect(await browser.check(text("#cookie", "session-username=standard_user"))).toEqual(passed);
      }));

    it("sets a full-form cookie with its domain, path, httpOnly, and sameSite", () =>
      run(
        {
          cookies: {
            session: { value: "s3ssion", domain: "127.0.0.1", path: "/state.html", httpOnly: true, sameSite: "Strict" },
          },
        },
        async (browser) => {
          await browser.perform({ action: "open", url: "/state.html" });
          await browser.perform({ action: "open", url: "/plain.html" });

          expect(toApp.map(({ path, headers: sent }) => ({ path, cookie: sent.cookie }))).toEqual([
            { path: "/state.html", cookie: "session=s3ssion" },
            { path: "/plain.html", cookie: undefined },
          ]);
          // httpOnly hides it from the page's scripts, also where it is sent.
          await browser.perform({ action: "open", url: "/state.html" });
          expect(await browser.check(text("#cookie", "(none)"))).toEqual(passed);
        },
      ));
  });

  describe("storage", () => {
    const storage = { localStorage: { authToken: "t0ken" }, sessionStorage: { tabId: "e2e" } };

    it("lets the page's first script read the localStorage and sessionStorage entries", () =>
      run(storage, async (browser) => {
        await browser.perform({ action: "open", url: "/state.html" });

        expect(await browser.check(text("#local", "t0ken"))).toEqual(passed);
        expect(await browser.check(text("#session", "e2e"))).toEqual(passed);
      }));

    it("writes the sessionStorage entries in a tab the page opens, before its first script", () =>
      run(storage, async (browser) => {
        await browser.perform({ action: "open", url: "/state.html" });
        await browser.perform({ action: "click", element: { selector: "#new-tab" } });

        expect(await browser.perform({ action: "switchTab", url: "/state.html?tab=new" })).toEqual(passed);
        expect(await browser.check(text("#session", "e2e"))).toEqual(passed);
      }));

    it("writes localStorage once, so the page's own changes stay after a reload, and sessionStorage at every load", () =>
      run(storage, async (browser) => {
        await browser.perform({ action: "open", url: "/state.html" });
        await browser.perform({ action: "click", element: { selector: "#change" } });
        await browser.perform({ action: "reload" });

        expect(await browser.check(text("#local", "changed"))).toEqual(passed);
        expect(await browser.check(text("#session", "e2e"))).toEqual(passed);
      }));

    it("writes no storage for another origin", () =>
      run(storage, async (browser) => {
        await browser.perform({ action: "open", url: `${other.baseUrl}/state.html` });

        expect(await browser.check(text("#local", "null"))).toEqual(passed);
        expect(await browser.check(text("#session", "null"))).toEqual(passed);
      }));
  });
});
