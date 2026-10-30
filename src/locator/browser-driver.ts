// What the Element Locator needs from the Browser Driver. The real driver
// (Playwright) is not built yet; tests use test/support/fixture-driver.ts.

export interface Screenshot {
  /** PNG bytes of the viewport. One image pixel is one CSS pixel. */
  png: Uint8Array;
  width: number;
  height: number;
}

/** An interactive element as the Browser Driver sees it. */
export interface ElementSnapshot {
  /** Stable id for this element within one page snapshot. */
  id: string;
  tag: string;
  role: string | null;
  /** Accessible-ish name: aria-label, label text, placeholder, or text. */
  name: string;
  text: string;
  attributes: Record<string, string>;
  /** The nearest container (row, dialog, form, ...) and its heading or text. */
  context: string;
  /** Viewport CSS pixels. */
  bbox: { x: number; y: number; width: number; height: number };
  /** True when something else (e.g. a modal backdrop) covers its center. */
  obscured: boolean;
}

export interface BrowserDriver {
  screenshot(): Promise<Screenshot>;
  interactiveElements(): Promise<ElementSnapshot[]>;
  /** Every interactive element matching a CSS selector, in document order. */
  query(selector: string): Promise<ElementSnapshot[]>;
  /** The interactive element a click at this viewport point would hit, if any. */
  elementAt(x: number, y: number): Promise<ElementSnapshot | null>;
}
