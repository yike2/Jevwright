import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { BrowserDriver, PageSnapshot } from "../../../core/locator/types.js";
import type { GroundTruthTarget } from "./generate-fixtures.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const FIXTURES_ROOT = path.join(__dirname, "fixtures");

export type FixturePageData = {
  name: string;
  screenshot: Buffer;
  snapshot: PageSnapshot;
  targets: GroundTruthTarget[];
};

export function loadFixturePage(pageName: string): FixturePageData {
  const dir = path.join(FIXTURES_ROOT, pageName);
  const screenshot = fs.readFileSync(path.join(dir, "screenshot.png"));
  const snapshot = JSON.parse(
    fs.readFileSync(path.join(dir, "snapshot.json"), "utf8"),
  ) as PageSnapshot;
  const targets = JSON.parse(
    fs.readFileSync(path.join(dir, "targets.json"), "utf8"),
  ) as GroundTruthTarget[];

  return { name: pageName, screenshot, snapshot, targets };
}

export function loadFixturePages(): FixturePageData[] {
  const names = fs
    .readdirSync(FIXTURES_ROOT, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();
  return names.map((name) => loadFixturePage(name));
}

export type FixtureBrowserDriver = BrowserDriver & {
  calls: {
    isVisible: number;
    screenshot: number;
    snapshot: number;
  };
};

/** Creates a BrowserDriver stand-in that serves fixture files from disk without a real browser. */
export function createFixtureBrowserDriver(pageName: string): FixtureBrowserDriver {
  const data = loadFixturePage(pageName);
  const validSelectors = new Set(
    data.targets.filter((t) => t.present && t.elementId !== null && t.selector).map((t) => t.selector!),
  );

  const calls = {
    isVisible: 0,
    screenshot: 0,
    snapshot: 0,
  };

  return {
    calls,
    async isVisible(selector: string, _timeoutMs: number): Promise<boolean> {
      calls.isVisible += 1;
      return validSelectors.has(selector);
    },
    async screenshot(): Promise<Buffer> {
      calls.screenshot += 1;
      return data.screenshot;
    },
    async snapshot(): Promise<PageSnapshot> {
      calls.snapshot += 1;
      return data.snapshot;
    },
  };
}
