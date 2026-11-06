import type { ReadResult, BoundingBox } from "@/core/browser/types.js";
import type { JevDecisionRequest } from "./types.js";
import { postDecisions } from "./fetch.js";

export type JevClient = {
    bbox: (
        question: string,
        image: Buffer,
        viewport: { width: number; height: number },
        signal?: AbortSignal,
    ) => Promise<ReadResult<{ box: BoundingBox | null; confidence: number }>>;
    choice: (
        question: string,
        options: string[],
        signal?: AbortSignal,
    ) => Promise<ReadResult<{ index: number | null; confidence: number }>>;
    noul: (
        question: string,
        context: { image: Buffer } | { text: string },
        signal?: AbortSignal,
    ) => Promise<ReadResult<{ probability: number }>>;
};

export function createJevClient(deps: { apiKey: string; fetch: typeof fetch }): JevClient {
    return {
        bbox: async () => {
            throw new Error("not implemented");
        },
        choice: async () => {
            throw new Error("not implemented");
        },
        noul: async (question: string, context: { image: Buffer } | { text: string }, signal?: AbortSignal) => {
            const requestBody: JevDecisionRequest = {
                model: "typesafe/jev-1.14",
                state: "text" in context ? [context.text] : [{ type: "image_url", image_url: { url: `data:image/png;base64,${context.image.toString("base64")}` } }],
                questions: {
                    target: {
                        type: "noul",
                        instructions: question,
                    },
                },
            };

            const response = await postDecisions<unknown>(
                requestBody,
                deps.apiKey,
                deps.fetch as unknown as Parameters<typeof postDecisions>[2],
                signal,
            );

            if (!response.ok) {
                return response;
            }

            const answer = getAnswer(response.data, "target");
            if (!answer.ok) {
                return answer;
            }

            return validateNoulResponse(answer.data);
        },
    };
}

function getAnswer(data: unknown, name: string): ReadResult<unknown> {
    if (typeof data !== "object" || data === null) {
        return { ok: false, reason: `Invalid Jev response: missing answer for ${name}` };
    }

    const answers = (data as { answers?: Record<string, unknown> }).answers;
    if (typeof answers !== "object" || answers === null || !(name in answers)) {
        return { ok: false, reason: `Invalid Jev response: missing answer for ${name}` };
    }

    return { ok: true, data: answers[name] };
}

function validateNoulResponse(data: unknown): ReadResult<{ probability: number }> {
    if (typeof data !== "object" || data === null || !("noul" in data)) {
        return { ok: false, reason: "Invalid Jev response: missing noul answer" };
    }

    const probability = (data as { noul?: unknown }).noul;

    if (typeof probability !== "number" || Number.isNaN(probability)) {
        return { ok: false, reason: "Invalid Jev response: noul probability is not a number" };
    }

    if (probability < 0 || probability > 1) {
        return { ok: false, reason: "Invalid Jev response: noul probability must be between 0 and 1" };
    }

    return { ok: true, data: { probability } };
}
