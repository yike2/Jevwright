import {
  DEFAULT_MAX_RETRIES,
  JEV_DECISIONS_URL,
  JEV_MODEL,
  PRESENCE_THRESHOLD,
} from "./constants.js";
import { getImageDimensions } from "./image.js";
import { type JevClient, type JevClientOptions, JevError } from "./types.js";

type DecisionsPayload = {
  model: string;
  state: unknown;
  questions: Record<string, unknown>;
};

type DecisionsResponseBody = {
  answers?: {
    present?: { type?: string; noul?: number };
    box?: {
      type?: string;
      box?: { left: number; top: number; right: number; bottom: number };
      confidence?: number;
    };
    choice?: {
      type?: string;
      choice?: string;
      confidence?: number;
      probabilities?: Record<string, number>;
    };
  };
  error?: { code?: number; message?: string };
};

function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

/** Creates a JevClient that calls the OpenRouter Decisions API for Jev 1.14. */
export function createJevClient(options: JevClientOptions = {}): JevClient {
  const apiKey = options.apiKey !== undefined ? options.apiKey : (process.env.OPENROUTER_API_KEY ?? "");
  const model = options.model ?? JEV_MODEL;
  const endpoint = options.endpoint ?? JEV_DECISIONS_URL;
  const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
  const fetchFn = options.fetchFn ?? fetch;

  async function postDecisions(payload: DecisionsPayload): Promise<DecisionsResponseBody> {
    if (!apiKey.trim()) {
      throw new JevError("Missing OPENROUTER_API_KEY for Jev request");
    }

    let lastError: Error | undefined;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      let res: Response;
      try {
        res = await fetchFn(endpoint, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        lastError = new JevError(`Jev request network error: ${msg}`);
        continue;
      }

      if (!res.ok) {
        let detail = `HTTP ${res.status}`;
        try {
          const errBody = (await res.json()) as DecisionsResponseBody;
          if (errBody?.error?.message) {
            detail = `HTTP ${res.status}: ${errBody.error.message}`;
          }
        } catch {
          // ignore non-JSON error body
        }
        const httpErr = new JevError(`Jev request failed (${detail})`);
        if (!isRetryableStatus(res.status)) {
          throw httpErr;
        }
        lastError = httpErr;
        continue;
      }

      let data: DecisionsResponseBody;
      try {
        data = (await res.json()) as DecisionsResponseBody;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        lastError = new JevError(`Jev response JSON parse error: ${msg}`);
        continue;
      }

      if (!data || typeof data !== "object" || !data.answers || typeof data.answers !== "object") {
        lastError = new JevError("Jev response missing answers object");
        continue;
      }

      return data;
    }

    throw lastError ?? new JevError("Jev request failed after retries");
  }

  return {
    async bbox(question: string, image: Buffer) {
      const { width, height, format } = getImageDimensions(image);
      const dataUrl = `data:image/${format};base64,${image.toString("base64")}`;

      const data = await postDecisions({
        model,
        state: [
          "Webpage screenshot:",
          { type: "image_url", image_url: { url: dataUrl } },
        ],
        questions: {
          present: {
            type: "noul",
            instructions: `Is the target element visible in the webpage screenshot? ${question}`,
            criteria: {
              true: "The described element is visible in the webpage screenshot.",
              false: "The described element is not visible in the webpage screenshot.",
            },
          },
          box: {
            type: "box",
            instructions: `${question} in the webpage screenshot`,
          },
        },
      });

      const presentProb = data.answers?.present?.noul;
      if (typeof presentProb !== "number") {
        throw new JevError("Jev bbox response missing present noul probability");
      }
      if (presentProb < PRESENCE_THRESHOLD) {
        return { box: null, confidence: presentProb };
      }

      const boxAns = data.answers?.box;
      const raw = boxAns?.box;
      if (!raw || typeof raw.left !== "number" || typeof raw.top !== "number" || typeof raw.right !== "number" || typeof raw.bottom !== "number") {
        throw new JevError("Jev bbox response missing box coordinates");
      }

      const x = raw.left * width;
      const y = raw.top * height;
      const boxWidth = (raw.right - raw.left) * width;
      const boxHeight = (raw.bottom - raw.top) * height;
      return {
        box: { x, y, width: boxWidth, height: boxHeight },
        confidence: typeof boxAns.confidence === "number" ? boxAns.confidence : presentProb,
      };
    },

    async choice(question: string, candidates: string[]) {
      if (candidates.length === 0) {
        return { index: null, confidence: 0 };
      }

      const criteria: Record<string, string> = {};
      candidates.forEach((opt, i) => {
        criteria[String(i)] = opt;
      });
      criteria.none = "None of the candidate elements match the description.";

      const data = await postDecisions({
        model,
        state: {
          candidates: candidates.map((opt, i) => `[${i}] ${opt}`).join("\n"),
        },
        questions: {
          choice: {
            type: "choice",
            instructions: `${question} Select the matching element index, or "none" if no candidate matches.`,
            criteria,
          },
        },
      });

      const ans = data.answers?.choice;
      if (!ans || typeof ans.choice !== "string") {
        throw new JevError("Jev choice response missing choice answer");
      }
      const chosen = ans.choice;
      const confidence =
        typeof ans.confidence === "number"
          ? ans.confidence
          : (ans.probabilities?.[chosen] ?? 0);
      if (chosen === "none" || !/^\d+$/.test(chosen)) {
        return { index: null, confidence };
      }
      const index = Number.parseInt(chosen, 10);
      if (index < 0 || index >= candidates.length) {
        return { index: null, confidence };
      }
      return { index, confidence };
    },
  };
}
