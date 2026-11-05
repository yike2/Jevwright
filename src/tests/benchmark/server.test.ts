import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { serveDemoApp } from "./server.js";

const ASSETS = fileURLToPath(new URL("./demo-app/site/assets/", import.meta.url));
// The build names its bundle with a content hash, so the test looks it up.
const bundle = readdirSync(ASSETS).find((file) => /^index-.*\.js$/.test(file))!;

let app: Awaited<ReturnType<typeof serveDemoApp>>;
beforeAll(async () => (app = await serveDemoApp()));
afterAll(() => app.stop());

describe("serveDemoApp", () => {
  it("serves the app's index.html at the root", async () => {
    const response = await fetch(`${app.baseUrl}/`);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/html; charset=utf-8");
    expect(await response.text()).toContain('<div id="root">');
  });

  it("serves a script with a JavaScript type, since browsers refuse to run module scripts of any other type", async () => {
    const response = await fetch(`${app.baseUrl}/assets/${bundle}`);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/javascript; charset=utf-8");
    expect(await response.text()).not.toContain("<html");
  });

  it("serves index.html for a client-side route that has no file, so a reload or a direct link works", async () => {
    const response = await fetch(`${app.baseUrl}/inventory.html`);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/html; charset=utf-8");
    expect(await response.text()).toContain('<div id="root">');
  });

  it("serves the extra pages under /extras/, which are not part of Swag Labs", async () => {
    const response = await fetch(`${app.baseUrl}/extras/dialogs.html`);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/html; charset=utf-8");
    expect(await response.text()).toContain("<title>Account settings</title>");
  });
});
