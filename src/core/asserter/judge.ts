import type { BrowserAdapter } from "@/core/browser/index.js";
import type { JevClient } from "@/core/jev/index.js";
import { ask } from "./ask.js";
import { FAIL_THRESHOLD, PASS_THRESHOLD } from "./constants.js";
import type { JudgeResult } from "./types.js";

type ProbabilityState = "holds" | "notHold" | "uncertain";

function classifyProbability(probability: number): ProbabilityState {
  if (probability >= PASS_THRESHOLD) {
    return "holds";
  }

  if (probability <= FAIL_THRESHOLD) {
    return "notHold";
  }

  return "uncertain";
}

export async function judge(
  statement: string,
  adapter: Pick<BrowserAdapter, "screenshot">,
  jev: Pick<JevClient, "noul">,
): Promise<JudgeResult> {
  const first = await ask(statement, adapter, jev);
  if (!first.ok) {
    return { ok: false, reason: first.reason };
  }

  let probability = first.data.probability;
  let state = classifyProbability(probability);

  if (state === "holds") {
    return { ok: true, probability };
  }

  if (state === "notHold") {
    return { ok: false, reason: `Statement does not hold (noul=${probability})`, probability };
  }

  const second = await ask(statement, adapter, jev);
  if (!second.ok) {
    return { ok: false, reason: second.reason, probability };
  }

  probability = second.data.probability;
  state = classifyProbability(probability);

  if (state === "holds") {
    return { ok: true, probability };
  }

  if (state === "notHold") {
    return { ok: false, reason: `Statement does not hold (noul=${probability})`, probability };
  }

  return { ok: false, reason: `Statement is uncertain after 2 asks (noul=${probability})`, probability };
}
