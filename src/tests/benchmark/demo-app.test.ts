import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { execute } from "@/core/executor/index.js";
import { analyze } from "@/core/syntax/index.js";
import { throwingJev } from "../unit/core/executor/fake-adapter.js";
import { serveDemoApp } from "./server.js";

const SITE = fileURLToPath(new URL("./demo-app/site/", import.meta.url));

// An external stylesheet, script, image, frame, or CSS url() that a page would load on its own.
const EXTERNAL =
  /<(?:link|script|img|iframe)\b[^>]*\b(?:href|src)=["']https?:|url\(\s*["']?https?:|@import\s+["']https?:/i;

let app: Awaited<ReturnType<typeof serveDemoApp>>;
beforeAll(async () => (app = await serveDemoApp()));
afterAll(() => app.stop());

const signIn = `
name: "Sign in"
baseUrl: "{{BASE}}"
steps:
  - open:
      url: "/"
  - input:
      selector: '[data-test="username"]'
      value: "standard_user"
  - input:
      selector: '[data-test="password"]'
      value: "{{SWAG_PASSWORD}}"
  - click:
      selector: '[data-test="login-button"]'
  - waitFor:
      url: "**/inventory.html"
  - assert:
      selector: '[data-test="title"]'
      text: "Products"
`;

// Analyzes `yaml` and runs it headless against the demo app, by selector only (Jev must not be called); returns the step statuses and any failure reason.
async function run(yaml: string) {
  const { testCase, diagnostics } = analyze(yaml);
  if (!testCase) throw new Error(`Invalid test: ${JSON.stringify(diagnostics)}`);
  const vars = { BASE: app.baseUrl, SWAG_PASSWORD: "secret_sauce" };
  const { steps } = await execute(testCase, { headed: false, vars, onEvent: () => {}, jev: throwingJev });
  return {
    statuses: steps.map(({ status }) => status),
    reasons: steps.flatMap((step) => ("reason" in step ? [step.reason] : [])),
  };
}

describe("the Swag Labs demo app", () => {
  it("signs in and shows the products, served locally", async () => {
    const { statuses, reasons } = await run(signIn);

    expect(reasons).toEqual([]);
    expect(statuses).toEqual(Array(6).fill("passed"));
  });

  it("loads nothing from outside localhost", () => {
    const pages = readdirSync(SITE, { recursive: true, encoding: "utf8" }).filter((file) => /\.(html|css)$/.test(file));

    const external = pages.filter((file) => EXTERNAL.test(readFileSync(join(SITE, file), "utf8")));

    expect(pages.length).toBeGreaterThan(0);
    expect(external).toEqual([]);
  });

  it("answers the alert, prompt, and confirm on the extra dialogs page", async () => {
    const { statuses, reasons } = await run(`
name: "Dialogs"
baseUrl: "{{BASE}}"
steps:
  - open:
      url: "/extras/dialogs.html"
  - click:
      selector: "#save"
      dialog: { accept: true, message: "Profile saved" }
  - click:
      selector: "#rename"
      dialog: { accept: true, text: "Swag Lover" }
  - assert:
      selector: "#display-name"
      text: "Swag Lover"
  - click:
      selector: "#delete"
      dialog: { accept: false }
  - assert:
      selector: "#status"
      text: "Your account was kept."
`);

    expect(reasons).toEqual([]);
    expect(statuses).toEqual(Array(6).fill("passed"));
  });

  it("opens a guide in a new tab on the extra tabs page", async () => {
    const { statuses, reasons } = await run(`
name: "New tab"
baseUrl: "{{BASE}}"
steps:
  - open:
      url: "/extras/tabs.html"
  - click:
      selector: "#returns-link"
  - switchTab:
      url: "**/extras/returns.html"
  - assert:
      selector: "#returns-window"
      text: "30 days"
`);

    expect(reasons).toEqual([]);
    expect(statuses).toEqual(Array(4).fill("passed"));
  });

  it("hovers, right-clicks, and double-clicks on the extra menus page", async () => {
    const { statuses, reasons } = await run(`
name: "Menus"
baseUrl: "{{BASE}}"
steps:
  - open:
      url: "/extras/menus.html"
  - hover:
      selector: "#account-menu"
  - click:
      selector: "#sign-out-link"
  - assert:
      selector: "#status"
      text: "You are signed out."
  - rightClick:
      selector: '[data-file="packing-list.txt"]'
  - click:
      selector: "#delete-file"
  - assert:
      selector: "#status"
      text: "Deleted packing-list.txt."
  - doubleClick:
      selector: '[data-file="invoice-2026.pdf"]'
  - assert:
      selector: "#status"
      text: "Opened invoice-2026.pdf."
`);

    expect(reasons).toEqual([]);
    expect(statuses).toEqual(Array(9).fill("passed"));
  });
});
