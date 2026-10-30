// The Jev Harness is the only component that talks to the Jev model.
// It speaks OpenRouter's Decisions API and hides the request shapes.

const DECISIONS_URL = "https://openrouter.ai/api/alpha/decisions";
const MODEL = "typesafe/jev-1.14";

export interface JevUsage {
  inputTokens: number;
  /** USD, as billed by OpenRouter. */
  cost: number;
}

export interface JevHarnessOptions {
  apiKey: string;
  fetch?: typeof globalThis.fetch;
  /** Called after every successful Jev response. */
  onUsage?: (usage: JevUsage) => void;
}

export interface BoxRequest {
  /** PNG screenshot bytes. */
  image: Uint8Array;
  /** Natural-language description of the element to find. */
  target: string;
}

/** Box edges as fractions of the image's width (left/right) and height (top/bottom). */
export interface Box {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

export interface BoxAnswer {
  box: Box;
  confidence: number;
  /** Probability that the target is in the screenshot at all. */
  visible: number;
}

export interface Candidate {
  id: string;
  /** What Jev reads about the element, e.g. `button "Remove" in row "Bob"`. */
  description: string;
}

export interface ChoiceRequest {
  target: string;
  candidates: Candidate[];
}

export interface ChoiceAnswer {
  /** The chosen candidate's id, or null when Jev says none of them match. */
  id: string | null;
  confidence: number;
}

export interface JevHarness {
  /** Ask Jev where `target` is in a screenshot. */
  locateBox(request: BoxRequest): Promise<BoxAnswer>;
  /** Ask Jev which of the candidate elements is `target`. */
  chooseElement(request: ChoiceRequest): Promise<ChoiceAnswer>;
}

const NONE = "none";

export class JevError extends Error {
  constructor(
    readonly status: number,
    detail: string,
  ) {
    super(`Jev request failed (${status}): ${detail}`);
    this.name = "JevError";
  }
}

export function createJevHarness(options: JevHarnessOptions): JevHarness {
  const fetch = options.fetch ?? globalThis.fetch;

  async function decide(state: unknown, questions: Record<string, unknown>): Promise<Record<string, any>> {
    const response = await fetch(DECISIONS_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${options.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: MODEL, state, questions }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new JevError(response.status, body?.error?.message ?? response.statusText);
    options.onUsage?.({ inputTokens: body.usage?.input_tokens ?? 0, cost: body.usage?.cost ?? 0 });
    return body.answers;
  }

  return {
    async locateBox({ image, target }: BoxRequest): Promise<BoxAnswer> {
      const answers = await decide(
        {
          screenshot: {
            type: "image_url",
            image_url: { url: `data:image/png;base64,${Buffer.from(image).toString("base64")}` },
          },
        },
        {
          box: { type: "box", instructions: `${target} in the screenshot` },
          visible: { type: "noul", instructions: `The screenshot shows ${target}.` },
        },
      );
      return { box: answers.box.box, confidence: answers.box.confidence, visible: answers.visible.noul };
    },

    async chooseElement({ target, candidates }: ChoiceRequest): Promise<ChoiceAnswer> {
      const criteria: Record<string, string> = {};
      for (const c of candidates) criteria[c.id] = c.description;
      criteria[NONE] = "None of these elements matches `target`.";
      const answers = await decide(
        { target },
        { element: { type: "choice", instructions: "Which page element is the one described by `target`?", criteria } },
      );
      const { choice, confidence } = answers.element;
      return { id: choice === NONE ? null : choice, confidence };
    },
  };
}
