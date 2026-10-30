import type { BoundingBox, JevClient } from "../locator/types.js";

export type { BoundingBox, JevClient };

export type FetchLike = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export type JevHarnessOptions = {
  apiKey?: string;
  endpoint?: string;
  model?: string;
  maxRetries?: number;
  retryDelayMs?: number;
  fetchFn?: FetchLike;
};

export type DecisionsChoiceAnswer = {
  type: "choice";
  choice: string;
  confidence: number;
  probabilities?: Record<string, number>;
};

export type DecisionsBoxAnswer = {
  type: "box";
  box: {
    top: number;
    bottom: number;
    left: number;
    right: number;
  };
  confidence: number;
};

export type DecisionsNoulAnswer = {
  type: "noul";
  noul: number;
};

export type DecisionsResponse = {
  id?: string;
  model: string;
  provider?: string;
  answers: Record<string, DecisionsChoiceAnswer | DecisionsBoxAnswer | DecisionsNoulAnswer>;
  usage?: {
    input_tokens: number;
    output_tokens: number;
    cost?: number;
  };
};

