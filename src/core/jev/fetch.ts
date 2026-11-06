import type { ReadResult } from "@/core/browser/types.js";
import type { JevDecisionRequest, JevFetchOptions } from "./types.js";

export type { JevDecisionRequest, JevFetchOptions } from "./types.js";

export type FetchImplementation = (url: string, init: RequestInit) => Promise<{
    ok: boolean;
    status: number;
    headers?: { get(name: string): string | null };
    text: () => Promise<string>;
}>;

const DECISIONS_URL = "https://openrouter.ai/api/alpha/decisions";
const DEFAULT_TIMEOUT_MS = 5000;
const MAX_RETRY_DELAY_MS = 2000;
const BACKOFF_MS = [500, 1000];

export async function postDecisions<T = unknown>(
    requestBody: JevDecisionRequest,
    apiKey: string,
    fetchImpl: FetchImplementation,
    signal?: AbortSignal,
    options: JevFetchOptions = {},
): Promise<ReadResult<T>> {
    if (signal?.aborted) {
        return { ok: false, reason: "Request aborted" };
    }

    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const maxRetries = options.maxRetries ?? 2;
    const delay = options.delay ?? defaultDelay;

    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
        if (signal?.aborted) {
            return { ok: false, reason: "Request aborted" };
        }

        const requestController = new AbortController();
        let timedOut = false;
        const onAbort = () => requestController.abort();
        const onTimeout = () => {
            timedOut = true;
            requestController.abort();
        };

        signal?.addEventListener("abort", onAbort, { once: true });
        const timeoutId = setTimeout(onTimeout, timeoutMs);

        let outcome:
            | { kind: "success"; data: T }
            | { kind: "retry"; delayMs: number }
            | { kind: "final"; reason: string };

        try {
            const response = await fetchImpl(DECISIONS_URL, {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${apiKey}`,
                    "Content-Type": "application/json",
                    Accept: "application/json",
                },
                body: JSON.stringify(requestBody),
                signal: requestController.signal,
            });

            const text = await response.text();

            try {
                const parsed = JSON.parse(text) as T;

                if (response.ok) {
                    outcome = { kind: "success", data: parsed };
                } else if (isRetryableStatus(response.status) && attempt < maxRetries) {
                    outcome = { kind: "retry", delayMs: getRetryDelay(response.headers?.get("Retry-After"), attempt) };

                } else {
                    outcome = { kind: "final", reason: `HTTP ${response.status}` };
                }
            } catch {
                if (response.ok) {
                    if (attempt >= maxRetries) {
                        outcome = { kind: "final", reason: "Unparseable JSON body" };
                    } else {
                        outcome = { kind: "retry", delayMs: getRetryDelay(null, attempt) };
                    }
                } else if (isRetryableStatus(response.status) && attempt < maxRetries) {
                    outcome = { kind: "retry", delayMs: getRetryDelay(response.headers?.get("Retry-After"), attempt) };
                } else {
                    outcome = { kind: "final", reason: `HTTP ${response.status}` };
                }
            }
        } catch (error) {
            if (signal?.aborted) {
                outcome = { kind: "final", reason: "Request aborted" };
            } else if (timedOut) {
                if (attempt >= maxRetries) {
                    outcome = { kind: "final", reason: `Request timed out after ${timeoutMs}ms` };
                } else {
                    outcome = { kind: "retry", delayMs: getRetryDelay(null, attempt) };
                }
            } else if (error instanceof TypeError) {
                if (attempt >= maxRetries) {
                    outcome = { kind: "final", reason: formatError(error) };
                } else {
                    outcome = { kind: "retry", delayMs: getRetryDelay(null, attempt) };
                }
            } else if (error instanceof Error && error.name === "AbortError") {
                outcome = { kind: "final", reason: "Request aborted" };
            } else {
                outcome = { kind: "final", reason: formatError(error) };
            }
        } finally {
            signal?.removeEventListener("abort", onAbort);
            clearTimeout(timeoutId);
        }

        if (outcome.kind === "success") {
            return { ok: true, data: outcome.data };
        }

        if (outcome.kind === "final") {
            return { ok: false, reason: outcome.reason };
        }

        if (signal?.aborted) {
            return { ok: false, reason: "Request aborted" };
        }

        try {
            await delay(outcome.delayMs, signal);
        } catch {
            return { ok: false, reason: "Request aborted" };
        }
    }

    return { ok: false, reason: "Request failed" };
}

function isRetryableStatus(status: number): boolean {
    return status === 429 || status >= 500;
}

function formatError(error: unknown): string {
    if (error instanceof Error) {
        return error.message || "Request failed";
    }

    return "Request failed";
}

function getRetryDelay(retryAfterHeader: string | null | undefined, attempt: number): number {
    const retryAfter = parseRetryAfter(retryAfterHeader);
    if (retryAfter !== null) {
        return Math.min(retryAfter, MAX_RETRY_DELAY_MS);
    }

    return BACKOFF_MS[Math.min(attempt, BACKOFF_MS.length - 1)] ?? BACKOFF_MS[BACKOFF_MS.length - 1];
}

function parseRetryAfter(value: string | null | undefined): number | null {
    if (value === null || value === undefined || value.trim() === "") {
        return null;
    }

    const seconds = Number.parseFloat(value);
    if (!Number.isNaN(seconds)) {
        return Math.max(0, seconds * 1000);
    }

    const dateMs = Date.parse(value);
    if (!Number.isNaN(dateMs)) {
        return Math.max(0, dateMs - Date.now());
    }

    return null;
}

function defaultDelay(ms: number, signal?: AbortSignal): Promise<void> {
    return new Promise<void>((resolve, reject) => {
        if (signal?.aborted) {
            reject(new DOMException("Request aborted", "AbortError"));
            return;
        }

        const timeoutId = setTimeout(() => {
            signal?.removeEventListener("abort", onAbort);
            resolve();
        }, ms);

        const onAbort = () => {
            clearTimeout(timeoutId);
            reject(new DOMException("Request aborted", "AbortError"));
        };

        signal?.addEventListener("abort", onAbort, { once: true });
    });
}
