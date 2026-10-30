import { describe, expect, it, vi } from "vitest";
import { locate } from "../../../../core/locator/locate.js";
import { type BrowserDriver, type JevClient, LocateError } from "../../../../core/locator/types.js";

describe("locate", () => {
  it("handles selector-only steps using timeoutMs without calling Jev or screenshot", async () => {
    const driverHit: BrowserDriver = {
      isVisible: vi.fn().mockResolvedValue(true),
      screenshot: vi.fn(),
      snapshot: vi.fn(),
    };
    const jev: JevClient = {
      bbox: vi.fn(),
      choice: vi.fn(),
    };

    const res = await locate(
      { action: "click", selector: "#submit-btn", timeoutMs: 15000 },
      driverHit,
      jev,
    );

    expect(res.method).toBe("selector");
    expect(res.elementId).toBeUndefined();
    expect(res.attempts).toHaveLength(1);
    expect(res.attempts[0]).toMatchObject({
      method: "selector",
      ok: true,
    });
    expect(driverHit.isVisible).toHaveBeenCalledWith("#submit-btn", 15000);
    expect(driverHit.screenshot).not.toHaveBeenCalled();
    expect(jev.bbox).not.toHaveBeenCalled();
    expect(jev.choice).not.toHaveBeenCalled();

    // Selector-only failure throws LocateError and never calls Jev
    const driverMiss: BrowserDriver = {
      isVisible: vi.fn().mockResolvedValue(false),
      screenshot: vi.fn(),
      snapshot: vi.fn(),
    };

    await expect(
      locate({ action: "click", selector: "#missing", timeoutMs: 5000 }, driverMiss, jev),
    ).rejects.toThrow(LocateError);
    expect(jev.bbox).not.toHaveBeenCalled();
    expect(jev.choice).not.toHaveBeenCalled();
  });

  it("runs selector (with SELECTOR_PROBE_MS) -> visual -> dom in order, reuses snapshot, and lists all attempts in LocateError", async () => {
    const snapshot = {
      elements: [
        {
          id: 42,
          role: "button",
          name: "Sign in",
          text: "Sign in",
          attrs: {},
          bbox: { x: 100, y: 200, width: 120, height: 40 },
          hittable: true,
        },
      ],
    };

    // Case 1: selector misses (probe 2000ms), visual succeeds
    const driverVisualHit: BrowserDriver = {
      isVisible: vi.fn().mockResolvedValue(false),
      screenshot: vi.fn().mockResolvedValue(Buffer.from("png")),
      snapshot: vi.fn().mockResolvedValue(snapshot),
    };
    const jevVisualHit: JevClient = {
      bbox: vi.fn().mockResolvedValue({
        box: { x: 110, y: 205, width: 100, height: 30 },
        confidence: 0.94,
      }),
      choice: vi.fn(),
    };

    const visualRes = await locate(
      { action: "click", selector: "#old-login", target: "Sign in button", timeoutMs: 15000 },
      driverVisualHit,
      jevVisualHit,
    );
    expect(driverVisualHit.isVisible).toHaveBeenCalledWith("#old-login", 2000);
    expect(visualRes.method).toBe("visual");
    expect(visualRes.elementId).toBe(42);
    expect(visualRes.confidence).toBe(0.94);
    expect(visualRes.attempts).toHaveLength(2);
    expect(visualRes.attempts[0]?.method).toBe("selector");
    expect(visualRes.attempts[0]?.ok).toBe(false);
    expect(visualRes.attempts[1]?.method).toBe("visual");
    expect(visualRes.attempts[1]?.ok).toBe(true);
    expect(jevVisualHit.choice).not.toHaveBeenCalled();

    // Case 2: target only; visual box misses element in snapshot, DOM reuses the snapshot without calling driver.snapshot() a second time
    const driverDomFallback: BrowserDriver = {
      isVisible: vi.fn(),
      screenshot: vi.fn().mockResolvedValue(Buffer.from("png")),
      snapshot: vi.fn().mockResolvedValue(snapshot),
    };
    const jevDomFallback: JevClient = {
      bbox: vi.fn().mockResolvedValue({
        box: { x: 5, y: 5, width: 10, height: 10 }, // misses element 42, so snapshot was taken
        confidence: 0.85,
      }),
      choice: vi.fn().mockResolvedValue({
        index: 0,
        confidence: 0.91,
      }),
    };

    const domRes = await locate(
      { action: "click", target: "Sign in button", timeoutMs: 15000 },
      driverDomFallback,
      jevDomFallback,
    );
    expect(domRes.method).toBe("dom");
    expect(domRes.elementId).toBe(42);
    expect(domRes.confidence).toBe(0.91);
    expect(driverDomFallback.snapshot).toHaveBeenCalledTimes(1);
    expect(domRes.attempts).toHaveLength(2);

    // Case 3: all stages fail -> LocateError contains all 3 attempts and formatted message
    const driverAllFail: BrowserDriver = {
      isVisible: vi.fn().mockResolvedValue(false),
      screenshot: vi.fn().mockResolvedValue(Buffer.from("png")),
      snapshot: vi.fn().mockResolvedValue(snapshot),
    };
    const jevAllFail: JevClient = {
      bbox: vi.fn().mockResolvedValue({ box: null, confidence: 0.42 }),
      choice: vi.fn().mockResolvedValue({ index: null, confidence: 0.3 }),
    };

    let caught: unknown;
    try {
      await locate(
        { action: "click", selector: "#login", target: "Sign in button", timeoutMs: 15000 },
        driverAllFail,
        jevAllFail,
      );
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(LocateError);
    const locateErr = caught as LocateError;
    expect(locateErr.attempts).toHaveLength(3);
    expect(locateErr.attempts.map((a) => a.method)).toEqual(["selector", "visual", "dom"]);
    expect(locateErr.message).toContain('Could not locate "Sign in button":');
    expect(locateErr.message).toContain('selector "#login" — not visible within 2000 ms');
    expect(locateErr.message).toContain("visual —");
    expect(locateErr.message).toContain("dom — Jev chose no candidate");
  });
});
