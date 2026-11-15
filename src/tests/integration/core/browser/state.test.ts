import type { IncomingHttpHeaders } from "node:http";
import { networkInterfaces } from "node:os";
import { setTimeout as sleep } from "node:timers/promises";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { launchBrowser, type BrowserAdapter, type LaunchOptions } from "@/core/browser/index.js";
import { serveFixtures } from "./server.js";

type Recorded = { path: string; headers: IncomingHttpHeaders };

const nonLoopbackIp = Object.values(networkInterfaces())
  .flat()
  .find((info) => info !== undefined && info.family === "IPv4" && !info.internal)?.address;

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

    it("sends the headers with navigation, subresources, and fetch to the baseUrl's origin, and with none to another origin", () =>
      run({ headers, cookies: { "session-username": { value: "standard_user" } } }, async (browser) => {
        const query = `?other=${other.baseUrl}/plain.html`;
        await browser.perform({ action: "open", url: `/state.html${query}` });
        expect(await browser.check(text("#header", "Bearer t0ken"))).toEqual(passed);
        expect(await browser.check(text("#fetch-header", "Bearer t0ken"))).toEqual(passed);
        await until(() => toOther.length > 0);
        await browser.perform({ action: "open", url: `${other.baseUrl}/state.html` });
        expect(await browser.check(text("#header", "(none)"))).toEqual(passed);

        expect(toApp.map(({ path }) => path)).toEqual([`/state.html${query}`, "/header.js", "/echo"]);
        for (const { headers: sent } of toApp) {
          expect(sent).toMatchObject({ authorization: "Bearer t0ken", "x-tenant": "acme" });
          // Adding the headers keeps the cookies the browser sends.
          expect(sent.cookie).toContain("session-username=standard_user");
        }
        expect(toOther.map(({ path }) => path)).toEqual(["/plain.html", "/state.html", "/header.js"]);
        for (const { headers: sent } of toOther) {
          expect(sent).not.toHaveProperty("authorization");
          expect(sent).not.toHaveProperty("x-tenant");
        }
      }));

    it("sends the headers to every origin without a baseUrl", () =>
      run({ baseUrl: undefined, headers }, async (browser) => {
        await browser.perform({ action: "open", url: `${app.baseUrl}/state.html` });
        expect(await browser.check(text("#header", "Bearer t0ken"))).toEqual(passed);
        await browser.perform({ action: "open", url: `${other.baseUrl}/state.html` });
        expect(await browser.check(text("#header", "Bearer t0ken"))).toEqual(passed);

        for (const { headers: sent } of [...toApp, ...toOther]) {
          expect(sent).toMatchObject({ authorization: "Bearer t0ken", "x-tenant": "acme" });
        }
      }));
  });

  describe("cookies", () => {
    it("sets a short-form cookie for the baseUrl's host on every path, readable by the page, and not for another host", () =>
      run({ cookies: { "session-username": { value: "standard_user" } } }, async (browser) => {
        await browser.perform({ action: "open", url: "/state.html" });
        expect(await browser.check(text("#cookie", "session-username=standard_user"))).toEqual(passed);
        await browser.perform({ action: "open", url: "/deep/path/plain.html" });
        await browser.perform({ action: "open", url: `http://localhost:${other.port}/state.html` });
        expect(await browser.check(text("#cookie", "(none)"))).toEqual(passed);

        expect(toApp.map(({ path, headers: sent }) => ({ path, cookie: sent.cookie }))).toEqual([
          { path: "/state.html", cookie: "session-username=standard_user" },
          { path: "/header.js", cookie: "session-username=standard_user" },
          { path: "/deep/path/plain.html", cookie: "session-username=standard_user" },
        ]);
        expect(toOther.map(({ headers: sent }) => sent.cookie)).toEqual([undefined, undefined]);
      }));

    it("shares a parent-domain cookie across subdomains of the baseUrl, with or without a leading dot, while keeping a host-only cookie on its own host", () =>
      run(
        {
          baseUrl: `http://app.shop.localhost:${app.port}`,
          cookies: {
            hostOnly: { value: "only-app" },
            withDot: { value: "shared-1", domain: ".shop.localhost" },
            withoutDot: { value: "shared-2", domain: "shop.localhost" },
          },
        },
        async (browser) => {
          await browser.perform({ action: "open", url: "/state.html" });
          expect(
            await browser.check(text("#cookie", "hostOnly=only-app; withDot=shared-1; withoutDot=shared-2")),
          ).toEqual(passed);

          await browser.perform({ action: "open", url: `http://api.shop.localhost:${app.port}/state.html` });
          expect(await browser.check(text("#cookie", "withDot=shared-1; withoutDot=shared-2"))).toEqual(passed);

          await browser.perform({ action: "open", url: `http://other.localhost:${app.port}/state.html` });
          expect(await browser.check(text("#cookie", "(none)"))).toEqual(passed);

          const pageCookies = toApp
            .filter(({ path }) => path === "/state.html")
            .map(({ headers: sent }) => sent.cookie);
          expect(pageCookies).toEqual([
            "hostOnly=only-app; withDot=shared-1; withoutDot=shared-2",
            "withDot=shared-1; withoutDot=shared-2",
            undefined,
          ]);
        },
      ));

    it("limits a full-form cookie to its path and hides an httpOnly cookie from document.cookie", () =>
      run(
        {
          cookies: {
            session: { value: "s3ssion", domain: "127.0.0.1", path: "/state.html", httpOnly: true },
            theme: { value: "dark", domain: "127.0.0.1", path: "/state.html", httpOnly: false },
          },
        },
        async (browser) => {
          await browser.perform({ action: "open", url: "/state.html" });
          // httpOnly hides "session" from the page's scripts while "theme" is readable on the same page.
          expect(await browser.check(text("#cookie", "theme=dark"))).toEqual(passed);
          await browser.perform({ action: "open", url: "/plain.html" });

          expect(toApp.map(({ path, headers: sent }) => ({ path, cookie: sent.cookie }))).toEqual([
            { path: "/state.html", cookie: "session=s3ssion; theme=dark" },
            { path: "/header.js", cookie: undefined },
            { path: "/plain.html", cookie: undefined },
          ]);
        },
      ));

    it.skipIf(!nonLoopbackIp)(
      "withholds a secure cookie over plain HTTP on a non-loopback address while sending it on loopback",
      async () => {
        const toLan: Recorded[] = [];
        const lan = await serveFixtures(undefined, recorder(toLan), nonLoopbackIp);
        const cookies = { sec: { value: "s3cure", secure: true }, plain: { value: "pl4in", secure: false } };
        try {
          await run({ baseUrl: lan.baseUrl, cookies }, async (browser) => {
            await browser.perform({ action: "open", url: "/state.html" });
            expect(await browser.check(text("#cookie", "plain=pl4in"))).toEqual(passed);
          });
          expect(toLan.map(({ headers: sent }) => sent.cookie)).toEqual(["plain=pl4in", "plain=pl4in"]);

          await run({ baseUrl: app.baseUrl, cookies }, async (browser) => {
            await browser.perform({ action: "open", url: "/state.html" });
            expect(await browser.check(text("#cookie", "sec=s3cure; plain=pl4in"))).toEqual(passed);
          });
          expect(toApp.map(({ headers: sent }) => sent.cookie)).toEqual([
            "sec=s3cure; plain=pl4in",
            "sec=s3cure; plain=pl4in",
          ]);
        } finally {
          await lan.stop();
        }
      },
    );

    it("sends a Lax cookie and withholds a Strict cookie on a cross-site top-level link navigation, and withholds both on a cross-site subresource", () =>
      run(
        {
          cookies: {
            strict: { value: "s1", sameSite: "Strict" },
            lax: { value: "l1", sameSite: "Lax" },
          },
        },
        async (browser) => {
          const start = `http://localhost:${app.port}/state.html?other=${app.baseUrl}/plain.html&link=${app.baseUrl}/state.html`;
          await browser.perform({ action: "open", url: start });
          await until(() => toApp.some(({ path }) => path === "/plain.html"));

          await browser.perform({ action: "click", element: { selector: "#cross-link" } });
          expect(await browser.check({ check: "url", url: `${app.baseUrl}/state.html` })).toEqual(passed);

          const to127 = toApp.filter(({ headers: sent }) => sent.host === `127.0.0.1:${app.port}`);
          expect(to127.map(({ path, headers: sent }) => ({ path, cookie: sent.cookie }))).toEqual([
            // Cross-site fetch from localhost to 127.0.0.1: neither Strict nor Lax is sent.
            { path: "/plain.html", cookie: undefined },
            // Cross-site top-level link click from localhost to 127.0.0.1: Lax is sent, Strict is withheld.
            { path: "/state.html", cookie: "lax=l1" },
            // Same-site subresource loaded by 127.0.0.1/state.html: both Strict and Lax are sent.
            { path: "/header.js", cookie: "strict=s1; lax=l1" },
          ]);
        },
      ));

    it("fails the launch in plain words when the browser refuses a cookie", async () => {
      const launching = launchBrowser({
        headed: false,
        baseUrl: app.baseUrl,
        timeoutMs: 2000,
        cookies: { session: { value: "a;b" } },
      });

      await expect(launching).rejects.toThrow(/^The browser refused the cookies: Invalid cookie fields$/);
    });
  });

  describe("storage", () => {
    const storage = { localStorage: { authToken: "t0ken" }, sessionStorage: { tabId: "e2e" } };

    it("lets the page's first script read the localStorage and sessionStorage entries", () =>
      run(storage, async (browser) => {
        await browser.perform({ action: "open", url: "/state.html" });

        expect(await browser.check(text("#local", "t0ken"))).toEqual(passed);
        expect(await browser.check(text("#session", "e2e"))).toEqual(passed);
      }));

    it("writes the sessionStorage entries in tabs the page opens with target=_blank or window.open, before their first script", () =>
      run(storage, async (browser) => {
        await browser.perform({ action: "open", url: "/state.html" });
        await browser.perform({ action: "click", element: { selector: "#new-tab" } });

        expect(await browser.perform({ action: "switchTab", url: "/state.html?tab=new" })).toEqual(passed);
        expect(await browser.check(text("#local", "t0ken"))).toEqual(passed);
        expect(await browser.check(text("#session", "e2e"))).toEqual(passed);

        expect(await browser.perform({ action: "switchTab", url: "/state.html" })).toEqual(passed);
        await browser.perform({ action: "click", element: { selector: "#popup" } });

        expect(await browser.perform({ action: "switchTab", url: "/state.html?tab=popup" })).toEqual(passed);
        expect(await browser.check(text("#local", "t0ken"))).toEqual(passed);
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
