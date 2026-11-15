import { createServer, type IncomingHttpHeaders, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { StepEvent } from "@/core/executor/index.js";
import type { JevClient } from "@/core/jev/index.js";
import { runTest } from "@/core/pipeline/index.js";
import type { Report, ReportBundle } from "@/core/report/index.js";
import { serveDemoApp } from "../../../benchmark/server.js";
import { throwingJev } from "../../../unit/core/executor/fake-adapter.js";
import { serveFixtures } from "../browser/server.js";

type Recorded = { path: string; headers: IncomingHttpHeaders };

// The Demo App behind a proxy that records every request, so a test sees the headers that reach its origin.
async function recordDemoApp(demoUrl: string, into: Recorded[]) {
  const server: Server = createServer(async (req, res) => {
    into.push({ path: req.url ?? "", headers: req.headers });
    const upstream = await fetch(demoUrl + (req.url ?? "/"));
    const type = upstream.headers.get("content-type") ?? "application/octet-stream";
    res.writeHead(upstream.status, { "content-type": type }).end(Buffer.from(await upstream.arrayBuffer()));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    stop: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

let demo: Awaited<ReturnType<typeof serveDemoApp>>;
let app: Awaited<ReturnType<typeof recordDemoApp>>;
let other: Awaited<ReturnType<typeof serveFixtures>>;
let fixtures: Awaited<ReturnType<typeof serveFixtures>>;
const toApp: Recorded[] = [];
const toOther: Recorded[] = [];

beforeAll(async () => {
  demo = await serveDemoApp();
  app = await recordDemoApp(demo.baseUrl, toApp);
  other = await serveFixtures(undefined, (req) => void toOther.push({ path: req.url ?? "", headers: req.headers }));
  fixtures = await serveFixtures();
});
afterAll(async () => {
  await Promise.all([app.stop(), other.stop(), fixtures.stop()]);
  await demo.stop();
});
beforeEach(() => {
  toApp.length = 0;
  toOther.length = 0;
});

// Runs `source` through the pipeline; returns the saved Report and every Step event.
async function run(source: string, vars: Record<string, string>, jev: JevClient = throwingJev) {
  const bundles: ReportBundle[] = [];
  const events: StepEvent[] = [];
  const result = await runTest(
    { file: "state.yaml", source },
    {
      headed: false,
      vars,
      jev,
      store: { save: async (bundle) => void bundles.push(bundle) },
      onEvent: (event) => events.push(event),
    },
  );
  if (result.kind !== "completed") throw new Error(`Invalid test: ${JSON.stringify(result.diagnostics)}`);
  return { report: result.report as Report, events };
}

const reasons = (report: Report) => report.steps.flatMap((step) => ("reason" in step ? [step.reason] : []));

describe("browser state against the Demo App", () => {
  it("skips the login page with a session-username cookie and opens the product list directly", async () => {
    const { report } = await run(
      `
name: "Cart"
baseUrl: "{{BASE}}"
cookies:
  session-username: "standard_user"
steps:
  - open: { url: "/inventory.html" }
  - assert: { url: "/inventory.html" }
  - assert: { selector: '[data-test="title"]', text: "Products" }
`,
      { BASE: app.baseUrl },
    );

    expect(reasons(report)).toEqual([]);
    expect(report.status).toBe("passed");
  });

  it("sends a header to the Demo App's origin and not to another origin", async () => {
    const { report } = await run(
      `
name: "Header"
baseUrl: "{{BASE}}"
headers:
  X-Run-Token: "{{TOKEN}}"
cookies:
  session-username: "standard_user"
steps:
  - open: { url: "/inventory.html" }
  - assert: { selector: '[data-test="title"]', text: "Products" }
  - open: { url: "{{OTHER}}/plain.html" }
`,
      { BASE: app.baseUrl, OTHER: other.baseUrl, TOKEN: "t0ken" },
    );

    expect(reasons(report)).toEqual([]);
    // The page, its scripts, styles, and images.
    expect(toApp.length).toBeGreaterThan(3);
    expect(toApp.map(({ headers }) => headers["x-run-token"])).toEqual(toApp.map(() => "t0ken"));
    expect(toOther.map(({ path, headers }) => ({ path, token: headers["x-run-token"] }))).toEqual([
      { path: "/plain.html", token: undefined },
    ]);
  });

  it("gives the app's own scripts the localStorage entries, so the cart badge counts them", async () => {
    const { report } = await run(
      `
name: "Cart from localStorage"
baseUrl: "{{BASE}}"
cookies:
  session-username: "standard_user"
localStorage:
  cart-contents: "[4,0]"
steps:
  - open: { url: "/inventory.html" }
  - assert: { selector: '[data-test="shopping-cart-badge"]', text: "2" }
`,
      { BASE: app.baseUrl },
    );

    expect(reasons(report)).toEqual([]);
  });

  it("resolves Variables in headers, short- and full-form cookies, localStorage, and sessionStorage, read by the page", async () => {
    const { report } = await run(
      `
name: "Variables in browser state"
baseUrl: "{{BASE}}"
headers:
  Authorization: "Bearer {{HEADER_TOKEN}}"
cookies:
  user: "{{COOKIE_USER}}"
  session:
    value: "{{COOKIE_SESSION}}"
    domain: "{{COOKIE_DOMAIN}}"
localStorage:
  authToken: "{{LOCAL_TOKEN}}"
sessionStorage:
  tabId: "{{TAB_ID}}"
steps:
  - open: { url: "/state.html?other={{OTHER}}/plain.html" }
  - assert: { selector: "#header", text: "Bearer {{HEADER_TOKEN}}" }
  - assert: { selector: "#fetch-header", text: "Bearer {{HEADER_TOKEN}}" }
  - assert: { selector: "#cookie", text: "user={{COOKIE_USER}}; session={{COOKIE_SESSION}}" }
  - assert: { selector: "#local", text: "{{LOCAL_TOKEN}}" }
  - assert: { selector: "#session", text: "{{TAB_ID}}" }
  - click: { selector: "#new-tab" }
  - switchTab: { url: "**/state.html?tab=new" }
  - assert: { selector: "#session", text: "{{TAB_ID}}" }
`,
      {
        BASE: `http://app.shop.localhost:${fixtures.port}`,
        OTHER: other.baseUrl,
        HEADER_TOKEN: "h3ader-value",
        COOKIE_USER: "standard_user",
        COOKIE_SESSION: "s3ssion-value",
        COOKIE_DOMAIN: ".shop.localhost",
        LOCAL_TOKEN: "l0cal-value",
        TAB_ID: "t4b-value",
      },
    );

    expect(reasons(report)).toEqual([]);
    expect(report.status).toBe("passed");
  });

  it("redacts resolved values of every field in step reasons, events, and the Report, and never sends them to Jev", async () => {
    const jevCalls: unknown[] = [];
    const jev: JevClient = {
      bbox: async (...args: unknown[]) => (jevCalls.push(args), { ok: false as const, reason: "no" }),
      choice: async (...args: unknown[]) => (jevCalls.push(args), { ok: false as const, reason: "no" }),
      noul: async (prompt) => (jevCalls.push(prompt), { ok: true as const, data: { probability: 0.1 } }),
    };
    const { report, events } = await run(
      `
name: "Redaction"
baseUrl: "{{BASE}}"
timeoutMs: 1000
headers:
  Authorization: "Bearer {{HEADER_TOKEN}}"
cookies:
  session: "{{COOKIE_SESSION}}"
localStorage:
  authToken: "{{LOCAL_TOKEN}}"
sessionStorage:
  tabId: "{{TAB_ID}}"
steps:
  - open: { url: "/state.html" }
  - assert: { selector: "body", text: "nothing", statement: "The page is blank" }
`,
      {
        BASE: fixtures.baseUrl,
        HEADER_TOKEN: "h3ader-value",
        COOKIE_SESSION: "s3ssion-value",
        LOCAL_TOKEN: "l0cal-value",
        TAB_ID: "t4b-value",
      },
      jev,
    );

    expect(reasons(report)).toEqual([
      expect.stringMatching(/\{\{LOCAL_TOKEN\}\}.*\{\{TAB_ID\}\}.*\{\{COOKIE_SESSION\}\}.*\{\{HEADER_TOKEN\}\}/s),
    ]);
    expect(jevCalls).toHaveLength(1);
    expect(JSON.stringify(jevCalls)).not.toMatch(/h3ader-value|s3ssion-value|l0cal-value|t4b-value/);
    expect(report.browserState).toEqual({
      headers: ["Authorization"],
      cookies: ["session"],
      localStorage: ["authToken"],
      sessionStorage: ["tabId"],
    });
    expect(JSON.stringify(report)).not.toMatch(/h3ader-value|s3ssion-value|l0cal-value|t4b-value/);
    expect(JSON.stringify(events)).not.toMatch(/h3ader-value|s3ssion-value|l0cal-value|t4b-value/);
  });
});
