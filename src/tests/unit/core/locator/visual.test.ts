import { describe, expect, it, vi } from "vitest";
import type { BrowserDriver, JevClient, SnapshotElement } from "../../../../core/locator/types.js";
import { findElementAtPoint, visualLocate } from "../../../../core/locator/visual.js";

function makeEl(overrides: Partial<SnapshotElement>): SnapshotElement {
  return {
    id: 1,
    role: "button",
    name: "Button",
    text: "Button",
    attrs: {},
    bbox: { x: 0, y: 0, width: 100, height: 40 },
    hittable: true,
    ...overrides,
  };
}

describe("findElementAtPoint", () => {
  it("picks the usable element with the smallest area containing the point and respects action filters", () => {
    const cardButton = makeEl({
      id: 1,
      role: "button",
      name: "Project card",
      bbox: { x: 100, y: 100, width: 300, height: 200 },
    });
    const innerDeleteButton = makeEl({
      id: 2,
      role: "button",
      name: "Delete project",
      bbox: { x: 320, y: 120, width: 60, height: 30 },
    });
    const coveredSmallerButton = makeEl({
      id: 3,
      role: "button",
      name: "Hidden overlay button",
      bbox: { x: 330, y: 125, width: 20, height: 10 },
      hittable: false,
    });
    const emailTextbox = makeEl({
      id: 4,
      role: "textbox",
      name: "Email",
      bbox: { x: 120, y: 150, width: 200, height: 36 },
    });

    const elements = [cardButton, innerDeleteButton, coveredSmallerButton, emailTextbox];

    // Point (340, 130) hits cardButton, innerDeleteButton, and coveredSmallerButton.
    // coveredSmallerButton is skipped (hittable: false), so innerDeleteButton (smaller area than cardButton) wins.
    expect(findElementAtPoint(elements, 340, 130, "click")?.id).toBe(2);

    // Point (150, 160) hits cardButton (button) and emailTextbox (textbox).
    // For "input", only editable elements (textbox/searchbox) are usable, so emailTextbox wins even if cardButton had any size.
    expect(findElementAtPoint(elements, 150, 160, "input")?.id).toBe(4);

    // Point (340, 130) for "input" has no editable element at that point.
    expect(findElementAtPoint(elements, 340, 130, "input")).toBeNull();

    // Point outside all elements returns null.
    expect(findElementAtPoint(elements, 10, 10, "click")).toBeNull();
  });
});

describe("visualLocate", () => {
  it("takes screenshot, calls jev.bbox, only snapshots on confident box, and matches box center", async () => {
    const fakeScreenshot = Buffer.from("fake-png");
    const snapshot = {
      elements: [
        makeEl({ id: 7, role: "button", name: "Sign in", bbox: { x: 400, y: 300, width: 120, height: 44 } }),
      ],
    };

    const driver: BrowserDriver = {
      isVisible: vi.fn(),
      screenshot: vi.fn().mockResolvedValue(fakeScreenshot),
      snapshot: vi.fn().mockResolvedValue(snapshot),
    };

    const jevSuccess: JevClient = {
      bbox: vi.fn().mockResolvedValue({
        box: { x: 410, y: 305, width: 100, height: 34 },
        confidence: 0.92,
      }),
      choice: vi.fn(),
    };

    const hit = await visualLocate("Sign in button", "click", driver, jevSuccess);
    expect(hit).toEqual({
      ok: true,
      elementId: 7,
      confidence: 0.92,
      snapshot,
    });
    expect(jevSuccess.bbox).toHaveBeenCalledWith(
      'Find the element described as: "Sign in button". Return its bounding box.',
      fakeScreenshot,
    );
    expect(driver.snapshot).toHaveBeenCalledTimes(1);

    // Low confidence does NOT call driver.snapshot()
    const driverLow: BrowserDriver = {
      isVisible: vi.fn(),
      screenshot: vi.fn().mockResolvedValue(fakeScreenshot),
      snapshot: vi.fn().mockResolvedValue(snapshot),
    };
    const jevLow: JevClient = {
      bbox: vi.fn().mockResolvedValue({
        box: { x: 410, y: 305, width: 100, height: 34 },
        confidence: 0.42,
      }),
      choice: vi.fn(),
    };
    const missLow = await visualLocate("Sign in button", "click", driverLow, jevLow);
    expect(missLow).toEqual({
      ok: false,
      confidence: 0.42,
      reason: "confidence 0.42 below 0.7",
    });
    expect(driverLow.snapshot).not.toHaveBeenCalled();

    // Box center misses all elements -> returns snapshot for reuse by DOM Locate
    const driverMissCenter: BrowserDriver = {
      isVisible: vi.fn(),
      screenshot: vi.fn().mockResolvedValue(fakeScreenshot),
      snapshot: vi.fn().mockResolvedValue(snapshot),
    };
    const jevMissCenter: JevClient = {
      bbox: vi.fn().mockResolvedValue({
        box: { x: 10, y: 10, width: 20, height: 20 },
        confidence: 0.88,
      }),
      choice: vi.fn(),
    };
    const missCenter = await visualLocate("Sign in button", "click", driverMissCenter, jevMissCenter);
    expect(missCenter.ok).toBe(false);
    expect(missCenter.snapshot).toEqual(snapshot);
    expect(driverMissCenter.snapshot).toHaveBeenCalledTimes(1);
  });
});
