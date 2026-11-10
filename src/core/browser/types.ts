export type LaunchOptions = {
  headed: boolean;
  baseUrl?: string; // TestCase.baseUrl
  timeoutMs: number; // TestCase.timeoutMs
  network?: Network; // default "any"
};

// "public" aborts every request to a non-public address (browser-adapter.md 1.12).
export type Network = "any" | "public";

export type ElementRef = { selector: string } | { snapshotId: number };

export type DialogResponse = { accept: boolean; text?: string; message?: string };

export type BrowserAction =
  | { action: "open"; url: string; dialog?: DialogResponse }
  | { action: "back" | "forward" | "reload"; dialog?: DialogResponse }
  | { action: "press"; key: string; dialog?: DialogResponse }
  | { action: "scroll"; direction: "up" | "down" | "left" | "right"; distance: number }
  | { action: "sleep"; ms: number }
  | { action: "click" | "doubleClick" | "rightClick" | "hover"; element: ElementRef; dialog?: DialogResponse }
  | { action: "input"; element: ElementRef; value: string; dialog?: DialogResponse }
  | { action: "switchTab"; url: string };

export type BrowserCheck =
  | { check: "visible"; selector: string }
  | { check: "text"; selector: string; text: string }
  | { check: "url"; url: string };

export type DialogRecord = {
  type: "alert" | "confirm" | "prompt" | "beforeunload";
  message: string;
  answer: "accepted" | "dismissed";
  expected: boolean; // false for an Unexpected dialog
};

export type BrowserResult =
  { ok: true; dialogs: DialogRecord[] } | { ok: false; reason: string; dialogs: DialogRecord[] };

export type ReadResult<T> = { ok: true; data: T } | { ok: false; reason: string };

export type BoundingBox = { x: number; y: number; width: number; height: number };

export type SnapshotElement = {
  id: number;
  tag: string;
  role: string;
  name: string;
  text?: string;
  attrs: Record<string, string | boolean>;
  bbox: BoundingBox;
  hittable: boolean;
};

export type PageSnapshot = {
  url: string;
  title: string;
  viewport: { width: number; height: number };
  elements: SnapshotElement[];
};

export interface BrowserAdapter {
  ready(): Promise<BrowserResult>;
  isVisible(selector: string, timeoutMs: number): Promise<ReadResult<boolean>>;
  screenshot(): Promise<ReadResult<Buffer>>;
  snapshot(): Promise<ReadResult<PageSnapshot>>;
  perform(action: BrowserAction): Promise<BrowserResult>;
  check(check: BrowserCheck): Promise<BrowserResult>;
  close(): Promise<Buffer>; // trace zip
}
