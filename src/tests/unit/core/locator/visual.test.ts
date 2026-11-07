import { describe, expect, it } from "vitest";
import type { BoundingBox, SnapshotElement } from "@/core/browser/index.js";
import { findElementAtPoint, getBoundingBoxCenter, runVisual } from "@/core/locator/visual.js";

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

const snapshot = (elements: SnapshotElement[], viewport = { width: 800, height: 600 }) => ({
    url: "https://example.com",
    title: "Example page",
    viewport,
    elements,
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

describe("runVisual", () => {
    it("fails when screenshot fails before snapshot or bbox are called", async () => {
        const calls: string[] = [];
        const request = { action: "click" as const, target: "Example button", timeoutMs: 1000 };
        const adapter = {
            screenshot: async () => {
                calls.push("screenshot");
                return { ok: false as const, reason: "screenshot failed" };
            },
            snapshot: async () => {
                calls.push("snapshot");
                return { ok: true as const, data: snapshot([]) };
            },
        };
        const jev = {
            bbox: async () => {
                calls.push("bbox");
                return { ok: true as const, data: { box: null, confidence: 0.9 } };
            },
        };

        const result = await runVisual(request, adapter, jev);

        expect(calls).toEqual(["screenshot"]);
        expect(result.attempt.ok).toBe(false);
        expect(result.attempt.reason).toContain("screenshot");
        expect(result.snapshot).toBeUndefined();
        expect(result.attempt.durationMs).toBeGreaterThanOrEqual(0);
    });

    it("fails when snapshot fails before bbox is called", async () => {
        const calls: string[] = [];
        const request = { action: "click" as const, target: "Example button", timeoutMs: 1000 };
        const adapter = {
            screenshot: async () => {
                calls.push("screenshot");
                return { ok: true as const, data: Buffer.from("shot") };
            },
            snapshot: async () => {
                calls.push("snapshot");
                return { ok: false as const, reason: "snapshot failed" };
            },
        };
        const jev = {
            bbox: async () => {
                calls.push("bbox");
                return { ok: true as const, data: { box: null, confidence: 0.9 } };
            },
        };

        const result = await runVisual(request, adapter, jev);

        expect(calls).toEqual(["screenshot", "snapshot"]);
        expect(result.attempt.ok).toBe(false);
        expect(result.attempt.reason).toContain("snapshot");
        expect(result.snapshot).toBeUndefined();
        expect(result.attempt.durationMs).toBeGreaterThanOrEqual(0);
    });

    it("returns the snapshot when bbox returns an error", async () => {
        const request = { action: "click" as const, target: "Example button", timeoutMs: 1000 };
        const pageSnapshot = snapshot([element({ id: 7 })]);
        const adapter = {
            screenshot: async () => ({ ok: true as const, data: Buffer.from("shot") }),
            snapshot: async () => ({ ok: true as const, data: pageSnapshot }),
        };
        const jev = {
            bbox: async () => ({ ok: false as const, reason: "bbox failed" }),
        };

        const result = await runVisual(request, adapter, jev);

        expect(result.attempt.ok).toBe(false);
        expect(result.attempt.reason).toContain("bbox");
        expect(result.snapshot).toEqual(pageSnapshot);
        expect(result.attempt.durationMs).toBeGreaterThanOrEqual(0);
    });

    it("fails when Jev says the element is not present", async () => {
        const request = { action: "click" as const, target: "Example button", timeoutMs: 1000 };
        const pageSnapshot = snapshot([element({ id: 9 })]);
        const adapter = {
            screenshot: async () => ({ ok: true as const, data: Buffer.from("shot") }),
            snapshot: async () => ({ ok: true as const, data: pageSnapshot }),
        };
        const jev = {
            bbox: async () => ({ ok: true as const, data: { box: null, confidence: 0.4 } }),
        };

        const result = await runVisual(request, adapter, jev);

        expect(result.attempt.ok).toBe(false);
        expect(result.attempt.reason).toContain("not present");
        expect(result.attempt.confidence).toBeUndefined();
        expect(result.snapshot).toEqual(pageSnapshot);
    });

    it("fails when confidence is below the threshold and records it", async () => {
        const request = { action: "click" as const, target: "Example button", timeoutMs: 1000 };
        const pageSnapshot = snapshot([element({ id: 3, bbox: { x: 10, y: 10, width: 30, height: 20 } })]);
        const adapter = {
            screenshot: async () => ({ ok: true as const, data: Buffer.from("shot") }),
            snapshot: async () => ({ ok: true as const, data: pageSnapshot }),
        };
        const jev = {
            bbox: async () => ({ ok: true as const, data: { box: { x: 10, y: 10, width: 30, height: 20 }, confidence: 0.69 } }),
        };

        const result = await runVisual(request, adapter, jev);

        expect(result.attempt.ok).toBe(false);
        expect(result.attempt.reason).toContain("0.69");
        expect(result.attempt.reason).toContain("below");
        expect(result.attempt.confidence).toBe(0.69);
        expect(result.snapshot).toEqual(pageSnapshot);
    });

    it("succeeds when confidence is exactly at the threshold", async () => {
        const controller = new AbortController();
        const request = {
            action: "click" as const,
            target: "Example button",
            timeoutMs: 1000,
            signal: controller.signal,
        };
        const unrelated = element({
            id: 1,
            bbox: { x: 200, y: 40, width: 30, height: 20 },
            hittable: true,
        });
        const card = element({
            id: 2,
            bbox: { x: 0, y: 0, width: 200, height: 120 },
            hittable: true,
        });
        const target = element({
            id: 12,
            bbox: { x: 10, y: 15, width: 30, height: 20 },
            hittable: true,
        });
        const pageSnapshot = snapshot([unrelated, card, target]);
        const calls: string[] = [];
        const adapter = {
            screenshot: async () => {
                calls.push("screenshot");
                return { ok: true as const, data: Buffer.from("shot") };
            },
            snapshot: async () => {
                calls.push("snapshot");
                return { ok: true as const, data: pageSnapshot };
            },
        };
        const jev = {
            bbox: async (question: string, _image: Buffer, viewport: { width: number; height: number }, signal?: AbortSignal) => {
                calls.push("bbox");
                expect(question).toBe('Find the element described as: "Example button". Return its bounding box.');
                expect(viewport).toEqual(pageSnapshot.viewport);
                expect(signal).toBe(request.signal);
                return {
                    ok: true as const,
                    data: { box: { x: 12, y: 17, width: 28, height: 18 }, confidence: 0.7 },
                };
            },
        };

        const result = await runVisual(request, adapter, jev);

        expect(calls).toEqual(["screenshot", "snapshot", "bbox"]);
        expect(result.attempt.ok).toBe(true);
        expect(result.element).toEqual({ snapshotId: 12 });
        expect(result.attempt.confidence).toBe(0.7);
        expect(result.snapshot).toEqual(pageSnapshot);
        expect(result.attempt.durationMs).toBeGreaterThanOrEqual(0);
    });

    it("fails when the center hits no usable element, including a non-hittable element under the center", async () => {
        const request = { action: "click" as const, target: "Example button", timeoutMs: 1000 };
        const blocked = element({
            id: 44,
            bbox: { x: 10, y: 15, width: 30, height: 20 },
            hittable: false,
        });
        const visible = element({
            id: 45,
            bbox: { x: 100, y: 100, width: 20, height: 20 },
            hittable: true,
        });
        const pageSnapshot = snapshot([blocked, visible]);
        const adapter = {
            screenshot: async () => ({ ok: true as const, data: Buffer.from("shot") }),
            snapshot: async () => ({ ok: true as const, data: pageSnapshot }),
        };
        const jev = {
            bbox: async () => ({
                ok: true as const,
                data: { box: { x: 10, y: 15, width: 30, height: 20 }, confidence: 0.8 },
            }),
        };

        const result = await runVisual(request, adapter, jev);

        expect(result.attempt.ok).toBe(false);
        expect(result.attempt.reason).toContain("25");
        expect(result.attempt.reason).toContain("center");
        expect(result.attempt.confidence).toBe(0.8);
        expect(result.snapshot).toEqual(pageSnapshot);
    });

    it("rethrows any error thrown by the adapter", async () => {
        const request = { action: "click" as const, target: "Example button", timeoutMs: 1000 };
        const adapter = {
            screenshot: async () => {
                throw new Error("browser exploded");
            },
            snapshot: async () => ({ ok: true as const, data: snapshot([]) }),
        };
        const jev = {
            bbox: async () => ({ ok: true as const, data: { box: null, confidence: 0.9 } }),
        };

        await expect(runVisual(request, adapter, jev)).rejects.toThrow("browser exploded");
    });
});
