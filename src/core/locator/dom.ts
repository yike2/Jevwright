import { CONFIDENCE_THRESHOLD, MAX_DOM_CANDIDATES, MAX_TEXT_LENGTH } from "./constants.js";
import type {
  JevClient,
  LocateAction,
  LocateAttempt,
  PageSnapshot,
  SnapshotElement,
} from "./types.js";

function truncate(value: string): string {
  return value.length > MAX_TEXT_LENGTH ? value.slice(0, MAX_TEXT_LENGTH) : value;
}

export function formatCandidateLine(el: SnapshotElement): string {
  const parts: string[] = [el.role];
  const name = el.name?.trim() ?? "";
  const text = el.text?.trim() ?? "";

  if (name) {
    parts.push(`"${truncate(name)}"`);
    if (text && text !== name) {
      parts.push(`text="${truncate(text)}"`);
    }
  } else if (text) {
    parts.push(`"${truncate(text)}"`);
  }

  if (el.attrs?.type) {
    parts.push(`type=${el.attrs.type}`);
  }
  if (el.attrs?.placeholder) {
    parts.push(`placeholder="${el.attrs.placeholder}"`);
  }
  if (el.attrs?.checked !== undefined) {
    parts.push(`checked=${el.attrs.checked}`);
  }
  if (el.attrs?.["aria-checked"] !== undefined && el.attrs["aria-checked"] !== "") {
    parts.push(`aria-checked=${el.attrs["aria-checked"]}`);
  }
  return parts.join(" ");
}

export function isUsableElement(el: SnapshotElement, action: LocateAction): boolean {
  if (!el.hittable) return false;
  if (el.attrs?.disabled) return false;
  if (action === "input" && el.role !== "textbox" && el.role !== "searchbox") {
    return false;
  }
  return true;
}

export function getUsableCandidates(
  elements: SnapshotElement[],
  action: LocateAction,
): SnapshotElement[] {
  return elements.filter((el) => isUsableElement(el, action)).slice(0, MAX_DOM_CANDIDATES);
}

export type StageOutcome = {
  attempt: LocateAttempt;
  elementId?: number;
};

export async function domLocate(
  target: string,
  action: LocateAction,
  getSnapshot: () => Promise<PageSnapshot>,
  jev: JevClient,
): Promise<StageOutcome> {
  const start = Date.now();
  const snapshot = await getSnapshot();
  const candidates = getUsableCandidates(snapshot.elements, action);

  if (candidates.length === 0) {
    return {
      attempt: {
        method: "dom",
        ok: false,
        durationMs: Math.max(0, Date.now() - start),
        reason: "no usable candidates",
      },
    };
  }

  const lines = candidates.map(formatCandidateLine);
  const question = `Which element best matches the description: "${target}"?`;

  let res: { index: number | null; confidence: number };
  try {
    res = await jev.choice(question, lines);
  } catch (err) {
    return {
      attempt: {
        method: "dom",
        ok: false,
        durationMs: Math.max(0, Date.now() - start),
        reason: err instanceof Error ? err.message : String(err),
      },
    };
  }

  if (res.index === null) {
    return {
      attempt: {
        method: "dom",
        ok: false,
        durationMs: Math.max(0, Date.now() - start),
        confidence: res.confidence,
        reason: "Jev chose no candidate",
      },
    };
  }

  if (!Number.isInteger(res.index) || res.index < 0 || res.index >= candidates.length) {
    return {
      attempt: {
        method: "dom",
        ok: false,
        durationMs: Math.max(0, Date.now() - start),
        confidence: res.confidence,
        reason: `choice index ${res.index} out of range`,
      },
    };
  }

  if (res.confidence < CONFIDENCE_THRESHOLD) {
    return {
      attempt: {
        method: "dom",
        ok: false,
        durationMs: Math.max(0, Date.now() - start),
        confidence: res.confidence,
        reason: `confidence ${res.confidence} below ${CONFIDENCE_THRESHOLD}`,
      },
    };
  }

  const chosen = candidates[res.index];
  return {
    attempt: {
      method: "dom",
      ok: true,
      durationMs: Math.max(0, Date.now() - start),
      confidence: res.confidence,
    },
    elementId: chosen.id,
  };
}
