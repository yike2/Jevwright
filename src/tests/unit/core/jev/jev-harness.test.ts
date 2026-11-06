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

    it("sends the correct choice request body and maps the selected key", async () => {
        const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
            expect(init?.body).toBe(
                JSON.stringify({
                    model: "typesafe/jev-1.14",
                    state: ["Candidate elements:\n0: Blue 'Sign in' button\n1: Green 'Submit' button\n2: Red 'Cancel' button"],
                    questions: {
                        target: {
                            type: "choice",
                            instructions: "Blue 'Sign in' button",
                            criteria: {
                                "0": "Blue 'Sign in' button",
                                "1": "Green 'Submit' button",
                                "2": "Red 'Cancel' button",
                            },
                        },
                        presence: {
                            type: "noul",
                            instructions: "Does any of the candidate elements match this description: Blue 'Sign in' button",
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
                        id: "gen-dec-choice-1",
                        model: "typesafe/jev-1.14",
                        provider: "TypeSafe",
                        answers: {
                            target: { type: "choice", choice: "2", probabilities: { "0": 0.1, "1": 0.2, "2": 0.7 }, confidence: 0.92 },
                            presence: { type: "noul", noul: 0.8 },
                        },
                        usage: { input_tokens: 500, output_tokens: 90, cost: 0.00004 },
                    }),
            };
        }) as unknown as typeof fetch;

        const client = createJevClient({ apiKey: "secret", fetch: fetchImpl });
        const result = await client.choice("Blue 'Sign in' button", ["Blue 'Sign in' button", "Green 'Submit' button", "Red 'Cancel' button"]);

        expect(result).toEqual({ ok: true, data: { index: 2, confidence: 0.92 } });
    });

    it("returns index null when the presence probability is below 0.5", async () => {
        const fetchImpl = vi.fn(async () => ({
            ok: true,
            status: 200,
            headers: { get: () => null },
            text: async () =>
                JSON.stringify({
                    id: "gen-dec-choice-2",
                    model: "typesafe/jev-1.14",
                    provider: "TypeSafe",
                    answers: {
                        target: { type: "choice", choice: "1", probabilities: { "0": 0.2, "1": 0.8 }, confidence: 0.91 },
                        presence: { type: "noul", noul: 0.49 },
                    },
                    usage: { input_tokens: 500, output_tokens: 90, cost: 0.00004 },
                }),
        })) as unknown as typeof fetch;

        const client = createJevClient({ apiKey: "secret", fetch: fetchImpl });
        const result = await client.choice("Blue 'Sign in' button", ["Blue 'Sign in' button", "Green 'Submit' button"]);

        expect(result).toEqual({ ok: true, data: { index: null, confidence: 0.91 } });
    });

    it("returns the selected index when presence is exactly 0.5", async () => {
        const fetchImpl = vi.fn(async () => ({
            ok: true,
            status: 200,
            headers: { get: () => null },
            text: async () =>
                JSON.stringify({
                    id: "gen-dec-choice-3",
                    model: "typesafe/jev-1.14",
                    provider: "TypeSafe",
                    answers: {
                        target: { type: "choice", choice: "0", probabilities: { "0": 0.9, "1": 0.1 }, confidence: 0.85 },
                        presence: { type: "noul", noul: 0.5 },
                    },
                    usage: { input_tokens: 500, output_tokens: 90, cost: 0.00004 },
                }),
        })) as unknown as typeof fetch;

        const client = createJevClient({ apiKey: "secret", fetch: fetchImpl });
        const result = await client.choice("Blue 'Sign in' button", ["Blue 'Sign in' button", "Green 'Submit' button"]);

        expect(result).toEqual({ ok: true, data: { index: 0, confidence: 0.85 } });
    });

    it.each([
        ["non-numeric choice key", { type: "choice", choice: "abc", probabilities: { "0": 0.3, "1": 0.7 }, confidence: 0.8 }, "Invalid Jev response: choice key is not a valid index"],
        ["out-of-range choice key", { type: "choice", choice: "3", probabilities: { "0": 0.3, "1": 0.7 }, confidence: 0.8 }, "Invalid Jev response: choice index out of range"],
        ["invalid confidence", { type: "choice", choice: "1", probabilities: { "0": 0.3, "1": 0.7 }, confidence: 1.2 }, "Invalid Jev response: confidence must be between 0 and 1"],
        ["missing presence answer", { type: "choice", choice: "1", probabilities: { "0": 0.3, "1": 0.7 }, confidence: 0.8 }, "Invalid Jev response: missing answer for presence"],
    ])("rejects malformed choice responses: %s", async (_label, targetAnswer, expectedReason) => {
        const fetchImpl = vi.fn(async () => ({
            ok: true,
            status: 200,
            headers: { get: () => null },
            text: async () =>
                JSON.stringify({
                    id: "gen-dec-choice-4",
                    model: "typesafe/jev-1.14",
                    provider: "TypeSafe",
                    answers:
                        expectedReason === "Invalid Jev response: missing answer for presence"
                            ? { target: targetAnswer }
                            : { target: targetAnswer, presence: { type: "noul", noul: 0.2 } },
                    usage: { input_tokens: 500, output_tokens: 90, cost: 0.00004 },
                }),
        })) as unknown as typeof fetch;

        const client = createJevClient({ apiKey: "secret", fetch: fetchImpl });
        const result = await client.choice("Blue 'Sign in' button", ["Blue 'Sign in' button", "Green 'Submit' button"]);

        expect(result).toEqual({ ok: false, reason: expectedReason });
    });

    it("returns an error when presence probability is 0.2 but the choice key is invalid", async () => {
        const fetchImpl = vi.fn(async () => ({
            ok: true,
            status: 200,
            headers: { get: () => null },
            text: async () =>
                JSON.stringify({
                    id: "gen-dec-choice-5",
                    model: "typesafe/jev-1.14",
                    provider: "TypeSafe",
                    answers: {
                        target: { type: "choice", choice: "abc", probabilities: { "0": 0.3, "1": 0.7 }, confidence: 0.91 },
                        presence: { type: "noul", noul: 0.2 },
                    },
                    usage: { input_tokens: 500, output_tokens: 90, cost: 0.00004 },
                }),
        })) as unknown as typeof fetch;

        const client = createJevClient({ apiKey: "secret", fetch: fetchImpl });
        const result = await client.choice("Blue 'Sign in' button", ["Blue 'Sign in' button", "Green 'Submit' button"]);

        expect(result).toEqual({ ok: false, reason: "Invalid Jev response: choice key is not a valid index" });
    });

    it("returns a failed result when no options are provided", async () => {
        const fetchImpl = vi.fn() as unknown as typeof fetch;

        const client = createJevClient({ apiKey: "secret", fetch: fetchImpl });
        const result = await client.choice("Blue 'Sign in' button", []);

        expect(result).toEqual({ ok: false, reason: "Invalid Jev response: choice options must not be empty" });
        expect(fetchImpl).not.toHaveBeenCalled();
    });

    it("passes through a postDecisions error result for choice", async () => {
        const fetchImpl = vi.fn(async () => ({
            ok: false,
            status: 401,
            headers: { get: () => null },
            text: async () => JSON.stringify({ error: "Unauthorized" }),
        })) as unknown as typeof fetch;

        const client = createJevClient({ apiKey: "secret", fetch: fetchImpl });
        const result = await client.choice("Blue 'Sign in' button", ["Blue 'Sign in' button", "Green 'Submit' button"]);

        expect(result).toEqual({ ok: false, reason: "HTTP 401" });
    });

    it("returns Request aborted when the choice caller signal is aborted", async () => {
        const controller = new AbortController();
        controller.abort();

        const fetchImpl = vi.fn(async () => ({
            ok: true,
            status: 200,
            headers: { get: () => null },
            text: async () =>
                JSON.stringify({
                    id: "gen-dec-choice-6",
                    model: "typesafe/jev-1.14",
                    provider: "TypeSafe",
                    answers: {
                        target: { type: "choice", choice: "1", probabilities: { "0": 0.3, "1": 0.7 }, confidence: 0.8 },
                        presence: { type: "noul", noul: 0.8 },
                    },
                    usage: { input_tokens: 500, output_tokens: 90, cost: 0.00004 },
                }),
        })) as unknown as typeof fetch;

        const client = createJevClient({ apiKey: "secret", fetch: fetchImpl });
        const result = await client.choice("Blue 'Sign in' button", ["Blue 'Sign in' button", "Green 'Submit' button"], controller.signal);

        expect(result).toEqual({ ok: false, reason: "Request aborted" });
        expect(fetchImpl).not.toHaveBeenCalled();
    });

    it("throws not implemented for bbox stub", async () => {
        const client = createJevClient({ apiKey: "secret", fetch: vi.fn() as unknown as typeof fetch });

        await expect(client.bbox("Find it", Buffer.from(""), { width: 100, height: 100 })).rejects.toThrow("not implemented");
    });
});
