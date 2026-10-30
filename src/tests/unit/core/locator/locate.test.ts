import { describe, it, expect, vi } from "vitest";
import {
  locate,
  LocateError,
  type BrowserDriver,
  type JevClient,
} from "../../../../core/locator/index.js";

describe("locate", () => {
  it("succeeds via selector stage with timeoutMs when only selector is present, without calling screenshot, snapshot, or Jev", async () => {
    const driver: BrowserDriver = {
      isVisible: vi.fn().mockResolvedValue(true),
      screenshot: vi.fn(),
      snapshot: vi.fn(),
    };
    const jev: JevClient = {
      bbox: vi.fn(),
      choice: vi.fn(),
    };

    const result = await locate(
      { action: "click", selector: "#submit-btn", timeoutMs: 15000 },
      driver,
      jev,
    );

    expect(driver.isVisible).toHaveBeenCalledWith("#submit-btn", 15000);
    expect(driver.screenshot).not.toHaveBeenCalled();
    expect(driver.snapshot).not.toHaveBeenCalled();
    expect(jev.bbox).not.toHaveBeenCalled();
    expect(jev.choice).not.toHaveBeenCalled();
    expect(result.method).toBe("selector");
    expect(result.elementId).toBeUndefined();
    expect(result.attempts).toHaveLength(1);
    expect(result.attempts[0]).toMatchObject({ method: "selector", ok: true });
  });

  it("throws LocateError without calling Jev when only selector is present and not visible", async () => {
    const driver: BrowserDriver = {
      isVisible: vi.fn().mockResolvedValue(false),
      screenshot: vi.fn(),
      snapshot: vi.fn(),
    };
    const jev: JevClient = {
      bbox: vi.fn(),
      choice: vi.fn(),
    };

    await expect(
      locate({ action: "click", selector: "#missing", timeoutMs: 5000 }, driver, jev),
    ).rejects.toThrowError(
      new RegExp('Could not locate "#missing":\\n  selector "#missing" — not visible within 5000 ms'),
    );

    expect(jev.bbox).not.toHaveBeenCalled();
    expect(jev.choice).not.toHaveBeenCalled();
  });

  it("uses SELECTOR_PROBE_MS (2000) when both selector and target are present, and falls back to visual on selector miss", async () => {
    const driver: BrowserDriver = {
      isVisible: vi.fn().mockResolvedValue(false),
      screenshot: vi.fn().mockResolvedValue(Buffer.from("png")),
      snapshot: vi.fn().mockResolvedValue({
        elements: [
          {
            id: 7,
            role: "button",
            name: "Sign in",
            bbox: { x: 50, y: 50, width: 100, height: 40 },
            hittable: true,
          },
        ],
      }),
    };
    const jev: JevClient = {
      bbox: vi.fn().mockResolvedValue({
        box: { x: 60, y: 55, width: 80, height: 30 },
        confidence: 0.88,
      }),
      choice: vi.fn(),
    };

    const result = await locate(
      {
        action: "click",
        selector: "#old-login",
        target: "Sign in button",
        timeoutMs: 15000,
      },
      driver,
      jev,
    );

    expect(driver.isVisible).toHaveBeenCalledWith("#old-login", 2000);
    expect(result.method).toBe("visual");
    expect(result.elementId).toBe(7);
    expect(result.confidence).toBe(0.88);
    expect(result.attempts).toHaveLength(2);
    expect(result.attempts[0]).toMatchObject({
      method: "selector",
      ok: false,
      reason: "not visible within 2000 ms",
    });
    expect(result.attempts[1]).toMatchObject({
      method: "visual",
      ok: true,
      confidence: 0.88,
    });
    expect(jev.choice).not.toHaveBeenCalled();
  });

  it("falls back from visual to dom and reuses the snapshot when visual took one", async () => {
    const driver: BrowserDriver = {
      isVisible: vi.fn(),
      screenshot: vi.fn().mockResolvedValue(Buffer.from("png")),
      snapshot: vi.fn().mockResolvedValue({
        elements: [
          {
            id: 19,
            role: "button",
            name: "Confirm Delete",
            bbox: { x: 100, y: 100, width: 120, height: 40 },
            hittable: true,
          },
        ],
      }),
    };
    const jev: JevClient = {
      // Visual returns high confidence box, but center (15, 15) misses element (100..220, 100..140)
      bbox: vi.fn().mockResolvedValue({
        box: { x: 10, y: 10, width: 10, height: 10 },
        confidence: 0.9,
      }),
      choice: vi.fn().mockResolvedValue({
        index: 0,
        confidence: 0.93,
      }),
    };

    const result = await locate(
      {
        action: "click",
        target: "Confirm Delete button",
        timeoutMs: 15000,
      },
      driver,
      jev,
    );

    expect(driver.snapshot).toHaveBeenCalledTimes(1);
    expect(result.method).toBe("dom");
    expect(result.elementId).toBe(19);
    expect(result.confidence).toBe(0.93);
    expect(result.attempts).toHaveLength(2);
    expect(result.attempts[0]).toMatchObject({
      method: "visual",
      ok: false,
      reason: "no usable element at (15, 15)",
    });
    expect(result.attempts[1]).toMatchObject({
      method: "dom",
      ok: true,
      confidence: 0.93,
    });
  });

  it("lists all failed attempts in LocateError when selector, visual, and dom all fail, and rejects empty request", async () => {
    const driver: BrowserDriver = {
      isVisible: vi.fn().mockResolvedValue(false),
      screenshot: vi.fn().mockResolvedValue(Buffer.from("png")),
      snapshot: vi.fn().mockResolvedValue({
        elements: [
          {
            id: 1,
            role: "button",
            name: "Cancel",
            bbox: { x: 10, y: 10, width: 80, height: 30 },
            hittable: true,
          },
        ],
      }),
    };
    const jev: JevClient = {
      bbox: vi.fn().mockResolvedValue({
        box: { x: 10, y: 10, width: 80, height: 30 },
        confidence: 0.42,
      }),
      choice: vi.fn().mockResolvedValue({
        index: null,
        confidence: 0.8,
      }),
    };

    let caught: unknown;
    try {
      await locate(
        {
          action: "click",
          selector: "#login",
          target: "Sign in button",
          timeoutMs: 15000,
        },
        driver,
        jev,
      );
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(LocateError);
    const locateErr = caught as LocateError;
    expect(locateErr.message).toBe(
      [
        'Could not locate "Sign in button":',
        '  selector "#login" — not visible within 2000 ms',
        "  visual — confidence 0.42 below 0.7",
        "  dom — Jev chose no candidate",
      ].join("\n"),
    );
    expect(locateErr.attempts).toHaveLength(3);

    await expect(
      locate({ action: "click", timeoutMs: 5000 }, driver, jev),
    ).rejects.toThrow("LocateRequest requires at least one of selector or target");
  });
});
