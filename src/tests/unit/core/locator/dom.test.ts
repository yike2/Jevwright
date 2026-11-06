import { describe, expect, it } from "vitest";
import type { SnapshotElement } from "@/core/browser/index.js";
import { MAX_DOM_CANDIDATES } from "@/core/locator/constants.js";
import { describeCandidate, filterUsable, selectCandidates } from "@/core/locator/dom.js";

const element = (overrides: Partial<SnapshotElement> = {}): SnapshotElement => ({
    id: 0,
    tag: "button",
    role: "button",
    name: "Example",
    attrs: {},
    bbox: { x: 0, y: 0, width: 10, height: 10 },
    hittable: true,
    ...overrides,
});

describe("selectCandidates", () => {
    it("skips non-hittable and disabled elements", () => {
        const candidates = [
            element({ id: 0, hittable: false }),
            element({ id: 1, attrs: { disabled: true } }),
            element({ id: 2, hittable: true, attrs: {} }),
        ];

        expect(selectCandidates(candidates, "click")).toEqual([candidates[2]]);
    });

    it("keeps only textbox and searchbox for the input action, including password inputs", () => {
        const candidates = [
            element({ id: 0, role: "textbox", name: "Email" }),
            element({ id: 1, role: "searchbox", name: "Search" }),
            element({ id: 2, role: "textbox", name: "Password", attrs: { type: "password" } }),
            element({ id: 3, role: "checkbox", name: "Remember me" }),
            element({ id: 4, role: "combobox", name: "Status" }),
        ];

        expect(selectCandidates(candidates, "input").map((item) => item.id)).toEqual([0, 1, 2]);
    });

    it("caps the list at 50 and keeps snapshot order", () => {
        const candidates = Array.from({ length: 60 }, (_, id) =>
            element({ id, hittable: true, name: `Item ${id}` }),
        );

        expect(selectCandidates(candidates, "click")).toHaveLength(50);
        expect(selectCandidates(candidates, "click").map((item) => item.id)).toEqual(Array.from({ length: 50 }, (_, i) => i));
    });
});

describe("filterUsable", () => {
    it("excludes non-hittable elements", () => {
        const candidates = [
            element({ id: 0, hittable: false }),
            element({ id: 1, hittable: true }),
        ];

        expect(filterUsable(candidates, "click").map((item) => item.id)).toEqual([1]);
    });

    it("excludes disabled elements but keeps disabled=false", () => {
        const candidates = [
            element({ id: 0, attrs: { disabled: true } }),
            element({ id: 1, attrs: { disabled: false } }),
            element({ id: 2, attrs: {} }),
        ];

        expect(filterUsable(candidates, "click").map((item) => item.id)).toEqual([1, 2]);
    });

    it("keeps only textbox and searchbox roles for input actions", () => {
        const candidates = [
            element({ id: 0, role: "textbox" }),
            element({ id: 1, role: "searchbox" }),
            element({ id: 2, role: "button" }),
            element({ id: 3, role: "checkbox" }),
        ];

        expect(filterUsable(candidates, "input").map((item) => item.id)).toEqual([0, 1]);
    });

    it("returns all usable elements when under the cap and leaves selectCandidates capped", () => {
        const candidates = Array.from({ length: MAX_DOM_CANDIDATES + 10 }, (_, id) =>
            element({ id, hittable: true, attrs: { disabled: false } }),
        );

        expect(filterUsable(candidates, "click")).toHaveLength(MAX_DOM_CANDIDATES + 10);
        expect(selectCandidates(candidates, "click")).toHaveLength(MAX_DOM_CANDIDATES);
    });
});

describe("describeCandidate", () => {
    it("reproduces the doc examples exactly", () => {
        expect(
            describeCandidate(
                element({
                    tag: "input",
                    role: "textbox",
                    name: "Email",
                    attrs: { type: "email", placeholder: "you@example.com" },
                }),
            ),
        ).toBe('textbox "Email" type=email placeholder="you@example.com"');

        expect(
            describeCandidate(
                element({
                    tag: "button",
                    role: "button",
                    name: "Show password",
                    attrs: {},
                }),
            ),
        ).toBe('button "Show password"');

        expect(
            describeCandidate(
                element({
                    tag: "input",
                    role: "checkbox",
                    name: "Remember me",
                    attrs: { checked: false },
                }),
            ),
        ).toBe('checkbox "Remember me" checked=false');

        expect(
            describeCandidate(
                element({
                    tag: "div",
                    role: "switch",
                    name: "Send a weekly summary",
                    attrs: { "aria-checked": "false" },
                }),
            ),
        ).toBe('switch "Send a weekly summary" aria-checked=false');
    });

    it("omits undefined and empty-string fields but keeps false values", () => {
        const candidate = element({
            role: "button",
            name: "Save",
            text: "",
            attrs: { type: "submit", placeholder: "", checked: false },
        });

        expect(describeCandidate(candidate)).toBe('button "Save" type=submit checked=false');
    });

    it("truncates text at exactly 50 characters before escaping", () => {
        const text = "A".repeat(60);
        const candidate = element({
            role: "button",
            name: "Title",
            text,
            attrs: { type: "button" },
        });

        expect(describeCandidate(candidate)).toContain('text="' + "A".repeat(50) + '"');
        expect(describeCandidate(candidate)).not.toContain("...");
    });

    it("formats checked and aria-checked consistently", () => {
        const candidate = element({
            role: "switch",
            name: "Weekly",
            attrs: { checked: true, "aria-checked": "false" },
        });

        expect(describeCandidate(candidate)).toBe('switch "Weekly" checked=true aria-checked=false');
    });
});
