import { launchBrowser } from "@/core/browser/index.js";

/** The browser launch of every Run: the browser container at `endpoint` when set (backend.md 1.6), else local. */
export function browserLauncher(endpoint: string | undefined): typeof launchBrowser {
  return endpoint ? (options) => launchBrowser({ ...options, endpoint }) : launchBrowser;
}
