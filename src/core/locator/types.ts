export type BoundingBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type SnapshotElementAttrs = {
  type?: string;
  placeholder?: string;
  disabled?: boolean;
  checked?: boolean;
  "aria-checked"?: string | boolean;
  [key: string]: unknown;
};

export type SnapshotElement = {
  id: number;
  role: string;
  name?: string;
  text?: string;
  attrs?: SnapshotElementAttrs;
  bbox: BoundingBox;
  hittable: boolean;
};

export type PageSnapshot = {
  url?: string;
  viewport?: { width: number; height: number };
  elements: SnapshotElement[];
  texts?: string[];
};

export type LocateAction = "click" | "doubleClick" | "rightClick" | "hover" | "input";

export type LocateRequest = {
  action: LocateAction;
  selector?: string;
  target?: string;
  timeoutMs: number;
};

export type LocateMethod = "selector" | "visual" | "dom";

export type LocateAttempt = {
  method: LocateMethod;
  ok: boolean;
  durationMs: number;
  confidence?: number;
  reason?: string;
};

export type LocateResult = {
  method: LocateMethod;
  elementId?: number;
  confidence?: number;
  durationMs: number;
  attempts: LocateAttempt[];
};

export interface JevClient {
  bbox(question: string, image: Buffer): Promise<{ box: BoundingBox | null; confidence: number }>;
  choice(question: string, options: string[]): Promise<{ index: number | null; confidence: number }>;
}

export interface BrowserDriver {
  isVisible(selector: string, timeoutMs: number): Promise<boolean>;
  screenshot(): Promise<Buffer>;
  snapshot(): Promise<PageSnapshot>;
}

