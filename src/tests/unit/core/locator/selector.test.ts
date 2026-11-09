import { describe, expect, it } from "vitest";
import { SELECTOR_PROBE_MS } from "@/core/locator/constants.js";
import { runSelector } from "@/core/locator/selector.js";
import type { LocateRequest } from "@/core/locator/types.js";

const baseRequest = (overrides: Partial<LocateRequest> = {}): LocateRequest => ({
  action: "click",
  selector: "#login",
  timeoutMs: 5000,
  ...overrides,
});

describe("runSelector", () => {
  it("uses request.timeoutMs when selector is the only field", async () => {
    let seen: { selector: string; timeoutMs: number } | undefined;
    const adapter = {
      isVisible: async (selector: string, timeoutMs: number) => {
        seen = { selector, timeoutMs };
        return { ok: true as const, data: true };
      },
    };

    const result = await runSelector(baseRequest(), adapter);

    expect(seen).toEqual({ selector: "#login", timeoutMs: 5000 });
    expect(result.attempt.ok).toBe(true);
    expect(result.element).toEqual({ selector: "#login" });
    expect(result.attempt.method).toBe("selector");
    expect(result.attempt.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("uses SELECTOR_PROBE_MS when selector and target are present and timeoutMs is 15000", async () => {
    let seen: { selector: string; timeoutMs: number } | undefined;
    const adapter = {
      isVisible: async (selector: string, timeoutMs: number) => {
        seen = { selector, timeoutMs };
        return { ok: true as const, data: true };
      },
    };

    const request = baseRequest({ target: "Login button", timeoutMs: 15000 });
    await runSelector(request, adapter);

    expect(seen).toEqual({ selector: "#login", timeoutMs: SELECTOR_PROBE_MS });
  });

  it("uses the smaller timeout when selector and target are present and timeoutMs is 1000", async () => {
    let seen: { selector: string; timeoutMs: number } | undefined;
    const adapter = {
      isVisible: async (selector: string, timeoutMs: number) => {
        seen = { selector, timeoutMs };
        return { ok: true as const, data: true };
      },
    };

    const request = baseRequest({ target: "Login button", timeoutMs: 1000 });
    await runSelector(request, adapter);

    expect(seen).toEqual({ selector: "#login", timeoutMs: 1000 });
  });

  it("fails with the adapter reason when isVisible returns ok false", async () => {
    const adapter = {
      isVisible: async () => ({ ok: false as const, reason: "element is hidden" }),
    };

    const result = await runSelector(baseRequest(), adapter);

    expect(result.attempt.ok).toBe(false);
    expect(result.attempt.reason).toContain("element is hidden");
    expect(result.attempt.method).toBe("selector");
    expect(result.attempt.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("fails with a reason containing the selector, not visible, and the timeout when isVisible returns data false", async () => {
    const adapter = {
      isVisible: async () => ({ ok: true as const, data: false }),
    };

    const result = await runSelector(baseRequest({ target: "Login button", timeoutMs: 7500 }), adapter);

    expect(result.attempt.ok).toBe(false);
    expect(result.attempt.reason).toContain("#login");
    expect(result.attempt.reason).toContain("not visible");
    expect(result.attempt.reason).toContain(String(SELECTOR_PROBE_MS));
    expect(result.attempt.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("succeeds and does not include confidence or snapshot data", async () => {
    const adapter = {
      isVisible: async () => ({ ok: true as const, data: true }),
    };

    const result = await runSelector(baseRequest(), adapter);

    expect(result.attempt.ok).toBe(true);
    expect(result.attempt.method).toBe("selector");
    expect(result.attempt.confidence).toBeUndefined();
    expect(result.snapshot).toBeUndefined();
    expect(result.element).toEqual({ selector: "#login" });
    expect(result.attempt.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("throws when selector is missing", async () => {
    const adapter = {
      isVisible: async () => ({ ok: true as const, data: true }),
    };

    await expect(runSelector({ action: "click", timeoutMs: 1000 }, adapter)).rejects.toThrow();
  });

  it("propagates a thrown adapter error", async () => {
    const adapter = {
      isVisible: async () => {
        throw new Error("browser disconnected");
      },
    };

    await expect(runSelector(baseRequest(), adapter)).rejects.toThrow("browser disconnected");
  });
});
