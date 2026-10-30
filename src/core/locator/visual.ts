import { CONFIDENCE_THRESHOLD } from "./constants.js";
import { isElementUsable } from "./dom.js";
import type {
  BoundingBox,
  BrowserDriver,
  JevClient,
  LocateAction,
  PageSnapshot,
  SnapshotElement,
} from "./types.js";

/** Finds the smallest-area usable snapshot element whose bounding box contains (x, y). */
export function findElementAtPoint(
  elements: SnapshotElement[],
  x: number,
  y: number,
  action: LocateAction,
): SnapshotElement | null {
  let best: SnapshotElement | null = null;
  let bestArea = Number.POSITIVE_INFINITY;

  for (const el of elements) {
    if (!isElementUsable(el, action)) {
      continue;
    }
    const { bbox } = el;
    if (bbox.width <= 0 || bbox.height <= 0) {
      continue;
    }
    if (x >= bbox.x && x <= bbox.x + bbox.width && y >= bbox.y && y <= bbox.y + bbox.height) {
      const area = bbox.width * bbox.height;
      if (area < bestArea) {
        bestArea = area;
        best = el;
      }
    }
  }

  return best;
}

export type VisualStageOutcome =
  | { ok: true; elementId: number; confidence: number; snapshot: PageSnapshot }
  | { ok: false; confidence?: number; reason: string; snapshot?: PageSnapshot };

/** Runs the Visual Locate stage using screenshot, Jev bounding box, and page snapshot geometry. */
export async function visualLocate(
  target: string,
  action: LocateAction,
  driver: BrowserDriver,
  jev: JevClient,
): Promise<VisualStageOutcome> {
  const image = await driver.screenshot();
  const question = `Find the element described as: "${target}". Return its bounding box.`;

  let res: { box: BoundingBox | null; confidence: number };
  try {
    res = await jev.bbox(question, image);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, reason: msg };
  }

  if (res.box === null) {
    return {
      ok: false,
      confidence: res.confidence,
      reason: "Jev found no matching element",
    };
  }

  if (res.confidence < CONFIDENCE_THRESHOLD) {
    return {
      ok: false,
      confidence: res.confidence,
      reason: `confidence ${res.confidence.toFixed(2)} below ${CONFIDENCE_THRESHOLD}`,
    };
  }

  const snapshot = await driver.snapshot();
  const centerX = res.box.x + res.box.width / 2;
  const centerY = res.box.y + res.box.height / 2;
  const hit = findElementAtPoint(snapshot.elements, centerX, centerY, action);

  if (!hit) {
    return {
      ok: false,
      confidence: res.confidence,
      reason: `box center (${Math.round(centerX)}, ${Math.round(centerY)}) hit no usable element`,
      snapshot,
    };
  }

  return {
    ok: true,
    elementId: hit.id,
    confidence: res.confidence,
    snapshot,
  };
}
