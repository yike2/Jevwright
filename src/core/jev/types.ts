export type BoundingBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export interface JevClient {
  bbox(question: string, image: Buffer): Promise<{ box: BoundingBox | null; confidence: number }>;
  choice(question: string, options: string[]): Promise<{ index: number | null; confidence: number }>;
}

export type JevClientOptions = {
  apiKey?: string;
  model?: string;
  endpoint?: string;
  maxRetries?: number;
  fetchFn?: typeof fetch;
};

export class JevError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "JevError";
  }
}

export type ImageInfo = {
  width: number;
  height: number;
  format: "png" | "jpeg";
};
