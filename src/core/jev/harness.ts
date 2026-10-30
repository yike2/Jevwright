import {
  JEV_DECISIONS_URL,
  JEV_DEFAULT_MAX_RETRIES,
  JEV_DEFAULT_MODEL,
  JEV_DEFAULT_RETRY_DELAY_MS,
  JEV_PRESENCE_THRESHOLD,
} from "./constants.js";
import { readImageDimensions } from "./image.js";
import type {
  BoundingBox,
  DecisionsBoxAnswer,
  DecisionsChoiceAnswer,
  DecisionsNoulAnswer,
  DecisionsResponse,
  FetchLike,
  JevClient,
  JevHarnessOptions,
} from "./types.js";

function sleep(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class JevHarness implements JevClient {
  private readonly apiKey: string;
  private readonly endpoint: string;
  private readonly model: string;
  private readonly maxRetries: number;
  private readonly retryDelayMs: number;
  private readonly fetchFn: FetchLike;

  constructor(options: JevHarnessOptions = {}) {
    this.apiKey = options.apiKey ?? process.env.OPENROUTER_API_KEY ?? "";
    this.endpoint = options.endpoint ?? JEV_DECISIONS_URL;
    this.model = options.model ?? JEV_DEFAULT_MODEL;
    this.maxRetries = options.maxRetries ?? JEV_DEFAULT_MAX_RETRIES;
    this.retryDelayMs = options.retryDelayMs ?? JEV_DEFAULT_RETRY_DELAY_MS;
    this.fetchFn = options.fetchFn ?? fetch;
  }

  private async requestWithRetry<T>(
    payload: Record<string, unknown>,
    parse: (data: DecisionsResponse) => T,
  ): Promise<T> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      if (attempt > 0) {
        await sleep(this.retryDelayMs);
      }
      try {
        const response = await this.fetchFn(this.endpoint, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        });

        const rawText = await response.text();
        let parsedJson: unknown;
        try {
          parsedJson = JSON.parse(rawText);
        } catch {
          throw new Error(`Invalid JSON from OpenRouter Decisions API (${response.status})`);
        }

        if (!response.ok) {
          const errObj = parsedJson as { error?: { message?: string } };
          const msg = errObj?.error?.message ?? rawText;
          throw new Error(`OpenRouter Decisions API error (${response.status}): ${msg}`);
        }

        return parse(parsedJson as DecisionsResponse);
      } catch (err) {
        lastError = err;
      }
    }
    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  }

  async bbox(
    question: string,
    image: Buffer,
  ): Promise<{ box: BoundingBox | null; confidence: number }> {
    const { width, height, mimeType } = readImageDimensions(image);
    const dataUrl = `data:${mimeType};base64,${image.toString("base64")}`;

    const payload = {
      model: this.model,
      state: [
        "Page screenshot:",
        {
          type: "image_url",
          image_url: { url: dataUrl },
        },
      ],
      questions: {
        present: {
          type: "noul",
          instructions: `Is the target UI element visible and unobstructed in the screenshot? (${question})`,
          criteria: {
            true: "The described interactive element is clearly visible and unobstructed in the page screenshot.",
            false:
              "The described element does not exist in the screenshot or is covered by a modal dialog or overlay.",
          },
        },
        target: {
          type: "box",
          instructions: `${question} in the Page screenshot`,
        },
      },
    };

    return this.requestWithRetry(payload, (data) => {
      const presentAnswer = data.answers?.present as DecisionsNoulAnswer | undefined;
      if (
        presentAnswer &&
        presentAnswer.type === "noul" &&
        typeof presentAnswer.noul === "number" &&
        presentAnswer.noul < JEV_PRESENCE_THRESHOLD
      ) {
        return { box: null, confidence: presentAnswer.noul };
      }

      const boxAnswer = data.answers?.target as DecisionsBoxAnswer | undefined;
      if (!boxAnswer || boxAnswer.type !== "box" || !boxAnswer.box) {
        throw new Error("Malformed Jev box answer");
      }

      const { top, bottom, left, right } = boxAnswer.box;
      const x = Math.round(left * width * 100) / 100;
      const y = Math.round(top * height * 100) / 100;
      const boxWidth = Math.round((right - left) * width * 100) / 100;
      const boxHeight = Math.round((bottom - top) * height * 100) / 100;

      if (boxWidth <= 0 || boxHeight <= 0) {
        return { box: null, confidence: boxAnswer.confidence };
      }

      return {
        box: { x, y, width: boxWidth, height: boxHeight },
        confidence: boxAnswer.confidence,
      };
    });
  }

  async choice(
    question: string,
    options: string[],
  ): Promise<{ index: number | null; confidence: number }> {
    if (options.length === 0) {
      return { index: null, confidence: 0 };
    }

    const criteria: Record<string, string> = {};
    for (let i = 0; i < options.length; i++) {
      criteria[String(i)] = options[i];
    }
    criteria.none = "None of the listed interactive elements match the target description.";

    const payload = {
      model: this.model,
      state: options.map((opt, idx) => `${idx}: ${opt}`).join("\n"),
      questions: {
        target: {
          type: "choice",
          instructions: question,
          criteria,
        },
      },
    };

    return this.requestWithRetry(payload, (data) => {
      const answer = data.answers?.target as DecisionsChoiceAnswer | undefined;
      if (!answer || answer.type !== "choice") {
        throw new Error("Malformed Jev choice answer");
      }

      if (answer.choice === "none") {
        return { index: null, confidence: answer.confidence };
      }

      const idx = Number.parseInt(answer.choice, 10);
      if (Number.isNaN(idx) || idx < 0 || idx >= options.length) {
        return { index: null, confidence: answer.confidence };
      }

      return { index: idx, confidence: answer.confidence };
    });
  }
}

export function createJevClient(options?: JevHarnessOptions): JevClient {
  return new JevHarness(options);
}
