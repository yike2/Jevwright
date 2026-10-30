import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { BrowserDriver, PageSnapshot } from "../../../core/locator/types.js";
import type { GroundTruthFile } from "../../../../scripts/generate-fixtures.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.resolve(__dirname, "../hw3/fixtures");

export class FixtureBrowserDriver implements BrowserDriver {
  private readonly screenshotBuf: Buffer;
  private readonly pageSnapshot: PageSnapshot;
  private readonly validSelectors: Set<string>;

  constructor(screenshotBuf: Buffer, pageSnapshot: PageSnapshot, validSelectors: Iterable<string>) {
    this.screenshotBuf = screenshotBuf;
    this.pageSnapshot = pageSnapshot;
    this.validSelectors = new Set(validSelectors);
  }

  async isVisible(selector: string, _timeoutMs: number): Promise<boolean> {
    return this.validSelectors.has(selector);
  }

  async screenshot(): Promise<Buffer> {
    return this.screenshotBuf;
  }

  async snapshot(): Promise<PageSnapshot> {
    return this.pageSnapshot;
  }
}

export type LoadedPageFixture = {
  page: string;
  screenshot: Buffer;
  snapshot: PageSnapshot;
  groundTruth: GroundTruthFile;
  driver: FixtureBrowserDriver;
};

export async function loadPageFixtures(): Promise<LoadedPageFixture[]> {
  const entries = await fs.readdir(FIXTURES_DIR, { withFileTypes: true });
  const pageNames = entries
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();

  const results: LoadedPageFixture[] = [];
  for (const page of pageNames) {
    const dir = path.join(FIXTURES_DIR, page);
    const [screenshot, snapshotText, groundTruthText] = await Promise.all([
      fs.readFile(path.join(dir, "screenshot.png")),
      fs.readFile(path.join(dir, "snapshot.json"), "utf8"),
      fs.readFile(path.join(dir, "ground-truth.json"), "utf8"),
    ]);

    const snapshot = JSON.parse(snapshotText) as PageSnapshot;
    const groundTruth = JSON.parse(groundTruthText) as GroundTruthFile;
    const validSelectors = groundTruth.targets
      .filter((t) => t.present && t.selector)
      .map((t) => t.selector!);

    const driver = new FixtureBrowserDriver(screenshot, snapshot, validSelectors);
    results.push({ page, screenshot, snapshot, groundTruth, driver });
  }

  return results;
}
