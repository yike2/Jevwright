import { createJevClient } from "../../../core/jev/index.js";
import {
  domLocate,
  locate,
  LocateError,
  visualLocate,
} from "../../../core/locator/index.js";
import type { BoundingBox, JevClient } from "../../../core/locator/types.js";
import { createFixtureBrowserDriver, loadFixturePages } from "./fixture-driver.js";

type TargetEvalRow = {
  page: string;
  id: string;
  target: string;
  expectedElementId: number | null;
  selectorCorrect: boolean | null;
  visualElementId: number | null;
  visualConfidence?: number;
  visualCorrect: boolean;
  domElementId: number | null;
  domConfidence?: number;
  domCorrect: boolean;
  pipelineMethod: "visual" | "dom" | "error";
  pipelineElementId: number | null;
  pipelineCorrect: boolean;
};

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const limitIdx = args.indexOf("--limit");
  const limit = limitIdx >= 0 ? Number.parseInt(args[limitIdx + 1] ?? "0", 10) : Number.POSITIVE_INFINITY;
  const pageIdx = args.indexOf("--page");
  const pageFilter = pageIdx >= 0 ? args[pageIdx + 1] : undefined;

  const baseJev = createJevClient();
  const pages = loadFixturePages().filter((p) => !pageFilter || p.name === pageFilter);

  const rows: TargetEvalRow[] = [];
  let count = 0;

  for (const page of pages) {
    for (const item of page.targets) {
      if (count >= limit) {
        break;
      }
      count += 1;

      const driver = createFixtureBrowserDriver(page.name);

      // Cache bbox and choice for this target so we make at most 1 bbox + 1 choice API call per target
      let cachedBbox: Promise<{ box: BoundingBox | null; confidence: number }> | undefined;
      let cachedChoice: Promise<{ index: number | null; confidence: number }> | undefined;

      const memoJev: JevClient = {
        bbox(question: string, image: Buffer) {
          if (!cachedBbox) {
            cachedBbox = baseJev.bbox(question, image);
          }
          return cachedBbox;
        },
        choice(question: string, options: string[]) {
          if (!cachedChoice) {
            cachedChoice = baseJev.choice(question, options);
          }
          return cachedChoice;
        },
      };

      // 1. Selector check (if target has a selector)
      let selectorCorrect: boolean | null = null;
      if (item.selector) {
        try {
          const selRes = await locate(
            { action: item.action, selector: item.selector, target: item.target, timeoutMs: 2000 },
            driver,
            memoJev,
          );
          selectorCorrect = selRes.method === "selector" && item.elementId !== null;
        } catch {
          selectorCorrect = item.elementId === null;
        }
      }

      // 2. Visual Locate check
      const visOut = await visualLocate(item.target, item.action, driver, memoJev);
      const visualElementId = visOut.ok ? visOut.elementId : null;
      const visualCorrect = visualElementId === item.elementId;

      // 3. DOM Locate check
      const domOut = await domLocate(item.target, item.action, page.snapshot, memoJev);
      const domElementId = domOut.ok ? domOut.elementId : null;
      const domCorrect = domElementId === item.elementId;

      // 4. Full Locator pipeline (target only: Visual -> DOM)
      let pipelineMethod: "visual" | "dom" | "error" = "error";
      let pipelineElementId: number | null = null;
      try {
        const pipeRes = await locate(
          { action: item.action, target: item.target, timeoutMs: 5000 },
          driver,
          memoJev,
        );
        pipelineMethod = pipeRes.method === "visual" ? "visual" : "dom";
        pipelineElementId = pipeRes.elementId ?? null;
      } catch (err) {
        if (!(err instanceof LocateError)) {
          throw err;
        }
        pipelineMethod = "error";
        pipelineElementId = null;
      }
      const pipelineCorrect = pipelineElementId === item.elementId;

      rows.push({
        page: page.name,
        id: item.id,
        target: item.target,
        expectedElementId: item.elementId,
        selectorCorrect,
        visualElementId,
        visualConfidence: visOut.confidence,
        visualCorrect,
        domElementId,
        domConfidence: domOut.confidence,
        domCorrect,
        pipelineMethod,
        pipelineElementId,
        pipelineCorrect,
      });

      const expStr = item.elementId === null ? "none (LocateError)" : `#${item.elementId}`;
      const visStr = visualElementId === null ? "none" : `#${visualElementId}`;
      const domStr = domElementId === null ? "none" : `#${domElementId}`;
      const pipeStr = pipelineElementId === null ? "LocateError" : `#${pipelineElementId} (${pipelineMethod})`;
      console.log(
        `[${page.name}/${item.id}] expected=${expStr} | visual=${visStr} (${visualCorrect ? "OK" : "MISS"}) | dom=${domStr} (${domCorrect ? "OK" : "MISS"}) | locate=${pipeStr} (${pipelineCorrect ? "OK" : "MISS"})`,
      );
    }
  }

  const total = rows.length;
  const positiveRows = rows.filter((r) => r.expectedElementId !== null);
  const negativeRows = rows.filter((r) => r.expectedElementId === null);
  const selectorRows = rows.filter((r) => r.selectorCorrect !== null);

  const selectorHits = selectorRows.filter((r) => r.selectorCorrect).length;
  const visualHitsAll = rows.filter((r) => r.visualCorrect).length;
  const visualHitsPos = positiveRows.filter((r) => r.visualCorrect).length;
  const domHitsAll = rows.filter((r) => r.domCorrect).length;
  const domHitsPos = positiveRows.filter((r) => r.domCorrect).length;
  const pipelineHitsAll = rows.filter((r) => r.pipelineCorrect).length;
  const pipelineHitsPos = positiveRows.filter((r) => r.pipelineCorrect).length;
  const pipelineViaVisual = positiveRows.filter((r) => r.pipelineCorrect && r.pipelineMethod === "visual").length;
  const pipelineViaDom = positiveRows.filter((r) => r.pipelineCorrect && r.pipelineMethod === "dom").length;
  const negativeCorrect = negativeRows.filter((r) => r.pipelineCorrect).length;

  console.log("\n=== Real-Jev Locator Evaluation Summary ===");
  console.log(`Model: typesafe/jev-1.14 (OpenRouter Decisions API)`);
  console.log(`Total fixture targets evaluated: ${total} (${positiveRows.length} locatable elements, ${negativeRows.length} non-usable/absent targets)`);
  console.log("");
  console.log("Accuracy per method:");
  console.log(`  - Selector stage:              ${selectorHits}/${selectorRows.length} (${((selectorHits / Math.max(1, selectorRows.length)) * 100).toFixed(1)}%)`);
  console.log(`  - Visual Locate (standalone):  ${visualHitsAll}/${total} overall (${visualHitsPos}/${positiveRows.length} locatable, ${rows.filter((r) => r.expectedElementId === null && r.visualCorrect).length}/${negativeRows.length} negative)`);
  console.log(`  - DOM Locate (standalone):     ${domHitsAll}/${total} overall (${domHitsPos}/${positiveRows.length} locatable, ${rows.filter((r) => r.expectedElementId === null && r.domCorrect).length}/${negativeRows.length} negative)`);
  console.log(`  - Combined locate() pipeline:  ${pipelineHitsAll}/${total} overall (${((pipelineHitsAll / Math.max(1, total)) * 100).toFixed(1)}%)`);
  console.log(`      • Locatable targets found: ${pipelineHitsPos}/${positiveRows.length} (${pipelineViaVisual} via visual, ${pipelineViaDom} via dom fallback)`);
  console.log(`      • Negative targets rejected with LocateError: ${negativeCorrect}/${negativeRows.length}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
