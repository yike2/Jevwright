import type { BrowserAdapter, LaunchOptions } from "./types.js";

/** Launches Chromium for one Run and returns its Browser Adapter. */
export async function launchBrowser(options: LaunchOptions): Promise<BrowserAdapter> {
  const failed = { ok: false as const, reason: "", dialogs: [] };
  return {
    ready: async () => failed,
    isVisible: async () => false,
    screenshot: async () => Buffer.alloc(24),
    snapshot: async () => ({ url: "", title: "", viewport: { width: 0, height: 0 }, elements: [] }),
    perform: async () => failed,
    check: async () => failed,
    close: async () => Buffer.alloc(0),
  };
}
