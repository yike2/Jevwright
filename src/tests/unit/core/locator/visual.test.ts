import { describe, it, expect, vi } from "vitest";
import { findElementAtPoint, visualLocate } from "../../../../core/locator/visual.js";
import type {
  BrowserDriver,
  JevClient,
  PageSnapshot,
  SnapshotElement,
} from "../../../../core/locator/types.js";

describe("findElementAtPoint", () => {
  it("finds the element containing the point and chooses the smallest area when overlapping", () => {
    const elements: SnapshotElement[] = [
      {
        id: 1,
        role: "button",
        name: "Outer Card",
        bbox: { x: 100, y: 100, width: 300, height: 200 },
        hittable: true,
      },
      {
        id: 2,
        role: "button",
        name: "Delete inside card",
        bbox: { x: 250, y: 150, width: 80, height: 32 },
        hittable: true,
      },
      {
        id: 3,
        role: "button",
        name: "Unrelated button",
        bbox: { x: 500, y: 100, width: 100, height: 40 },
        hittable: true,
      },
    ];

    expect(findElementAtPoint(elements, 150, 150, "click")?.id).toBe(1);
    expect(findElementAtPoint(elements, 280, 165, "click")?.id).toBe(2);
  });

  it("skips non-hittable, disabled, and non-editable elements for input action", () => {
    const elements: SnapshotElement[] = [
      {
        id: 1,
        role: "button",
        name: "Covered by modal",
        bbox: { x: 10, y: 10, width: 100, height: 40 },
        hittable: false,
      },
      {
        id: 2,
        role: "button",
        name: "Disabled button",
        attrs: { disabled: true },
        bbox: { x: 10, y: 60, width: 100, height: 40 },
        hittable: true,
      },
      {
        id: 3,
        role: "button",
        name: "Active button",
        bbox: { x: 10, y: 110, width: 100, height: 40 },
        hittable: true,
      },
      {
        id: 4,
        role: "textbox",
        name: "Username",
        bbox: { x: 10, y: 160, width: 100, height: 40 },
        hittable: true,
      },
    ];

    expect(findElementAtPoint(elements, 50, 30, "click")).toBeNull();
    expect(findElementAtPoint(elements, 50, 80, "click")).toBeNull();
    expect(findElementAtPoint(elements, 50, 130, "input")).toBeNull();
    expect(findElementAtPoint(elements, 50, 180, "input")?.id).toBe(4);
    expect(findElementAtPoint(elements, 999, 999, "click")).toBeNull();
  });
});

describe("visualLocate", () => {
  it("takes screenshot, calls Jev bbox, matches box center to snapshot element, and returns elementId", async () => {
    const fakeShot = Buffer.from("png-bytes");
    const snapshot: PageSnapshot = {
      elements: [
        {
          id: 42,
          role: "button",
          name: "Sign in",
          bbox: { x: 100, y: 200, width: 120, height: 40 },
          hittable: true,
        },
      ],
    };

    const driver: BrowserDriver = {
      isVisible: vi.fn(),
      screenshot: vi.fn().mockResolvedValue(fakeShot),
      snapshot: vi.fn().mockResolvedValue(snapshot),
    };

    const jev: JevClient = {
      bbox: vi.fn().mockResolvedValue({
        box: { x: 110, y: 205, width: 100, height: 30 },
        confidence: 0.94,
      }),
      choice: vi.fn(),
    };

    const outcome = await visualLocate(
      "Sign in button",
      "click",
      driver,
      () => driver.snapshot(),
      jev,
    );

    expect(driver.screenshot).toHaveBeenCalledTimes(1);
    expect(jev.bbox).toHaveBeenCalledWith(
      'Find the element described as: "Sign in button". Return its bounding box.',
      fakeShot,
    );
    expect(outcome.attempt.ok).toBe(true);
    expect(outcome.attempt.method).toBe("visual");
    expect(outcome.attempt.confidence).toBe(0.94);
    expect(outcome.elementId).toBe(42);
  });

  it("fails without taking a snapshot on null box, low confidence, or Jev error, and fails if box center hits no usable element", async () => {
    const fakeShot = Buffer.from("png-bytes");
    const snapshot: PageSnapshot = {
      elements: [
        {
          id: 42,
          role: "button",
          name: "Sign in",
          bbox: { x: 100, y: 200, width: 120, height: 40 },
          hittable: true,
        },
      ],
    };

    const driver: BrowserDriver = {
      isVisible: vi.fn(),
      screenshot: vi.fn().mockResolvedValue(fakeShot),
      snapshot: vi.fn().mockResolvedValue(snapshot),
    };

    const jevNullBox: JevClient = {
      bbox: vi.fn().mockResolvedValue({ box: null, confidence: 0.2 }),
      choice: vi.fn(),
    };
    const nullOutcome = await visualLocate(
      "Missing button",
      "click",
      driver,
      () => driver.snapshot(),
      jevNullBox,
    );
    expect(nullOutcome.attempt.ok).toBe(false);
    expect(nullOutcome.attempt.reason).toBe("Jev returned no bounding box");
    expect(driver.snapshot).not.toHaveBeenCalled();

    const jevLowConf: JevClient = {
      bbox: vi.fn().mockResolvedValue({
        box: { x: 110, y: 205, width: 100, height: 30 },
        confidence: 0.42,
      }),
      choice: vi.fn(),
    };
    const lowConfOutcome = await visualLocate(
      "Sign in button",
      "click",
      driver,
      () => driver.snapshot(),
      jevLowConf,
    );
    expect(lowConfOutcome.attempt.ok).toBe(false);
    expect(lowConfOutcome.attempt.confidence).toBe(0.42);
    expect(lowConfOutcome.attempt.reason).toBe("confidence 0.42 below 0.7");
    expect(driver.snapshot).not.toHaveBeenCalled();

    const jevThrows: JevClient = {
      bbox: vi.fn().mockRejectedValue(new Error("Jev timeout")),
      choice: vi.fn(),
    };
    const errOutcome = await visualLocate(
      "Sign in button",
      "click",
      driver,
      () => driver.snapshot(),
      jevThrows,
    );
    expect(errOutcome.attempt.ok).toBe(false);
    expect(errOutcome.attempt.reason).toBe("Jev timeout");
    expect(driver.snapshot).not.toHaveBeenCalled();

    const jevMissesElement: JevClient = {
      bbox: vi.fn().mockResolvedValue({
        box: { x: 10, y: 10, width: 40, height: 20 },
        confidence: 0.95,
      }),
      choice: vi.fn(),
    };
    const missOutcome = await visualLocate(
      "Empty background",
      "click",
      driver,
      () => driver.snapshot(),
      jevMissesElement,
    );
    expect(missOutcome.attempt.ok).toBe(false);
    expect(missOutcome.attempt.confidence).toBe(0.95);
    expect(missOutcome.attempt.reason).toBe("no usable element at (30, 20)");
    expect(driver.snapshot).toHaveBeenCalledTimes(1);
  });
});
