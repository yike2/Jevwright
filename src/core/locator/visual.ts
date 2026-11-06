import type { BoundingBox, SnapshotElement } from "@/core/browser/index.js";

export function getBoundingBoxCenter(box: BoundingBox): { x: number; y: number } {
    return {
        x: box.x + box.width / 2,
        y: box.y + box.height / 2,
    };
}

export function findElementAtPoint(
    elements: SnapshotElement[],
    point: { x: number; y: number },
): SnapshotElement | null {
    let best: { element: SnapshotElement; area: number; index: number } | null = null;

    for (const [index, element] of elements.entries()) {
        const { x, y, width, height } = element.bbox;

        if (width <= 0 || height <= 0) continue;

        const left = x;
        const right = x + width;
        const top = y;
        const bottom = y + height;

        const containsPoint = point.x >= left && point.x <= right && point.y >= top && point.y <= bottom;
        if (!containsPoint) continue;

        const area = width * height;
        if (best === null || area < best.area || (area === best.area && index < best.index)) {
            best = { element, area, index };
        }
    }

    return best?.element ?? null;
}
