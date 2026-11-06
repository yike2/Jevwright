import type { BoundingBox } from "@/core/browser/types.js";
import { createJevClient } from "@/core/jev/jev-harness.js";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

describe.skipIf(!process.env.OPENROUTER_API_KEY)("createJevClient live", () => {
    const VIEWPORT = { width: 1280, height: 720 };
    const client = createJevClient({
        apiKey: process.env.OPENROUTER_API_KEY as string,
        fetch: globalThis.fetch,
    });

    let browser: Browser;
    let context: BrowserContext;
    let page: Page;
    let screenshot: Buffer;
    let signInRect: BoundingBox;

    beforeAll(async () => {
        browser = await chromium.launch();
        context = await browser.newContext({ viewport: VIEWPORT });
        page = await context.newPage();

        await page.setContent(`
      <!doctype html>
      <html lang="en">
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <title>Live Jev Fixture</title>
          <style>
            body {
              margin: 0;
              font-family: sans-serif;
              background: #f6f8fb;
              min-height: 100vh;
              display: grid;
              place-items: center;
            }
            form {
              width: 380px;
              background: #ffffff;
              border: 1px solid #d0d7e2;
              border-radius: 12px;
              padding: 24px;
              box-shadow: 0 12px 28px rgba(14, 24, 42, 0.12);
            }
            label {
              display: block;
              margin-bottom: 8px;
              font-weight: 600;
              color: #1f2937;
            }
            input {
              width: 100%;
              box-sizing: border-box;
              margin-bottom: 14px;
              border: 1px solid #cbd5e1;
              border-radius: 8px;
              padding: 10px 12px;
            }
            button {
              width: 100%;
              border: none;
              border-radius: 8px;
              padding: 11px 12px;
              font-size: 15px;
              font-weight: 700;
              color: #ffffff;
              background: #2563eb;
            }
          </style>
        </head>
        <body>
          <form>
            <label for="email">Email</label>
            <input id="email" name="email" type="email" autocomplete="email" />
            <label for="password">Password</label>
            <input id="password" name="password" type="password" autocomplete="current-password" />
            <button id="sign-in" type="submit">Sign in</button>
          </form>
        </body>
      </html>
    `);

        const buttonBox = await page.locator("#sign-in").boundingBox();
        expect(buttonBox).not.toBeNull();
        signInRect = buttonBox as BoundingBox;

        screenshot = await page.screenshot({ fullPage: false });
    });

    afterAll(async () => {
        await context.close();
        await browser.close();
    });

    it(
        "noul text returns high probability for an obviously true statement",
        async () => {
            const result = await client.noul("Is this statement true: 2 + 2 = 4?", { text: "Basic arithmetic" });
            expect(result.ok).toBe(true);
            if (!result.ok) {
                return;
            }

            expect(result.data.probability).toBeGreaterThan(0.5);
        },
        30_000,
    );

    it(
        "noul text returns low probability for an obviously false statement",
        async () => {
            const result = await client.noul("Is this statement true: the Earth is flat?", { text: "Basic science" });
            expect(result.ok).toBe(true);
            if (!result.ok) {
                return;
            }

            expect(result.data.probability).toBeLessThan(0.5);
        },
        30_000,
    );

    it(
        "noul image returns high probability for the Sign in button prompt",
        async () => {
            const result = await client.noul("Is there a Sign in button?", { image: screenshot });
            expect(result.ok).toBe(true);
            if (!result.ok) {
                return;
            }

            expect(result.data.probability).toBeGreaterThan(0.5);
        },
        30_000,
    );

    it(
        "choice returns the index of the Sign in button option",
        async () => {
            const result = await client.choice("Sign in button", [
                "Email input",
                "Password input",
                "Sign in button",
                "Footer link",
            ]);

            expect(result.ok).toBe(true);
            if (!result.ok) {
                return;
            }

            expect(result.data.index).toBe(2);
        },
        30_000,
    );

    it(
        "bbox center falls inside the real Sign in button rectangle",
        async () => {
            const result = await client.bbox("Blue Sign in button", screenshot, VIEWPORT);
            expect(result.ok).toBe(true);
            if (!result.ok) {
                return;
            }

            expect(result.data.box).not.toBeNull();
            if (result.data.box === null) {
                return;
            }

            const center = {
                x: result.data.box.x + result.data.box.width / 2,
                y: result.data.box.y + result.data.box.height / 2,
            };

            expect(center.x).toBeGreaterThanOrEqual(signInRect.x);
            expect(center.x).toBeLessThanOrEqual(signInRect.x + signInRect.width);
            expect(center.y).toBeGreaterThanOrEqual(signInRect.y);
            expect(center.y).toBeLessThanOrEqual(signInRect.y + signInRect.height);
        },
        30_000,
    );

    it(
        "bbox returns null for an absent red delete account button",
        async () => {
            const result = await client.bbox("Red Delete account button", screenshot, VIEWPORT);
            expect(result.ok).toBe(true);
            if (!result.ok) {
                return;
            }

            expect(result.data.box).toBeNull();
        },
        30_000,
    );
});