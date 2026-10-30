import { CONFIDENCE_THRESHOLD } from "./constants.js";
import { isUsableElement, type StageOutcome } from "./dom.js";
import type {
  BoundingBox,
  BrowserDriver,
  JevClient,
  LocateAction,
  PageSnapshot,
  SnapshotElement,
} from "./types.js";

export function findElementAtPoint(
  elements: SnapshotElement[],
  x: number,
  y: number,
  action: LocateAction,
): SnapshotElement | null {
  let best: SnapshotElement | null = null;
  let bestArea = Infinity;

  for (const el of elements) {
    if (!isUsableElement(el, action)) continue;
    const { bbox } = el;
    if (bbox.width <= 0 || bbox.height <= 0) continue;
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

export async function visualLocate(
  target: string,
  action: LocateAction,
  driver: BrowserDriver,
  getSnapshot: () => Promise<PageSnapshot>,
  jev: JevClient,
): Promise<StageOutcome> {
  const start = Date.now();
  const image = await driver.screenshot();
  const question = `Find the element described as: "${target}". Return its bounding box.`;

  let res: { box: BoundingBox | null; confidence: number };
  try {
    res = await jev.bbox(question, image);
  } catch (err) {
    return {
      attempt: {
        method: "visual",
        ok: false,
        durationMs: Math.max(0, Date.now() - start),
        reason: err instanceof Error ? err.message : String(err),
      },
    };
  }

  if (!res.box) {
    return {
      attempt: {
        method: "visual",
        ok: false,
        durationMs: Math.max(0, Date.now() - start),
        confidence: res.confidence,
        reason: "Jev returned no bounding box",
      },
    };
  }

  if (res.confidence < CONFIDENCE_THRESHOLD) {
    return {
      attempt: {
        method: "visual",
        ok: false,
        durationMs: Math.max(0, Date.now() - start),
        confidence: res.confidence,
        reason: `confidence ${res.confidence} below ${CONFIDENCE_THRESHOLD}`,
      },
    };
  }

  const snapshot = await getSnapshot();
  const centerX = res.box.x + res.box.width / 2;
  const centerY = res.box.y + res.box.height / 2;
  const match = findElementAtPoint(snapshot.elements, centerX, centerY, action);

  if (!match) {
    return {
      attempt: {
        method: "visual",
        ok: false,
        durationMs: Math.max(0, Date.now() - start),
        confidence: res.confidence,
        reason: `no usable element at (${Math.round(centerX)}, ${Math.round(centerY)})`,
      },
    };
  }

  return {
    attempt: {
      method: "visual",
      ok: true,
      durationMs: Math.max(0, Date.now() - start),
      confidence: res.confidence,
    },
    elementId: match.id,
  };
}
