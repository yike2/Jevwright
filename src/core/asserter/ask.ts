import type { BrowserAdapter, ReadResult } from "@/core/browser/index.js";
import type { JevClient } from "@/core/jev/index.js";
import { QUESTION_PREFIX } from "./constants.js";

export async function ask(
    statement: string,
    adapter: Pick<BrowserAdapter, "screenshot">,
    jev: Pick<JevClient, "noul">,
): Promise<ReadResult<{ probability: number }>> {
    const screenshot = await adapter.screenshot();
    if (!screenshot.ok) {
        return screenshot;
    }

    const answer = await jev.noul(`${QUESTION_PREFIX}${statement}`, { image: screenshot.data });
    if (!answer.ok) {
        return answer;
    }

    return { ok: true, data: { probability: answer.data.probability } };
}
