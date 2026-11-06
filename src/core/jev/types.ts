import type { ReadResult } from "@/core/browser/types.js";

export type JevStateImage = {
    type: "image_url";
    image_url: { url: string };
};

export type JevStateEntry = string | JevStateImage;

export type JevQuestion =
    | { type: "box"; instructions: string }
    | { type: "choice"; instructions: string; criteria: Record<string, string> }
    | { type: "noul"; instructions: string };

export type JevDecisionRequest = {
    model: "typesafe/jev-1.14";
    state: JevStateEntry[];
    questions: Record<string, JevQuestion>;
};

export type JevFetchOptions = {
    delay?: (ms: number, signal?: AbortSignal) => Promise<void>;
    timeoutMs?: number;
    maxRetries?: number;
};

export type JevFetchResult<T = unknown> = ReadResult<T>;
