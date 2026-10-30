import { CONFIDENCE_THRESHOLD, MAX_DOM_CANDIDATES, MAX_TEXT_LENGTH } from "./constants.js";
import type { JevClient, LocateAction, PageSnapshot, SnapshotElement } from "./types.js";

function truncateText(value: string): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > MAX_TEXT_LENGTH ? normalized.slice(0, MAX_TEXT_LENGTH) : normalized;
}

/** Checks whether a snapshot element is hittable, enabled, and valid for the requested action. */
export function isElementUsable(element: SnapshotElement, action: LocateAction): boolean {
  if (!element.hittable) {
    return false;
  }
  const disabled = element.attrs.disabled;
  if (disabled !== undefined && disabled !== false && disabled !== "false") {
    return false;
  }
  if (action === "input") {
    return element.role === "textbox" || element.role === "searchbox";
  }
  return true;
}

/** Returns up to MAX_DOM_CANDIDATES usable elements from the snapshot in DOM order. */
export function getDomCandidates(snapshot: PageSnapshot, action: LocateAction): SnapshotElement[] {
  return snapshot.elements.filter((el) => isElementUsable(el, action)).slice(0, MAX_DOM_CANDIDATES);
}

/** Formats one snapshot element into a compact DOM Locate description line. */
export function formatCandidateLine(element: SnapshotElement): string {
  const parts: string[] = [element.role];

  const name = truncateText(element.name);
  const text = truncateText(element.text);

  if (name) {
    parts.push(`"${name}"`);
    if (text && text !== name) {
      parts.push(`text="${text}"`);
    }
  } else if (text) {
    parts.push(`"${text}"`);
  }

  const { attrs } = element;
  if (typeof attrs.type === "string" && attrs.type.trim() !== "") {
    parts.push(`type=${attrs.type.trim()}`);
  }
  if (typeof attrs.placeholder === "string" && attrs.placeholder.trim() !== "") {
    parts.push(`placeholder="${truncateText(attrs.placeholder)}"`);
  }
  if (attrs.checked !== undefined && attrs.checked !== "") {
    parts.push(`checked=${String(attrs.checked)}`);
  }
  if (attrs["aria-checked"] !== undefined && attrs["aria-checked"] !== "") {
    parts.push(`aria-checked=${String(attrs["aria-checked"])}`);
  }

  return parts.join(" ");
}

export type StageOutcome =
  | { ok: true; elementId: number; confidence: number }
  | { ok: false; confidence?: number; reason: string };

/** Runs the DOM Locate stage on a PageSnapshot using the Jev Harness. */
export async function domLocate(
  target: string,
  action: LocateAction,
  snapshot: PageSnapshot,
  jev: JevClient,
): Promise<StageOutcome> {
  const candidates = getDomCandidates(snapshot, action);
  if (candidates.length === 0) {
    return { ok: false, reason: "no usable candidates in snapshot" };
  }

  const lines = candidates.map((el) => formatCandidateLine(el));
  const question = `Which element best matches the description: "${target}"?`;

  let res: { index: number | null; confidence: number };
  try {
    res = await jev.choice(question, lines);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, reason: msg };
  }

  if (res.index === null) {
    return { ok: false, confidence: res.confidence, reason: "Jev chose no candidate" };
  }
  if (res.index < 0 || res.index >= candidates.length) {
    return {
      ok: false,
      confidence: res.confidence,
      reason: `Jev returned out-of-range index ${res.index}`,
    };
  }
  if (res.confidence < CONFIDENCE_THRESHOLD) {
    return {
      ok: false,
      confidence: res.confidence,
      reason: `confidence ${res.confidence.toFixed(2)} below ${CONFIDENCE_THRESHOLD}`,
    };
  }

  return {
    ok: true,
    elementId: candidates[res.index]!.id,
    confidence: res.confidence,
  };
}
