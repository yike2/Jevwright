import type { BrowserAction, BrowserAdapter, BrowserCheck, BrowserResult, ReadResult } from "@/core/browser/index.js";
import type { JevClient } from "@/core/jev/index.js";

export const OK: BrowserResult = { ok: true, dialogs: [] };
export const PNG = Buffer.from("png");
export const TRACE = Buffer.from("trace");

export const throwingJev: JevClient = {
  bbox: async () => {
    throw new Error("Jev should not be called yet");
  },
  choice: async () => {
    throw new Error("Jev should not be called yet");
  },
  noul: async () => {
    throw new Error("Jev should not be called yet");
  },
};

export const failed = (reason: string, dialogs: BrowserResult["dialogs"] = []): BrowserResult => ({
  ok: false,
  reason,
  dialogs,
});

type Script = {
  ready?: () => BrowserResult | Promise<BrowserResult>;
  perform?: (action: BrowserAction) => BrowserResult | Promise<BrowserResult>;
  check?: (check: BrowserCheck) => BrowserResult | Promise<BrowserResult>;
  screenshot?: () => ReadResult<Buffer> | Promise<ReadResult<Buffer>>;
  close?: () => Buffer | Promise<Buffer>;
};

export type Call =
  | { method: "ready" | "screenshot" | "snapshot" | "close" }
  | { method: "isVisible"; selector: string }
  | { method: "perform"; action: BrowserAction }
  | { method: "check"; check: BrowserCheck };

/** A BrowserAdapter that records every call; each method returns a success unless `script` says otherwise. */
export function fakeAdapter(script: Script = {}) {
  const calls: Call[] = [];
  const adapter: BrowserAdapter = {
    async ready() {
      calls.push({ method: "ready" });
      return script.ready ? script.ready() : OK;
    },
    async isVisible(selector) {
      calls.push({ method: "isVisible", selector });
      return { ok: true, data: true };
    },
    async screenshot() {
      calls.push({ method: "screenshot" });
      return script.screenshot ? script.screenshot() : { ok: true, data: PNG };
    },
    async snapshot() {
      calls.push({ method: "snapshot" });
      return { ok: false, reason: "No snapshot in the fake" };
    },
    async perform(action) {
      calls.push({ method: "perform", action });
      return script.perform ? script.perform(action) : OK;
    },
    async check(check) {
      calls.push({ method: "check", check });
      return script.check ? script.check(check) : OK;
    },
    async close() {
      calls.push({ method: "close" });
      return script.close ? script.close() : TRACE;
    },
  };
  return { adapter, calls };
}
