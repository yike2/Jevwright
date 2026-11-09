import type { BoundingBox, BrowserAdapter, SnapshotElement } from "@/core/browser/index.js";
import type { JevClient } from "@/core/jev/index.js";
import { CONFIDENCE_THRESHOLD } from "./constants.js";
import type { LocateRequest, StageResult } from "./types.js";
import { filterUsable } from "./dom.js";

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

/** Returns the element whose bbox overlaps `box` the most, the earliest on a tie; `null` when none overlaps. */
export function findElementOverlapping(elements: SnapshotElement[], box: BoundingBox): SnapshotElement | null {
  void elements;
  void box;
  return null;
}

export async function runVisual(
  request: LocateRequest,
  adapter: Pick<BrowserAdapter, "screenshot" | "snapshot">,
  jev: Pick<JevClient, "bbox">,
): Promise<StageResult> {
  if (request.target === undefined) {
    throw new Error("Visual locate requires request.target");
  }

  const startedAt = Date.now();

  const screenshot = await adapter.screenshot();
  if (!screenshot.ok) {
    return {
      attempt: {
        method: "visual",
        ok: false,
        durationMs: Date.now() - startedAt,
        reason: screenshot.reason,
      },
    };
  }

  const snapshot = await adapter.snapshot();
  if (!snapshot.ok) {
    return {
      attempt: {
        method: "visual",
        ok: false,
        durationMs: Date.now() - startedAt,
        reason: snapshot.reason,
      },
    };
  }

  const question = `Find the element described as: "${request.target}". Return its bounding box.`;
  const bbox = await jev.bbox(question, screenshot.data, snapshot.data.viewport, request.signal);
  if (!bbox.ok) {
    return {
      attempt: {
        method: "visual",
        ok: false,
        durationMs: Date.now() - startedAt,
        reason: bbox.reason,
      },
      snapshot: snapshot.data,
    };
  }

  if (bbox.data.box === null) {
    return {
      attempt: {
        method: "visual",
        ok: false,
        durationMs: Date.now() - startedAt,
        reason: "Jev judged the element not present",
      },
      snapshot: snapshot.data,
    };
  }

  const confidence = bbox.data.confidence;
  if (confidence < CONFIDENCE_THRESHOLD) {
    return {
      attempt: {
        method: "visual",
        ok: false,
        durationMs: Date.now() - startedAt,
        confidence,
        reason: `confidence ${confidence} below ${CONFIDENCE_THRESHOLD}`,
      },
      snapshot: snapshot.data,
    };
  }

  const center = getBoundingBoxCenter(bbox.data.box);
  const candidates = filterUsable(snapshot.data.elements, request.action);
  const element = findElementAtPoint(candidates, center);
  if (element === null) {
    return {
      attempt: {
        method: "visual",
        ok: false,
        durationMs: Date.now() - startedAt,
        confidence,
        reason: `center (${center.x}, ${center.y}) did not hit a usable element`,
      },
      snapshot: snapshot.data,
    };
  }

  return {
    attempt: {
      method: "visual",
      ok: true,
      durationMs: Date.now() - startedAt,
      confidence,
    },
    element: { snapshotId: element.id },
    snapshot: snapshot.data,
  };
}
