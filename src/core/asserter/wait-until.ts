/** Poll a condition until it holds or the timeout expires. */
import type { BrowserAdapter } from "@/core/browser/index.js";
import type { JevClient } from "@/core/jev/index.js";
import { ask } from "./ask.js";
import { PASS_THRESHOLD, POLL_INTERVAL_MS } from "./constants.js";
import type { JudgeResult } from "./types.js";

export async function waitUntil(
    condition: string,
    timeoutMs: number,
    adapter: Pick<BrowserAdapter, "screenshot">,
    jev: Pick<JevClient, "noul">,
): Promise<JudgeResult> {
    const deadline = Date.now() + timeoutMs;
    let lastProbability: number | undefined;

    while (true) {
        const answer = await ask(condition, adapter, jev);
        if (!answer.ok) {
            if (lastProbability === undefined) {
                return { ok: false, reason: answer.reason };
            }

            return { ok: false, reason: answer.reason, probability: lastProbability };
        }

        const probability = answer.data.probability;
        lastProbability = probability;

        if (probability >= PASS_THRESHOLD) {
            return { ok: true, probability };
        }

        if (Date.now() >= deadline) {
            return {
                ok: false,
                reason: `Condition did not hold within ${timeoutMs}ms (last noul=${probability})`,
                probability,
            };
        }

        await new Promise<void>((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    }
}
