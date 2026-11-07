import type { BrowserAdapter, PageSnapshot, SnapshotElement } from "@/core/browser/index.js";
import type { JevClient } from "@/core/jev/index.js";
import { CONFIDENCE_THRESHOLD, MAX_DOM_CANDIDATES, MAX_TEXT_LENGTH } from "./constants.js";
import type { LocateRequest, StageResult } from "./types.js";

const truncateText = (value: string): string => value.slice(0, MAX_TEXT_LENGTH);

const escapeText = (value: string): string => truncateText(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"');

export function filterUsable(
    elements: SnapshotElement[],
    action: "click" | "doubleClick" | "rightClick" | "hover" | "input",
): SnapshotElement[] {
    return elements.filter((element) => {
        if (!element.hittable) return false;
        if (element.attrs.disabled === true) return false;
        if (action === "input") {
            return element.role === "textbox" || element.role === "searchbox";
        }
        return true;
    });
}

export function selectCandidates(
    elements: SnapshotElement[],
    action: "click" | "doubleClick" | "rightClick" | "hover" | "input",
): SnapshotElement[] {
    return filterUsable(elements, action).slice(0, MAX_DOM_CANDIDATES);
}

export function describeCandidate(element: SnapshotElement): string {
    const pieces: string[] = [`${element.role} "${escapeText(element.name ?? "")}"`];

    if (element.text !== undefined && element.text !== null && element.text !== "" && element.text !== element.name) {
        pieces.push(`text="${escapeText(element.text)}"`);
    }

    const attrs = element.attrs ?? {};

    if (typeof attrs.type === "string" && attrs.type !== "") {
        pieces.push(`type=${attrs.type}`);
    }

    if (typeof attrs.placeholder === "string" && attrs.placeholder !== "") {
        pieces.push(`placeholder="${escapeText(attrs.placeholder)}"`);
    }

    if (attrs.checked !== undefined && attrs.checked !== null) {
        pieces.push(`checked=${String(attrs.checked)}`);
    }

    if (typeof attrs["aria-checked"] === "string" && attrs["aria-checked"] !== "") {
        pieces.push(`aria-checked=${String(attrs["aria-checked"]).toLowerCase()}`);
    }

    return pieces.join(" ");
}

export async function runDom(
    request: LocateRequest,
    adapter: Pick<BrowserAdapter, "snapshot">,
    jev: Pick<JevClient, "choice">,
    existingSnapshot?: PageSnapshot,
): Promise<StageResult> {
    if (request.target === undefined) {
        throw new Error("DOM locate requires request.target");
    }

    const startedAt = Date.now();

    let snapshot: PageSnapshot;
    if (existingSnapshot !== undefined) {
        snapshot = existingSnapshot;
    } else {
        const snapshotResult = await adapter.snapshot();
        if (!snapshotResult.ok) {
            return {
                attempt: {
                    method: "dom",
                    ok: false,
                    durationMs: Date.now() - startedAt,
                    reason: snapshotResult.reason,
                },
            };
        }
        snapshot = snapshotResult.data;
    }

    const candidates = selectCandidates(snapshot.elements, request.action);
    if (candidates.length === 0) {
        return {
            attempt: {
                method: "dom",
                ok: false,
                durationMs: Date.now() - startedAt,
                reason: "no usable candidates",
            },
            snapshot,
        };
    }

    const options = candidates.map(describeCandidate);
    const question = `Which element best matches the description: "${request.target}"?`;
    const choice = await jev.choice(question, options, request.signal);

    if (!choice.ok) {
        return {
            attempt: {
                method: "dom",
                ok: false,
                durationMs: Date.now() - startedAt,
                reason: choice.reason,
            },
            snapshot,
        };
    }

    const { index, confidence } = choice.data;

    if (index === null) {
        return {
            attempt: {
                method: "dom",
                ok: false,
                durationMs: Date.now() - startedAt,
                reason: "Jev chose no candidate",
            },
            snapshot,
        };
    }

    if (!Number.isInteger(index) || index < 0 || index >= candidates.length) {
        return {
            attempt: {
                method: "dom",
                ok: false,
                durationMs: Date.now() - startedAt,
                confidence,
                reason: `choice index ${index} out of range`,
            },
            snapshot,
        };
    }

    if (confidence < CONFIDENCE_THRESHOLD) {
        return {
            attempt: {
                method: "dom",
                ok: false,
                durationMs: Date.now() - startedAt,
                confidence,
                reason: `confidence ${confidence} below ${CONFIDENCE_THRESHOLD}`,
            },
            snapshot,
        };
    }

    return {
        attempt: {
            method: "dom",
            ok: true,
            durationMs: Date.now() - startedAt,
            confidence,
        },
        element: { snapshotId: candidates[index].id },
        snapshot,
    };
}
