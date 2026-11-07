import { describe, expect, it, vi } from "vitest";
import type { BrowserAdapter } from "@/core/browser/index.js";
import { QUESTION_PREFIX } from "@/core/asserter/constants.js";
import { judge } from "@/core/asserter/judge.js";
import type { JevClient } from "@/core/jev/index.js";

describe("judge", () => {
    const statement = "The page contains a Save button";

    it("holds at exactly the pass threshold", async () => {
        const image = Buffer.from("shot-1");
        const screenshot = vi.fn<BrowserAdapter["screenshot"]>(async () => ({ ok: true, data: image }));
        const noul = vi.fn<JevClient["noul"]>(async (_question: string, context: { image: Buffer } | { text: string }) => ({
            ok: true,
            data: { probability: 0.8 },
        }));

        const result = await judge(statement, { screenshot }, { noul });

        expect(result).toEqual({ ok: true, probability: 0.8 });
        expect(screenshot).toHaveBeenCalledTimes(1);
        expect(screenshot).toHaveBeenCalledWith();
        expect(noul).toHaveBeenCalledTimes(1);
        expect(noul).toHaveBeenCalledWith(`${QUESTION_PREFIX}${statement}`, { image });
    });

    it("does not hold at exactly the fail threshold", async () => {
        const image = Buffer.from("shot-2");
        const screenshot = vi.fn<BrowserAdapter["screenshot"]>(async () => ({ ok: true, data: image }));
        const noul = vi.fn<JevClient["noul"]>(async () => ({ ok: true, data: { probability: 0.2 } }));

        const result = await judge(statement, { screenshot }, { noul });

        expect(result).toEqual({ ok: false, reason: "Statement does not hold (noul=0.2)", probability: 0.2 });
        expect(screenshot).toHaveBeenCalledTimes(1);
        expect(noul).toHaveBeenCalledTimes(1);
    });

    it("re-asks once when the first answer is uncertain and then holds", async () => {
        const firstImage = Buffer.from("shot-3");
        const secondImage = Buffer.from("shot-4");
        const screenshot = vi
            .fn<BrowserAdapter["screenshot"]>()
            .mockResolvedValueOnce({ ok: true, data: firstImage })
            .mockResolvedValueOnce({ ok: true, data: secondImage });
        const noul = vi
            .fn<JevClient["noul"]>()
            .mockResolvedValueOnce({ ok: true, data: { probability: 0.79 } })
            .mockResolvedValueOnce({ ok: true, data: { probability: 0.9 } });

        const result = await judge(statement, { screenshot }, { noul });

        expect(result).toEqual({ ok: true, probability: 0.9 });
        expect(screenshot).toHaveBeenCalledTimes(2);
        expect(noul).toHaveBeenCalledTimes(2);
        expect(noul).toHaveBeenNthCalledWith(1, `${QUESTION_PREFIX}${statement}`, { image: firstImage });
        expect(noul).toHaveBeenNthCalledWith(2, `${QUESTION_PREFIX}${statement}`, { image: secondImage });
    });

    it("re-asks once when the first answer is uncertain and then does not hold", async () => {
        const firstImage = Buffer.from("shot-5");
        const secondImage = Buffer.from("shot-6");
        const screenshot = vi
            .fn<BrowserAdapter["screenshot"]>()
            .mockResolvedValueOnce({ ok: true, data: firstImage })
            .mockResolvedValueOnce({ ok: true, data: secondImage });
        const noul = vi
            .fn<JevClient["noul"]>()
            .mockResolvedValueOnce({ ok: true, data: { probability: 0.21 } })
            .mockResolvedValueOnce({ ok: true, data: { probability: 0.1 } });

        const result = await judge(statement, { screenshot }, { noul });

        expect(result).toEqual({ ok: false, reason: "Statement does not hold (noul=0.1)", probability: 0.1 });
        expect(screenshot).toHaveBeenCalledTimes(2);
        expect(noul).toHaveBeenCalledTimes(2);
        expect(noul).toHaveBeenNthCalledWith(1, `${QUESTION_PREFIX}${statement}`, { image: firstImage });
        expect(noul).toHaveBeenNthCalledWith(2, `${QUESTION_PREFIX}${statement}`, { image: secondImage });
    });

    it("fails with the uncertain reason if both answers are uncertain", async () => {
        const firstImage = Buffer.from("shot-7");
        const secondImage = Buffer.from("shot-8");
        const screenshot = vi
            .fn<BrowserAdapter["screenshot"]>()
            .mockResolvedValueOnce({ ok: true, data: firstImage })
            .mockResolvedValueOnce({ ok: true, data: secondImage });
        const noul = vi
            .fn<JevClient["noul"]>()
            .mockResolvedValueOnce({ ok: true, data: { probability: 0.79 } })
            .mockResolvedValueOnce({ ok: true, data: { probability: 0.55 } });

        const result = await judge(statement, { screenshot }, { noul });

        expect(result).toEqual({
            ok: false,
            reason: "Statement is uncertain after 2 asks (noul=0.55)",
            probability: 0.55,
        });
        expect(screenshot).toHaveBeenCalledTimes(2);
        expect(noul).toHaveBeenCalledTimes(2);
    });

    it("returns the first ask failure reason without a probability", async () => {
        const screenshot = vi.fn<BrowserAdapter["screenshot"]>(async () => ({ ok: true, data: Buffer.from("shot-9") }));
        const noul = vi.fn<JevClient["noul"]>(async () => ({
            ok: false,
            reason: "Jev request timed out",
        }));

        const result = await judge(statement, { screenshot }, { noul });

        expect(result).toEqual({ ok: false, reason: "Jev request timed out" });
        expect(screenshot).toHaveBeenCalledTimes(1);
        expect(noul).toHaveBeenCalledTimes(1);
    });

    it("returns the second ask failure reason with the first probability included", async () => {
        const firstImage = Buffer.from("shot-10");
        const secondImage = Buffer.from("shot-11");
        const screenshot = vi
            .fn<BrowserAdapter["screenshot"]>()
            .mockResolvedValueOnce({ ok: true, data: firstImage })
            .mockResolvedValueOnce({ ok: true, data: secondImage });
        const noul = vi
            .fn<JevClient["noul"]>()
            .mockResolvedValueOnce({ ok: true, data: { probability: 0.55 } })
            .mockResolvedValueOnce({ ok: false, reason: "Jev request timed out" });

        const result = await judge(statement, { screenshot }, { noul });

        expect(result).toEqual({ ok: false, reason: "Jev request timed out", probability: 0.55 });
        expect(screenshot).toHaveBeenCalledTimes(2);
        expect(noul).toHaveBeenCalledTimes(2);
        expect(noul).toHaveBeenNthCalledWith(1, `${QUESTION_PREFIX}${statement}`, { image: firstImage });
        expect(noul).toHaveBeenNthCalledWith(2, `${QUESTION_PREFIX}${statement}`, { image: secondImage });
    });
});
