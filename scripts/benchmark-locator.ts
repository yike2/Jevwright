import { JevHarness } from "../src/core/jev/index.js";
import { domLocate } from "../src/core/locator/dom.js";
import { locate, LocateError } from "../src/core/locator/index.js";
import { visualLocate } from "../src/core/locator/visual.js";
import { loadPageFixtures } from "../src/tests/integration/locator/fixture-driver.js";

type TargetEvalRow = {
  page: string;
  id: string;
  target: string;
  present: boolean;
  expectedElementId: number | null;
  selectorCorrect: boolean;
  visualElementId: number | null;
  visualConfidence?: number;
  visualCorrect: boolean;
  domElementId: number | null;
  domConfidence?: number;
  domCorrect: boolean;
  locateMethod: "selector" | "visual" | "dom" | "error";
  locateElementId: number | null;
  locateCorrect: boolean;
};

async function main() {
  if (!process.env.OPENROUTER_API_KEY) {
    console.error("Missing OPENROUTER_API_KEY in environment (.env)");
    process.exit(1);
  }

  const jev = new JevHarness();
  const fixtures = await loadPageFixtures();
  const rows: TargetEvalRow[] = [];

  console.log("Running Element Locator benchmark with real Jev (typesafe/jev-1.14)...\n");

  for (const fx of fixtures) {
    for (const item of fx.groundTruth.targets) {
      // 1. Check selector stage (if selector exists)
      let selectorCorrect = false;
      if (item.selector) {
        try {
          const selRes = await locate(
            {
              action: item.action,
              selector: item.selector,
              timeoutMs: 2000,
            },
            fx.driver,
            jev,
          );
          selectorCorrect = item.present && selRes.method === "selector";
        } catch {
          selectorCorrect = !item.present;
        }
      } else {
        selectorCorrect = !item.present;
      }

      // 2. Run Visual Locate directly with real Jev
      const visOut = await visualLocate(
        item.target,
        item.action,
        fx.driver,
        () => fx.driver.snapshot(),
        jev,
      );
      const visualElementId = visOut.attempt.ok ? (visOut.elementId ?? null) : null;
      const visualCorrect = item.present
        ? visOut.attempt.ok && visualElementId === item.elementId
        : !visOut.attempt.ok;

      // 3. Run DOM Locate directly with real Jev
      const domOut = await domLocate(
        item.target,
        item.action,
        () => fx.driver.snapshot(),
        jev,
      );
      const domElementId = domOut.attempt.ok ? (domOut.elementId ?? null) : null;
      const domCorrect = item.present
        ? domOut.attempt.ok && domElementId === item.elementId
        : !domOut.attempt.ok;

      // 4. Run locate() (target-only AI pipeline: visual -> dom) using the real Jev responses
      let locateMethod: TargetEvalRow["locateMethod"] = "error";
      let locateElementId: number | null = null;
      let locateCorrect = false;

      if (visOut.attempt.ok && visOut.elementId !== undefined) {
        locateMethod = "visual";
        locateElementId = visOut.elementId;
        locateCorrect = item.present && locateElementId === item.elementId;
      } else if (domOut.attempt.ok && domOut.elementId !== undefined) {
        locateMethod = "dom";
        locateElementId = domOut.elementId;
        locateCorrect = item.present && locateElementId === item.elementId;
      } else {
        locateMethod = "error";
        locateElementId = null;
        locateCorrect = !item.present;
      }

      const statusIcon = locateCorrect ? "PASS" : "FAIL";
      console.log(
        `[${statusIcon}] ${fx.page}/${item.id} (${item.present ? `expected=#${item.elementId}` : "expected=absent"}) -> ` +
          `locate=${locateMethod}${locateElementId !== null ? `(#${locateElementId})` : ""} | ` +
          `visual=${visOut.attempt.ok ? `#${visualElementId}` : `fail(${visOut.attempt.reason})`} (conf=${visOut.attempt.confidence?.toFixed(2) ?? "n/a"}) | ` +
          `dom=${domOut.attempt.ok ? `#${domElementId}` : `fail(${domOut.attempt.reason})`} (conf=${domOut.attempt.confidence?.toFixed(2) ?? "n/a"})`,
      );

      rows.push({
        page: fx.page,
        id: item.id,
        target: item.target,
        present: item.present,
        expectedElementId: item.elementId,
        selectorCorrect,
        visualElementId,
        visualConfidence: visOut.attempt.confidence,
        visualCorrect: item.present
          ? visOut.attempt.ok && visualElementId === item.elementId
          : !visOut.attempt.ok,
        domElementId,
        domConfidence: domOut.attempt.confidence,
        domCorrect,
        locateMethod,
        locateElementId,
        locateCorrect,
      });
    }
  }

  const total = rows.length;
  const presentRows = rows.filter((r) => r.present);
  const absentRows = rows.filter((r) => !r.present);

  const selectorHits = presentRows.filter((r) => r.selectorCorrect).length;
  const visualHitsPresent = presentRows.filter((r) => r.visualCorrect).length;
  const domHitsPresent = presentRows.filter((r) => r.domCorrect).length;
  const locateHitsPresent = presentRows.filter((r) => r.locateCorrect).length;

  const locateSolvedByVisual = presentRows.filter(
    (r) => r.locateCorrect && r.locateMethod === "visual",
  ).length;
  const locateSolvedByDom = presentRows.filter(
    (r) => r.locateCorrect && r.locateMethod === "dom",
  ).length;

  const visualHitsAll = rows.filter((r) => r.visualCorrect).length;
  const domHitsAll = rows.filter((r) => r.domCorrect).length;
  const locateHitsAll = rows.filter((r) => r.locateCorrect).length;

  console.log("\n=== Summary (Present Targets: " + presentRows.length + ") ===");
  console.log(`  selector                 : ${selectorHits}/${presentRows.length}`);
  console.log(`  visual (standalone)      : ${visualHitsPresent}/${presentRows.length}`);
  console.log(`  dom (standalone)         : ${domHitsPresent}/${presentRows.length}`);
  console.log(
    `  locate (visual -> dom)   : ${locateHitsPresent}/${presentRows.length} ` +
      `(visual=${locateSolvedByVisual}, dom fallback=${locateSolvedByDom})`,
  );

  console.log("\n=== Summary (All Targets including Absent: " + total + ") ===");
  console.log(`  visual                   : ${visualHitsAll}/${total}`);
  console.log(`  dom                      : ${domHitsAll}/${total}`);
  console.log(`  locate (overall)         : ${locateHitsAll}/${total} (absent rejected=${absentRows.filter((r) => r.locateCorrect).length}/${absentRows.length})`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
