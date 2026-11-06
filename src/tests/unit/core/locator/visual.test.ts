import { describe, expect, it } from "vitest";
import type { BoundingBox, SnapshotElement } from "@/core/browser/index.js";
import { findElementAtPoint, getBoundingBoxCenter } from "@/core/locator/visual.js";

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

describe("getBoundingBoxCenter", () => {
    it("returns the midpoint for a box with a non-integer center", () => {
        const box: BoundingBox = { x: 10, y: 20, width: 5, height: 10 };

        expect(getBoundingBoxCenter(box)).toEqual({ x: 12.5, y: 25 });
    });
});

describe("findElementAtPoint", () => {
    it("returns the element when the point is strictly inside one element", () => {
        const candidates = [
            element({ id: 1, bbox: { x: 0, y: 0, width: 100, height: 100 } }),
            element({ id: 2, bbox: { x: 200, y: 0, width: 100, height: 100 } }),
        ];

        expect(findElementAtPoint(candidates, { x: 50, y: 50 })).toBe(candidates[0]);
    });

    it("counts an edge point as inside the element", () => {
        const candidates = [element({ id: 1, bbox: { x: 0, y: 0, width: 20, height: 20 } })];

        expect(findElementAtPoint(candidates, { x: 20, y: 10 })).toBe(candidates[0]);
    });

    it("ignores elements with zero width or height", () => {
        const candidates = [
            element({ id: 1, bbox: { x: 0, y: 0, width: 0, height: 10 } }),
            element({ id: 2, bbox: { x: 0, y: 0, width: 10, height: 0 } }),
            element({ id: 3, bbox: { x: 0, y: 0, width: 10, height: 10 } }),
        ];

        expect(findElementAtPoint(candidates, { x: 5, y: 5 })).toBe(candidates[2]);
    });

    it("returns null when the point is outside every element", () => {
        const candidates = [
            element({ id: 1, bbox: { x: 0, y: 0, width: 50, height: 50 } }),
            element({ id: 2, bbox: { x: 100, y: 100, width: 50, height: 50 } }),
        ];

        expect(findElementAtPoint(candidates, { x: 75, y: 75 })).toBeNull();
    });

    it("returns null for an empty element list", () => {
        expect(findElementAtPoint([], { x: 0, y: 0 })).toBeNull();
    });

    it("prefers the smallest enclosing element for nested elements", () => {
        const outer = element({ id: 1, bbox: { x: 0, y: 0, width: 100, height: 100 } });
        const inner = element({ id: 2, bbox: { x: 10, y: 10, width: 20, height: 20 } });

        expect(findElementAtPoint([outer, inner], { x: 20, y: 20 })).toBe(inner);
    });

    it("uses DOM order to break ties on equal area", () => {
        const first = element({ id: 1, bbox: { x: 0, y: 0, width: 20, height: 20 } });
        const second = element({ id: 2, bbox: { x: 10, y: 10, width: 20, height: 20 } });

        expect(findElementAtPoint([first, second], { x: 15, y: 15 })).toBe(first);
    });
});
