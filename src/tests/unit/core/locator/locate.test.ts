import { describe, expect, it } from "vitest";
import type { BoundingBox, BrowserAdapter, PageSnapshot, ReadResult, SnapshotElement } from "@/core/browser/index.js";
import { locate } from "@/core/locator/locate.js";
import { LocateError } from "@/core/locator/types.js";
import type { LocateRequest } from "@/core/locator/types.js";
import type { JevClient } from "@/core/jev/index.js";

type ChoiceResult = ReadResult<{ index: number | null; confidence: number }>;
type BboxResult = ReadResult<{ box: BoundingBox | null; confidence: number }>;

const makeElement = (overrides: Partial<SnapshotElement> = {}): SnapshotElement => ({
  id: 1,
  tag: "button",
  role: "button",
  name: "Sign in",
  attrs: {},
  bbox: { x: 10, y: 10, width: 100, height: 40 },
  hittable: true,
  ...overrides,
});

const makeSnapshot = (elements: SnapshotElement[] = [makeElement()]): PageSnapshot => ({
  url: "https://example.test",
  title: "Example",
  viewport: { width: 1280, height: 720 },
  elements,
});

type FakeAdapter = Pick<BrowserAdapter, "isVisible" | "screenshot" | "snapshot"> & {
  calls: {
    isVisible: number;
    screenshot: number;
    snapshot: number;
  };
};

function makeAdapter(
  overrides: {
    isVisible?: (selector: string, timeoutMs: number) => Promise<ReadResult<boolean>>;
    screenshot?: () => Promise<ReadResult<Buffer>>;
    snapshot?: () => Promise<ReadResult<PageSnapshot>>;
  } = {},
): FakeAdapter {
  const calls = { isVisible: 0, screenshot: 0, snapshot: 0 };

  return {
    calls,
    isVisible: async (selector: string, timeoutMs: number) => {
      calls.isVisible += 1;
      if (overrides.isVisible !== undefined) {
        return overrides.isVisible(selector, timeoutMs);
      }
      return { ok: true, data: false };
    },
    screenshot: async () => {
      calls.screenshot += 1;
      if (overrides.screenshot !== undefined) {
        return overrides.screenshot();
      }
      return { ok: true, data: Buffer.from("image") };
    },
    snapshot: async () => {
      calls.snapshot += 1;
      if (overrides.snapshot !== undefined) {
        return overrides.snapshot();
      }
      return { ok: true, data: makeSnapshot() };
    },
  };
}

type FakeJev = Pick<JevClient, "bbox" | "choice"> & {
  calls: {
    bbox: number;
    choice: number;
  };
};

function makeJev(
  overrides: {
    bbox?: (
      question: string,
      image: Buffer,
      viewport: { width: number; height: number },
      signal?: AbortSignal,
    ) => Promise<BboxResult>;
    choice?: (question: string, options: string[], signal?: AbortSignal) => Promise<ChoiceResult>;
  } = {},
): FakeJev {
  const calls = { bbox: 0, choice: 0 };

  return {
    calls,
    bbox: async (question, image, viewport, signal) => {
      calls.bbox += 1;
      if (overrides.bbox !== undefined) {
        return overrides.bbox(question, image, viewport, signal);
      }
      return {
        ok: true,
        data: {
          box: { x: 20, y: 20, width: 20, height: 20 },
          confidence: 0.9,
        },
      };
    },
    choice: async (question, options, signal) => {
      calls.choice += 1;
      if (overrides.choice !== undefined) {
        return overrides.choice(question, options, signal);
      }
      return { ok: true, data: { index: 0, confidence: 0.9 } };
    },
  };
}

const baseRequest = (overrides: Partial<LocateRequest> = {}): LocateRequest => ({
  action: "click",
  timeoutMs: 5000,
  ...overrides,
});

describe("locate", () => {
  it("selector only, not visible: Jev is never called and LocateError has 1 attempt", async () => {
    const adapter = makeAdapter({
      isVisible: async () => ({ ok: true, data: false }),
    });
    const jev = makeJev();

    let caught: unknown;
    try {
      await locate(baseRequest({ selector: "#login" }), adapter, jev);
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(LocateError);
    const locateError = caught as LocateError;
    expect(locateError.attempts).toHaveLength(1);
    expect(locateError.attempts[0].method).toBe("selector");
    expect(jev.calls.bbox).toBe(0);
    expect(jev.calls.choice).toBe(0);
  });

  it("selector visible: screenshot and Jev are never called; method is selector", async () => {
    const adapter = makeAdapter({
      isVisible: async () => ({ ok: true, data: true }),
    });
    const jev = makeJev();

    const result = await locate(baseRequest({ selector: "#login" }), adapter, jev);

    expect(result.method).toBe("selector");
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(adapter.calls.screenshot).toBe(0);
    expect(adapter.calls.snapshot).toBe(0);
    expect(jev.calls.bbox).toBe(0);
    expect(jev.calls.choice).toBe(0);
  });

  it("target only: visual succeeds; method visual; DOM choice is never called", async () => {
    const adapter = makeAdapter();
    const jev = makeJev({
      bbox: async () => ({ ok: true, data: { box: { x: 20, y: 20, width: 20, height: 20 }, confidence: 0.95 } }),
    });

    const result = await locate(baseRequest({ target: "Sign in button" }), adapter, jev);

    expect(result.method).toBe("visual");
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(jev.calls.choice).toBe(0);
  });

  it("visual fails at Jev (box null), DOM succeeds: adapter.snapshot is called exactly once", async () => {
    const adapter = makeAdapter();
    const jev = makeJev({
      bbox: async () => ({ ok: true, data: { box: null, confidence: 0.9 } }),
      choice: async () => ({ ok: true, data: { index: 0, confidence: 0.9 } }),
    });

    const result = await locate(baseRequest({ target: "Sign in button" }), adapter, jev);

    expect(result.method).toBe("dom");
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(adapter.calls.snapshot).toBe(1);
    expect(jev.calls.choice).toBe(1);
  });

  it("visual fails at screenshot: DOM still runs and takes its own snapshot", async () => {
    const adapter = makeAdapter({
      screenshot: async () => ({ ok: false, reason: "screenshot failed" }),
    });
    const jev = makeJev({
      choice: async () => ({ ok: true, data: { index: 0, confidence: 0.85 } }),
    });

    const result = await locate(baseRequest({ target: "Sign in button" }), adapter, jev);

    expect(result.method).toBe("dom");
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(adapter.calls.screenshot).toBe(1);
    expect(adapter.calls.snapshot).toBe(1);
    expect(jev.calls.choice).toBe(1);
  });

  it("all three fail: LocateError has attempts in order and message has one line per stage", async () => {
    const adapter = makeAdapter({
      isVisible: async () => ({ ok: true, data: false }),
    });
    const jev = makeJev({
      bbox: async () => ({ ok: true, data: { box: null, confidence: 0.8 } }),
      choice: async () => ({ ok: true, data: { index: null, confidence: 0.8 } }),
    });

    let caught: unknown;
    try {
      await locate(baseRequest({ selector: "#login", target: "Sign in button" }), adapter, jev);
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(LocateError);
    const locateError = caught as LocateError;
    expect(locateError.attempts.map((attempt) => attempt.method)).toEqual(["selector", "visual", "dom"]);
    expect(locateError.message).toContain('Could not locate "Sign in button":');
    expect(locateError.message).toContain("  selector —");
    expect(locateError.message).toContain("  visual —");
    expect(locateError.message).toContain("  dom —");
  });

  it("an error thrown by the adapter propagates and is not a LocateError", async () => {
    const adapter = makeAdapter({
      isVisible: async () => {
        throw new Error("browser disconnected");
      },
    });
    const jev = makeJev();

    await expect(locate(baseRequest({ selector: "#login", target: "Sign in button" }), adapter, jev)).rejects.toThrow(
      "browser disconnected",
    );
    await expect(
      locate(baseRequest({ selector: "#login", target: "Sign in button" }), adapter, jev),
    ).rejects.not.toBeInstanceOf(LocateError);
  });
});
