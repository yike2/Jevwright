import type { FieldReader } from "./fields.js";
import type { TestCase } from "./types.js";

export type BrowserState = Pick<TestCase, "headers" | "cookies" | "localStorage" | "sessionStorage">;

/** True when a cookie `domain` is `host` or a parent of it; a leading dot is ignored. */
export function cookieDomainMatches(domain: string, host: string): boolean {
  void domain;
  void host;
  return false;
}

/** Reads `headers`, `cookies`, `localStorage`, and `sessionStorage` from the root, reporting every problem. */
export function parseBrowserState(fields: FieldReader, baseUrl: string | undefined): BrowserState {
  void fields;
  void baseUrl;
  return {};
}
