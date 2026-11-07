import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BrowserAdapter } from "@/core/browser/index.js";
import { PASS_THRESHOLD, POLL_INTERVAL_MS, QUESTION_PREFIX } from "@/core/asserter/constants.js";
import { waitUntil } from "@/core/asserter/wait-until.js";
import type { JevClient } from "@/core/jev/index.js";

describe("waitUntil", () => {
    const condition = "The page contains a Save button";

    beforeEach(() => {
        vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it("polls immediately and waits the interval between polls", async () => {
        const firstImage = Buffer.from("shot-1");
        const secondImage = Buffer.from("shot-2");
        const screenshot = vi
            .fn<BrowserAdapter["screenshot"]>()
            .mockResolvedValueOnce({ ok: true, data: firstImage })
            .mockResolvedValueOnce({ ok: true, data: secondImage });
        const noul = vi
            .fn<JevClient["noul"]>()
            .mockResolvedValueOnce({ ok: true, data: { probability: 0.1 } })
            .mockResolvedValueOnce({ ok: true, data: { probability: PASS_THRESHOLD } });

        const promise = waitUntil(condition, 2000, { screenshot }, { noul });
        await vi.advanceTimersByTimeAsync(0);

        expect(noul).toHaveBeenCalledTimes(1);
        expect(noul).toHaveBeenNthCalledWith(1, `${QUESTION_PREFIX}${condition}`, { image: firstImage });

        await vi.advanceTimersByTimeAsync(999);
        expect(noul).toHaveBeenCalledTimes(1);

        await vi.advanceTimersByTimeAsync(1);
        expect(noul).toHaveBeenCalledTimes(2);
        expect(noul).toHaveBeenNthCalledWith(2, `${QUESTION_PREFIX}${condition}`, { image: secondImage });

        await expect(promise).resolves.toEqual({ ok: true, probability: PASS_THRESHOLD });
        expect(screenshot).toHaveBeenCalledTimes(2);
    });

    it("stops as soon as a poll reaches the pass threshold", async () => {
        const firstImage = Buffer.from("shot-3");
        const secondImage = Buffer.from("shot-4");
        const screenshot = vi
            .fn<BrowserAdapter["screenshot"]>()
            .mockResolvedValueOnce({ ok: true, data: firstImage })
            .mockResolvedValueOnce({ ok: true, data: secondImage });
        const noul = vi
            .fn<JevClient["noul"]>()
            .mockResolvedValueOnce({ ok: true, data: { probability: 0.5 } })
            .mockResolvedValueOnce({ ok: true, data: { probability: PASS_THRESHOLD } });

        const resultPromise = waitUntil(condition, 5000, { screenshot }, { noul });
        await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);

        const result = await resultPromise;

        expect(result).toEqual({ ok: true, probability: PASS_THRESHOLD });
        expect(screenshot).toHaveBeenCalledTimes(2);
        expect(noul).toHaveBeenCalledTimes(2);

        await vi.advanceTimersByTimeAsync(5000);
        expect(screenshot).toHaveBeenCalledTimes(2);
        expect(noul).toHaveBeenCalledTimes(2);
    });

    it("keeps polling when the probability is below the fail threshold", async () => {
        const firstImage = Buffer.from("shot-5");
        const secondImage = Buffer.from("shot-6");
        const screenshot = vi
            .fn<BrowserAdapter["screenshot"]>()
            .mockResolvedValueOnce({ ok: true, data: firstImage })
            .mockResolvedValueOnce({ ok: true, data: secondImage });
        const noul = vi
            .fn<JevClient["noul"]>()
            .mockResolvedValueOnce({ ok: true, data: { probability: 0.1 } })
            .mockResolvedValueOnce({ ok: true, data: { probability: 0.8 } });

        const resultPromise = waitUntil(condition, 1500, { screenshot }, { noul });
        await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);

        const result = await resultPromise;

        expect(result).toEqual({ ok: true, probability: 0.8 });
        expect(screenshot).toHaveBeenCalledTimes(2);
        expect(noul).toHaveBeenCalledTimes(2);
    });

    it("times out when the deadline is reached and includes the last probability", async () => {
        const start = Date.now();
        const firstImage = Buffer.from("shot-7");
        const secondImage = Buffer.from("shot-8");
        const thirdImage = Buffer.from("shot-9");
        const fourthImage = Buffer.from("shot-10");
        const screenshot = vi
            .fn<BrowserAdapter["screenshot"]>()
            .mockResolvedValueOnce({ ok: true, data: firstImage })
            .mockResolvedValueOnce({ ok: true, data: secondImage })
            .mockResolvedValueOnce({ ok: true, data: thirdImage })
            .mockResolvedValueOnce({ ok: true, data: fourthImage });
        const noul = vi
            .fn<JevClient["noul"]>()
            .mockResolvedValueOnce({ ok: true, data: { probability: 0.1 } })
            .mockResolvedValueOnce({ ok: true, data: { probability: 0.2 } })
            .mockResolvedValueOnce({ ok: true, data: { probability: 0.4 } })
            .mockResolvedValueOnce({ ok: true, data: { probability: 0.5 } });

        const resultPromise = waitUntil(condition, 3000, { screenshot }, { noul });
        await vi.advanceTimersByTimeAsync(3000);
        const result = await resultPromise;

        expect(result).toEqual({
            ok: false,
            reason: "Condition did not hold within 3000ms (last noul=0.5)",
            probability: 0.5,
        });
        expect(screenshot).toHaveBeenCalledTimes(4);
        expect(noul).toHaveBeenCalledTimes(4);
        expect(noul).toHaveBeenNthCalledWith(1, `${QUESTION_PREFIX}${condition}`, { image: firstImage });
        expect(noul).toHaveBeenNthCalledWith(2, `${QUESTION_PREFIX}${condition}`, { image: secondImage });
        expect(noul).toHaveBeenNthCalledWith(3, `${QUESTION_PREFIX}${condition}`, { image: thirdImage });
        expect(noul).toHaveBeenNthCalledWith(4, `${QUESTION_PREFIX}${condition}`, { image: fourthImage });
        expect(Date.now()).toBe(start + 3000);
    });

    it("times out on the first poll when timeoutMs is 0", async () => {
        const screenshot = vi.fn<BrowserAdapter["screenshot"]>(async () => ({ ok: true, data: Buffer.from("shot-11") }));
        const noul = vi.fn<JevClient["noul"]>(async () => ({ ok: true, data: { probability: 0.1 } }));

        const result = await waitUntil(condition, 0, { screenshot }, { noul });

        expect(result).toEqual({
            ok: false,
            reason: "Condition did not hold within 0ms (last noul=0.1)",
            probability: 0.1,
        });
        expect(screenshot).toHaveBeenCalledTimes(1);
        expect(noul).toHaveBeenCalledTimes(1);
    });

    it("returns the Jev failure reason immediately on the first poll", async () => {
        const screenshot = vi.fn<BrowserAdapter["screenshot"]>(async () => ({ ok: true, data: Buffer.from("shot-12") }));
        const noul = vi.fn<JevClient["noul"]>(async () => ({ ok: false, reason: "Jev request timed out" }));

        const result = await waitUntil(condition, 10000, { screenshot }, { noul });

        expect(result).toEqual({ ok: false, reason: "Jev request timed out" });
        expect(screenshot).toHaveBeenCalledTimes(1);
        expect(noul).toHaveBeenCalledTimes(1);
    });

    it("returns the Jev failure reason with the previous probability on a later poll", async () => {
        const firstImage = Buffer.from("shot-13");
        const secondImage = Buffer.from("shot-14");
        const screenshot = vi
            .fn<BrowserAdapter["screenshot"]>()
            .mockResolvedValueOnce({ ok: true, data: firstImage })
            .mockResolvedValueOnce({ ok: true, data: secondImage });
        const noul = vi
            .fn<JevClient["noul"]>()
            .mockResolvedValueOnce({ ok: true, data: { probability: 0.4 } })
            .mockResolvedValueOnce({ ok: false, reason: "Jev request timed out" });

        const resultPromise = waitUntil(condition, 2000, { screenshot }, { noul });
        await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);

        const result = await resultPromise;

        expect(result).toEqual({ ok: false, reason: "Jev request timed out", probability: 0.4 });
        expect(screenshot).toHaveBeenCalledTimes(2);
        expect(noul).toHaveBeenCalledTimes(2);
        expect(noul).toHaveBeenNthCalledWith(1, `${QUESTION_PREFIX}${condition}`, { image: firstImage });
        expect(noul).toHaveBeenNthCalledWith(2, `${QUESTION_PREFIX}${condition}`, { image: secondImage });
    });
});
