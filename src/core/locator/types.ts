import type { BrowserAdapter, ElementRef, PageSnapshot } from "@/core/browser/index.js";
import type { JevClient } from "@/core/jev/index.js";

export type LocateRequest = {
    action: "click" | "doubleClick" | "rightClick" | "hover" | "input";
    selector?: string;
    target?: string;
    timeoutMs: number;
    signal?: AbortSignal;
};

export type LocateMethod = "selector" | "visual" | "dom";

export type LocateAttempt = {
    method: LocateMethod;
    ok: boolean;
    durationMs: number;
    confidence?: number;
    reason?: string;
};

export type StageResult = {
    attempt: LocateAttempt;
    element?: ElementRef;
    snapshot?: PageSnapshot;
};

export type LocateResult = {
    method: LocateMethod;
    element: ElementRef;
    confidence?: number;
    durationMs: number;
    attempts: LocateAttempt[];
};

export class LocateError extends Error {
    attempts: LocateAttempt[];

    constructor(message: string, attempts: LocateAttempt[]) {
        super(message);
        this.name = "LocateError";
        this.attempts = attempts;
    }
}

export type LocateContext = {
    adapter: BrowserAdapter;
    jev: JevClient;
};
