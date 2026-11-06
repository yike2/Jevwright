import type { ReadResult, BoundingBox } from "@/core/browser/types.js";
import type { JevDecisionRequest } from "./types.js";
import { postDecisions } from "./fetch.js";

const TARGET_QUESTION_NAME = "target";
const PRESENCE_QUESTION_NAME = "presence";

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
        choice: async (question: string, options: string[], signal?: AbortSignal) => {
            if (options.length === 0) {
                return { ok: false, reason: "Invalid Jev response: choice options must not be empty" };
            }

            const requestBody: JevDecisionRequest = {
                model: "typesafe/jev-1.14",
                state: [
                    `Candidate elements:${options
                        .map((option, index) => `\n${index}: ${option}`)
                        .join("")}`,
                ],
                questions: {
                    [TARGET_QUESTION_NAME]: {
                        type: "choice",
                        instructions: question,
                        criteria: Object.fromEntries(options.map((option, index) => [String(index), option])),
                    },
                    [PRESENCE_QUESTION_NAME]: {
                        type: "noul",
                        instructions: `Does any of the candidate elements match this description: ${question}`,
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

            const targetAnswer = getAnswer(response.data, TARGET_QUESTION_NAME);
            if (!targetAnswer.ok) {
                return targetAnswer;
            }

            const validatedChoice = validateChoiceResponse(targetAnswer.data, options.length);
            if (!validatedChoice.ok) {
                return validatedChoice;
            }

            const presenceAnswer = getAnswer(response.data, PRESENCE_QUESTION_NAME);
            if (!presenceAnswer.ok) {
                return presenceAnswer;
            }

            const presenceProbability = validateNoulProbability(presenceAnswer.data);
            if (!presenceProbability.ok) {
                return presenceProbability;
            }

            if (presenceProbability.data.probability < 0.5) {
                return { ok: true, data: { index: null, confidence: validatedChoice.data.confidence } };
            }

            return {
                ok: true,
                data: {
                    index: Number(validatedChoice.data.choice),
                    confidence: validatedChoice.data.confidence,
                },
            };
        },
        noul: async (question: string, context: { image: Buffer } | { text: string }, signal?: AbortSignal) => {
            const requestBody: JevDecisionRequest = {
                model: "typesafe/jev-1.14",
                state: "text" in context ? [context.text] : [{ type: "image_url", image_url: { url: `data:image/png;base64,${context.image.toString("base64")}` } }],
                questions: {
                    [TARGET_QUESTION_NAME]: {
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

            const answer = getAnswer(response.data, TARGET_QUESTION_NAME);
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

function validateNoulProbability(data: unknown): ReadResult<{ probability: number }> {
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

function validateNoulResponse(data: unknown): ReadResult<{ probability: number }> {
    return validateNoulProbability(data);
}

function validateChoiceResponse(data: unknown, optionCount: number): ReadResult<{ choice: string; confidence: number }> {
    if (typeof data !== "object" || data === null || !("choice" in data) || !("confidence" in data)) {
        return { ok: false, reason: "Invalid Jev response: missing choice answer" };
    }

    const choice = (data as { choice?: unknown }).choice;
    if (typeof choice !== "string" || !/^\d+$/.test(choice)) {
        return { ok: false, reason: "Invalid Jev response: choice key is not a valid index" };
    }

    const index = Number(choice);
    if (!Number.isInteger(index) || index < 0 || index >= optionCount) {
        return { ok: false, reason: "Invalid Jev response: choice index out of range" };
    }

    const confidence = (data as { confidence?: unknown }).confidence;
    if (typeof confidence !== "number" || Number.isNaN(confidence)) {
        return { ok: false, reason: "Invalid Jev response: confidence is not a number" };
    }

    if (confidence < 0 || confidence > 1) {
        return { ok: false, reason: "Invalid Jev response: confidence must be between 0 and 1" };
    }

    return { ok: true, data: { choice, confidence } };
}
