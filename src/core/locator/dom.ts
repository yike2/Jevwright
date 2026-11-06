import type { SnapshotElement } from "@/core/browser/index.js";
import { MAX_DOM_CANDIDATES, MAX_TEXT_LENGTH } from "./constants.js";

const truncateText = (value: string): string => value.slice(0, MAX_TEXT_LENGTH);

const escapeText = (value: string): string => truncateText(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"');

export function selectCandidates(
    elements: SnapshotElement[],
    action: "click" | "doubleClick" | "rightClick" | "hover" | "input",
): SnapshotElement[] {
    const usable = elements.filter((element) => {
        if (!element.hittable) return false;
        if (element.attrs.disabled === true) return false;
        if (action === "input") {
            return element.role === "textbox" || element.role === "searchbox";
        }
        return true;
    });

    return usable.slice(0, MAX_DOM_CANDIDATES);
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
