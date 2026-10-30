import type { BoundingBox, JevClient } from "../jev/types.js";

export type { BoundingBox, JevClient };

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

export type ElementAttributes = {
  type?: string;
  placeholder?: string;
  checked?: string | boolean;
  "aria-checked"?: string | boolean;
  disabled?: string | boolean;
  [key: string]: string | boolean | undefined;
};

export type SnapshotElement = {
  id: number;
  tag?: string;
  role: string;
  name: string;
  text: string;
  attrs: ElementAttributes;
  bbox: BoundingBox;
  hittable: boolean;
};

export type PageSnapshot = {
  url?: string;
  title?: string;
  viewport?: { width: number; height: number };
  elements: SnapshotElement[];
  texts?: string[];
};

export interface BrowserDriver {
  isVisible(selector: string, timeoutMs: number): Promise<boolean>;
  screenshot(): Promise<Buffer>;
  snapshot(): Promise<PageSnapshot>;
}

export class LocateError extends Error {
  attempts: LocateAttempt[];

  constructor(label: string, attempts: LocateAttempt[], selector?: string) {
    const lines = [`Could not locate "${label}":`];
    for (const attempt of attempts) {
      if (attempt.method === "selector" && selector) {
        lines.push(`  selector "${selector}" — ${attempt.reason ?? "failed"}`);
      } else {
        lines.push(`  ${attempt.method} — ${attempt.reason ?? "failed"}`);
      }
    }
    super(lines.join("\n"));
    this.name = "LocateError";
    this.attempts = attempts;
  }
}
