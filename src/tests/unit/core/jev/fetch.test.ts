import { describe, expect, it, vi } from "vitest";
import { postDecisions, type FetchImplementation, type JevDecisionRequest } from "@/core/jev/fetch.js";

const request: JevDecisionRequest = {
  model: "typesafe/jev-1.14",
  state: ["hello", { type: "image_url", image_url: { url: "data:image/png;base64,abc" } }],
  questions: {
    target: { type: "box", instructions: "Find the login button" },
  },
};

describe("postDecisions", () => {
  it("returns parsed JSON on success", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ status: "ok", confidence: 0.9 }),
    })) as unknown as FetchImplementation;

    const result = await postDecisions(request, "secret", fetchImpl, undefined, { delay: async () => undefined });

    expect(result).toEqual({ ok: true, data: { status: "ok", confidence: 0.9 } });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("does not retry on 401", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: false,
      status: 401,
      text: async () => JSON.stringify({ error: "Unauthorized" }),
    })) as unknown as FetchImplementation;

    const result = await postDecisions(request, "secret", fetchImpl, undefined, { delay: async () => undefined });

    expect(result).toEqual({ ok: false, reason: "HTTP 401" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("retries 429 and succeeds", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        headers: { get: () => "1" },
        text: async () => JSON.stringify({ error: "rate limited" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ choice: 0 }),
      }) as unknown as FetchImplementation;

    const delay = vi.fn(async () => undefined);
    const result = await postDecisions(request, "secret", fetchImpl, undefined, { delay });

    expect(result).toEqual({ ok: true, data: { choice: 0 } });
    expect(delay).toHaveBeenCalledTimes(1);
    expect(delay).toHaveBeenCalledWith(1000, undefined);
  });

  it("caps Retry-After at 2s", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        headers: { get: () => "5" },
        text: async () => JSON.stringify({ error: "rate limited" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ ok: true }),
      }) as unknown as FetchImplementation;

    const delay = vi.fn(async () => undefined);
    const result = await postDecisions(request, "secret", fetchImpl, undefined, { delay });

    expect(result).toEqual({ ok: true, data: { ok: true } });
    expect(delay).toHaveBeenCalledWith(2000, undefined);
  });

  it("exhausts retries on 5xx responses", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: false,
      status: 503,
      headers: { get: () => null },
      text: async () => JSON.stringify({ error: "temporary" }),
    })) as unknown as FetchImplementation;

    const delay = vi.fn(async () => undefined);
    const result = await postDecisions(request, "secret", fetchImpl, undefined, { delay, maxRetries: 2 });

    expect(result).toEqual({ ok: false, reason: "HTTP 503" });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(delay).toHaveBeenCalledTimes(2);
  });

  it("retries on network errors", async () => {
    const fetchImpl = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("network down"))
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ ok: true }),
      }) as unknown as FetchImplementation;

    const delay = vi.fn(async () => undefined);
    const result = await postDecisions(request, "secret", fetchImpl, undefined, { delay, maxRetries: 1 });

    expect(result).toEqual({ ok: true, data: { ok: true } });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("retries on malformed JSON and then fails", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => "not-json",
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => "still-not-json",
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => "still-not-json",
      }) as unknown as FetchImplementation;

    const delay = vi.fn(async () => undefined);
    const result = await postDecisions(request, "secret", fetchImpl, undefined, { delay, maxRetries: 2 });

    expect(result).toEqual({ ok: false, reason: "Unparseable JSON body" });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("aborts when the caller signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();

    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ ok: true }),
    })) as unknown as FetchImplementation;

    const result = await postDecisions(request, "secret", fetchImpl, controller.signal, {
      delay: async () => undefined,
    });

    expect(result).toEqual({ ok: false, reason: "Request aborted" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("times out then succeeds", async () => {
    vi.useFakeTimers();

    try {
      const fetchImpl = vi
        .fn()
        .mockImplementationOnce(async (_url: string, init?: RequestInit) => {
          await new Promise<void>((resolve, reject) => {
            init?.signal?.addEventListener(
              "abort",
              () => reject(new DOMException("The operation was aborted", "AbortError")),
              { once: true },
            );
            setTimeout(resolve, 100);
          });

          return { ok: true, status: 200, text: async () => JSON.stringify({ ok: true }) };
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          text: async () => JSON.stringify({ ok: true }),
        }) as unknown as FetchImplementation;

      const delay = vi.fn(async () => undefined);
      const promise = postDecisions(request, "secret", fetchImpl, undefined, { delay, timeoutMs: 50, maxRetries: 1 });

      await vi.advanceTimersByTimeAsync(200);
      const result = await promise;

      expect(result).toEqual({ ok: true, data: { ok: true } });
      expect(fetchImpl).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("times out on all attempts with the timeout reason", async () => {
    vi.useFakeTimers();

    try {
      const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
        if (init?.signal?.aborted) {
          throw new DOMException("The operation was aborted", "AbortError");
        }

        await new Promise<void>((resolve, reject) => {
          init?.signal?.addEventListener(
            "abort",
            () => reject(new DOMException("The operation was aborted", "AbortError")),
            { once: true },
          );
          setTimeout(resolve, 1000);
        });

        return { ok: true, status: 200, text: async () => JSON.stringify({ ok: true }) };
      }) as unknown as FetchImplementation;

      const delay = vi.fn(async () => undefined);
      const promise = postDecisions(request, "secret", fetchImpl, undefined, { delay, timeoutMs: 50, maxRetries: 2 });

      await vi.advanceTimersByTimeAsync(500);
      const result = await promise;

      expect(result).toEqual({ ok: false, reason: "Request timed out after 50ms" });
    } finally {
      vi.useRealTimers();
    }
  });

  it("returns Request aborted without waiting if the caller aborts before the retry delay", async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 429,
      headers: { get: () => null },
      text: async () => JSON.stringify({ error: "rate limited" }),
    }) as unknown as FetchImplementation;

    const controller = new AbortController();
    const delay = vi.fn(async (_ms: number, signal?: AbortSignal) => {
      if (signal) {
        await new Promise<void>((_, reject) => {
          signal.addEventListener("abort", () => reject(new DOMException("Request aborted", "AbortError")), {
            once: true,
          });
        });
      }
    });

    const promise = postDecisions(request, "secret", fetchImpl, controller.signal, { delay, maxRetries: 2 });
    controller.abort();

    await expect(promise).resolves.toEqual({ ok: false, reason: "Request aborted" });
    expect(delay).not.toHaveBeenCalled();
  });

  it("returns Request aborted if the caller aborts during the retry delay", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      headers: { get: () => null },
      text: async () => JSON.stringify({ error: "rate limited" }),
    }) as unknown as FetchImplementation;

    const controller = new AbortController();
    const delay = vi.fn(
      (_ms: number, signal?: AbortSignal) =>
        new Promise<void>((_, reject) => {
          signal?.addEventListener("abort", () => reject(new DOMException("Request aborted", "AbortError")), {
            once: true,
          });
          controller.abort(); // abort while we are waiting
        }),
    );

    const result = await postDecisions(request, "secret", fetchImpl, controller.signal, { delay, maxRetries: 2 });

    expect(result).toEqual({ ok: false, reason: "Request aborted" });
    expect(delay).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("sends the exact request body and bearer token", async () => {
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      expect(init?.headers).toMatchObject({
        Authorization: "Bearer secret",
        "Content-Type": "application/json",
      });
      expect(init?.body).toBe(JSON.stringify(request));
      return { ok: true, status: 200, text: async () => JSON.stringify({ ok: true }) };
    }) as unknown as FetchImplementation;

    const result = await postDecisions(request, "secret", fetchImpl, undefined, { delay: async () => undefined });

    expect(result).toEqual({ ok: true, data: { ok: true } });
  });
});
