// Scoring for scripts/eval-locator.ts: how many fixture targets each mode
// resolved to the ground-truth element.
import type { LocateMethod, LocateResult } from "../src/locator/element-locator.ts";

export interface EvalRun {
  /** "selector", "visual", "dom" (one method alone) or "chain" (all, in order). */
  mode: string;
  /** Ground-truth element id. */
  expected: string;
  result: LocateResult;
}

export interface ModeSummary {
  total: number;
  correct: number;
  wrong: number;
  notFound: number;
  /** Found results, split by the method that found them. */
  byMethod: Record<LocateMethod, { found: number; correct: number }>;
}

export function summarize(runs: EvalRun[]): Record<string, ModeSummary> {
  const summary: Record<string, ModeSummary> = {};
  for (const { mode, expected, result } of runs) {
    const s = (summary[mode] ??= {
      total: 0,
      correct: 0,
      wrong: 0,
      notFound: 0,
      byMethod: { selector: { found: 0, correct: 0 }, visual: { found: 0, correct: 0 }, dom: { found: 0, correct: 0 } },
    });
    s.total++;
    if (!result.found) {
      s.notFound++;
      continue;
    }
    const ok = result.element.id === expected;
    if (ok) s.correct++;
    else s.wrong++;
    s.byMethod[result.method].found++;
    if (ok) s.byMethod[result.method].correct++;
  }
  return summary;
}
