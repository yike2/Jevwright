import { describe, expect, it } from "vitest";
import type { ElementSnapshot } from "../src/locator/browser-driver.ts";
import type { LocateMethod, LocateResult } from "../src/locator/element-locator.ts";
import { summarize } from "../scripts/locator-eval.ts";

function hit(method: LocateMethod, id: string): LocateResult {
  return { found: true, method, element: { id } as ElementSnapshot, confidence: 0.9, attempts: [] };
}
const miss: LocateResult = { found: false, attempts: [] };

describe("locator eval summary", () => {
  it("counts correct, wrong and not-found results per mode", () => {
    const summary = summarize([
      { mode: "visual", expected: "e1", result: hit("visual", "e1") },
      { mode: "visual", expected: "e2", result: hit("visual", "e3") },
      { mode: "visual", expected: "e4", result: miss },
      { mode: "dom", expected: "e1", result: hit("dom", "e1") },
    ]);

    expect(summary.visual).toMatchObject({ total: 3, correct: 1, wrong: 1, notFound: 1 });
    expect(summary.dom).toMatchObject({ total: 1, correct: 1, wrong: 0, notFound: 0 });
  });

  it("credits each found result to the method that found it", () => {
    const summary = summarize([
      { mode: "chain", expected: "e1", result: hit("selector", "e1") },
      { mode: "chain", expected: "e2", result: hit("visual", "e2") },
      { mode: "chain", expected: "e3", result: hit("dom", "e3") },
      { mode: "chain", expected: "e4", result: hit("dom", "e5") },
    ]);

    expect(summary.chain.byMethod).toEqual({
      selector: { found: 1, correct: 1 },
      visual: { found: 1, correct: 1 },
      dom: { found: 2, correct: 1 },
    });
  });
});
