// Browser Driver stand-in that serves a page captured by
// scripts/capture-fixtures.ts instead of driving a real browser.
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseHTML } from "linkedom";
import type { BrowserDriver, ElementSnapshot } from "../../src/locator/browser-driver.ts";

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), "..", "fixtures");

export function fixturePath(page: string, file: string): string {
  return join(fixturesDir, page, file);
}

export async function loadFixtureDriver(page: string): Promise<BrowserDriver> {
  const png = await readFile(fixturePath(page, "screenshot.png"));
  const { viewport, elements }: { viewport: { width: number; height: number }; elements: ElementSnapshot[] } =
    JSON.parse(await readFile(fixturePath(page, "elements.json"), "utf8"));
  // page.html is the rendered DOM with each snapshot element tagged data-jev-id.
  const { document } = parseHTML(await readFile(fixturePath(page, "page.html"), "utf8"));
  const byId = new Map(elements.map((e) => [e.id, e]));

  return {
    async screenshot() {
      return { png, width: viewport.width, height: viewport.height };
    },

    async interactiveElements() {
      return elements;
    },

    async query(selector) {
      const matches = [...document.querySelectorAll(selector)];
      return matches.flatMap((el) => byId.get(el.getAttribute("data-jev-id") ?? "") ?? []);
    },

    async elementAt(x, y) {
      const hit = elements.find(
        ({ bbox: b, obscured }) => !obscured && x >= b.x && x <= b.x + b.width && y >= b.y && y <= b.y + b.height,
      );
      return hit ?? null;
    },
  };
}
