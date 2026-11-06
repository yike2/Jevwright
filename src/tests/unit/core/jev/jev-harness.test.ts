import { describe, expect, it, vi } from "vitest";
import { createJevClient } from "@/core/jev/jev-harness.js";

describe("createJevClient", () => {
    it("sends the correct noul request body for text state", async () => {
        const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
            expect(init?.headers).toMatchObject({
                Authorization: "Bearer secret",
                "Content-Type": "application/json",
            });
            expect(init?.body).toBe(
                JSON.stringify({
                    model: "typesafe/jev-1.14",
                    state: ["hello"],
                    questions: {
                        target: {
                            type: "noul",
                            instructions: "Is the login button visible?",
                        },
                    },
                }),
            );

            return {
                ok: true,
                status: 200,
                headers: { get: () => null },
                text: async () =>
                    JSON.stringify({
                        id: "gen-dec-123",
                        model: "typesafe/jev-1.14",
                        provider: "TypeSafe",
                        answers: {
                            target: { type: "noul", noul: 0.82 },
                        },
                        usage: { input_tokens: 476, output_tokens: 70, cost: 0.00002 },
                    }),
            };
        }) as unknown as typeof fetch;

        const client = createJevClient({ apiKey: "secret", fetch: fetchImpl });
        const result = await client.noul("Is the login button visible?", { text: "hello" });

        expect(result).toEqual({ ok: true, data: { probability: 0.82 } });
    });

    it("returns a failed result when the answer object is missing", async () => {
        const fetchImpl = vi.fn(async () => ({
            ok: true,
            status: 200,
            headers: { get: () => null },
            text: async () =>
                JSON.stringify({
                    id: "gen-dec-123",
                    model: "typesafe/jev-1.14",
                    provider: "TypeSafe",
                    usage: { input_tokens: 476, output_tokens: 70, cost: 0.00002 },
                }),
        })) as unknown as typeof fetch;

        const client = createJevClient({ apiKey: "secret", fetch: fetchImpl });
        const result = await client.noul("Is it present?", { text: "hello" });

        expect(result).toEqual({ ok: false, reason: "Invalid Jev response: missing answer for target" });
    });

    it("returns a failed result when the target answer is missing", async () => {
        const fetchImpl = vi.fn(async () => ({
            ok: true,
            status: 200,
            headers: { get: () => null },
            text: async () =>
                JSON.stringify({
                    id: "gen-dec-123",
                    model: "typesafe/jev-1.14",
                    provider: "TypeSafe",
                    answers: { other: { type: "noul", noul: 0.8 } },
                    usage: { input_tokens: 476, output_tokens: 70, cost: 0.00002 },
                }),
        })) as unknown as typeof fetch;

        const client = createJevClient({ apiKey: "secret", fetch: fetchImpl });
        const result = await client.noul("Is it present?", { text: "hello" });

        expect(result).toEqual({ ok: false, reason: "Invalid Jev response: missing answer for target" });
    });

    it("returns a failed result when the noul answer is missing", async () => {
        const fetchImpl = vi.fn(async () => ({
            ok: true,
            status: 200,
            headers: { get: () => null },
            text: async () =>
                JSON.stringify({
                    id: "gen-dec-123",
                    model: "typesafe/jev-1.14",
                    provider: "TypeSafe",
                    answers: { target: { type: "noul" } },
                    usage: { input_tokens: 476, output_tokens: 70, cost: 0.00002 },
                }),
        })) as unknown as typeof fetch;

        const client = createJevClient({ apiKey: "secret", fetch: fetchImpl });
        const result = await client.noul("Is it present?", { text: "hello" });

        expect(result).toEqual({ ok: false, reason: "Invalid Jev response: missing noul answer" });
    });

    it("returns a failed result when noul is not a number", async () => {
        const fetchImpl = vi.fn(async () => ({
            ok: true,
            status: 200,
            headers: { get: () => null },
            text: async () =>
                JSON.stringify({
                    id: "gen-dec-123",
                    model: "typesafe/jev-1.14",
                    provider: "TypeSafe",
                    answers: { target: { type: "noul", noul: "0.7" } },
                    usage: { input_tokens: 476, output_tokens: 70, cost: 0.00002 },
                }),
        })) as unknown as typeof fetch;

        const client = createJevClient({ apiKey: "secret", fetch: fetchImpl });
        const result = await client.noul("Is it present?", { text: "hello" });

        expect(result).toEqual({ ok: false, reason: "Invalid Jev response: noul probability is not a number" });
    });

    it("returns a failed result when noul is outside the valid range", async () => {
        const fetchImpl = vi.fn(async () => ({
            ok: true,
            status: 200,
            headers: { get: () => null },
            text: async () =>
                JSON.stringify({
                    id: "gen-dec-123",
                    model: "typesafe/jev-1.14",
                    provider: "TypeSafe",
                    answers: { target: { type: "noul", noul: 1.5 } },
                    usage: { input_tokens: 476, output_tokens: 70, cost: 0.00002 },
                }),
        })) as unknown as typeof fetch;

        const client = createJevClient({ apiKey: "secret", fetch: fetchImpl });
        const result = await client.noul("Is it present?", { text: "hello" });

        expect(result).toEqual({ ok: false, reason: "Invalid Jev response: noul probability must be between 0 and 1" });
    });

    it("passes through a postDecisions error result", async () => {
        const fetchImpl = vi.fn(async () => ({
            ok: false,
            status: 401,
            headers: { get: () => null },
            text: async () => JSON.stringify({ error: "Unauthorized" }),
        })) as unknown as typeof fetch;

        const client = createJevClient({ apiKey: "secret", fetch: fetchImpl });
        const result = await client.noul("Is it present?", { text: "hello" });

        expect(result).toEqual({ ok: false, reason: "HTTP 401" });
    });

    it("returns Request aborted when the caller signal is aborted", async () => {
        const controller = new AbortController();
        controller.abort();

        const fetchImpl = vi.fn(async () => ({
            ok: true,
            status: 200,
            headers: { get: () => null },
            text: async () =>
                JSON.stringify({
                    id: "gen-dec-123",
                    model: "typesafe/jev-1.14",
                    provider: "TypeSafe",
                    answers: { target: { type: "noul", noul: 0.5 } },
                    usage: { input_tokens: 476, output_tokens: 70, cost: 0.00002 },
                }),
        })) as unknown as typeof fetch;

        const client = createJevClient({ apiKey: "secret", fetch: fetchImpl });
        const result = await client.noul("Is it present?", { text: "hello" }, controller.signal);

        expect(result).toEqual({ ok: false, reason: "Request aborted" });
        expect(fetchImpl).not.toHaveBeenCalled();
    });

    it("sends the correct image request body for image state", async () => {
        const image = Buffer.from("abc123", "utf8");
        const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
            expect(init?.body).toBe(
                JSON.stringify({
                    model: "typesafe/jev-1.14",
                    state: [{ type: "image_url", image_url: { url: `data:image/png;base64,${image.toString("base64")}` } }],
                    questions: {
                        target: {
                            type: "noul",
                            instructions: "Is the button visible?",
                        },
                    },
                }),
            );

            return {
                ok: true,
                status: 200,
                headers: { get: () => null },
                text: async () =>
                    JSON.stringify({
                        id: "gen-dec-456",
                        model: "typesafe/jev-1.14",
                        provider: "TypeSafe",
                        answers: { target: { type: "noul", noul: 0.91 } },
                        usage: { input_tokens: 512, output_tokens: 75, cost: 0.00003 },
                    }),
            };
        }) as unknown as typeof fetch;

        const client = createJevClient({ apiKey: "secret", fetch: fetchImpl });
        const result = await client.noul("Is the button visible?", { image });

        expect(result).toEqual({ ok: true, data: { probability: 0.91 } });
    });

    it("throws not implemented for bbox and choice stubs", async () => {
        const client = createJevClient({ apiKey: "secret", fetch: vi.fn() as unknown as typeof fetch });

        await expect(client.bbox("Find it", Buffer.from(""), { width: 100, height: 100 })).rejects.toThrow("not implemented");
        await expect(client.choice("Pick one", ["first", "second"])).rejects.toThrow("not implemented");
    });
});
