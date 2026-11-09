import { describe, expect, it, vi } from "vitest";
import type { BrowserAdapter } from "@/core/browser/index.js";
import { QUESTION_PREFIX } from "@/core/asserter/constants.js";
import { ask } from "@/core/asserter/ask.js";
import type { JevClient } from "@/core/jev/index.js";

describe("ask", () => {
  it("returns the noul probability with the screenshot buffer and prefixed statement", async () => {
    const statement = "The page contains a Save button";
    const image = Buffer.from("shot-1");

    const screenshot = vi.fn<BrowserAdapter["screenshot"]>(async () => ({ ok: true, data: image }));
    const noul = vi.fn<JevClient["noul"]>(
      async (_question: string, _context: { image: Buffer } | { text: string }) => ({
        ok: true,
        data: { probability: 0.37 },
      }),
    );

    const result = await ask(statement, { screenshot }, { noul });

    expect(result).toEqual({ ok: true, data: { probability: 0.37 } });
    expect(screenshot).toHaveBeenCalledTimes(1);
    expect(screenshot).toHaveBeenCalledWith();
    expect(noul).toHaveBeenCalledTimes(1);
    expect(noul).toHaveBeenCalledWith(`${QUESTION_PREFIX}${statement}`, { image });
  });

  it("rethrows a screenshot error without calling noul", async () => {
    const screenshotError = new Error("screenshot failed");
    const screenshot = vi.fn<BrowserAdapter["screenshot"]>(async () => {
      throw screenshotError;
    });
    const noul = vi.fn<JevClient["noul"]>();

    await expect(ask("The page contains a Save button", { screenshot }, { noul })).rejects.toThrow(screenshotError);
    expect(screenshot).toHaveBeenCalledTimes(1);
    expect(noul).not.toHaveBeenCalled();
  });

  it("rethrows a noul error without swallowing it", async () => {
    const noulError = new Error("noul failed");
    const screenshot = vi.fn<BrowserAdapter["screenshot"]>(async () => ({ ok: true, data: Buffer.from("shot-2") }));
    const noul = vi.fn<JevClient["noul"]>(async () => {
      throw noulError;
    });

    await expect(ask("The page contains a Save button", { screenshot }, { noul })).rejects.toThrow(noulError);
    expect(screenshot).toHaveBeenCalledTimes(1);
    expect(noul).toHaveBeenCalledTimes(1);
  });

  describe("failure paths from asserter.md section 5", () => {
    it("returns the screenshot failure reason without calling noul", async () => {
      const screenshot = vi.fn<BrowserAdapter["screenshot"]>(async () => ({
        ok: false,
        reason: "Screenshot failed: page closed",
      }));
      const noul = vi.fn<JevClient["noul"]>();

      const result = await ask("The page contains a Save button", { screenshot }, { noul });

      expect(result).toEqual({ ok: false, reason: "Screenshot failed: page closed" });
      expect(screenshot).toHaveBeenCalledTimes(1);
      expect(noul).not.toHaveBeenCalled();
    });

    it("returns the noul failure reason after a successful screenshot", async () => {
      const screenshot = vi.fn<BrowserAdapter["screenshot"]>(async () => ({ ok: true, data: Buffer.from("shot-3") }));
      const noul = vi.fn<JevClient["noul"]>(async () => ({
        ok: false,
        reason: "Jev request timed out",
      }));

      const result = await ask("The page contains a Save button", { screenshot }, { noul });

      expect(result).toEqual({ ok: false, reason: "Jev request timed out" });
      expect(screenshot).toHaveBeenCalledTimes(1);
      expect(noul).toHaveBeenCalledTimes(1);
      expect(noul).toHaveBeenCalledWith(`${QUESTION_PREFIX}The page contains a Save button`, {
        image: Buffer.from("shot-3"),
      });
    });
  });
});
