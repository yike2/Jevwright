import { describe, it, expect, vi } from "vitest";
import {
  domLocate,
  formatCandidateLine,
  getUsableCandidates,
} from "../../../../core/locator/dom.js";
import type {
  JevClient,
  PageSnapshot,
  SnapshotElement,
} from "../../../../core/locator/types.js";

describe("formatCandidateLine", () => {
  it("formats role, name, type, and placeholder while omitting empty fields", () => {
    const emailInput: SnapshotElement = {
      id: 1,
      role: "textbox",
      name: "Email",
      text: "",
      attrs: { type: "email", placeholder: "you@example.com" },
      bbox: { x: 10, y: 20, width: 200, height: 36 },
      hittable: true,
    };

    const button: SnapshotElement = {
      id: 2,
      role: "button",
      name: "Show password",
      text: "",
      attrs: {},
      bbox: { x: 220, y: 20, width: 100, height: 36 },
      hittable: true,
    };

    expect(formatCandidateLine(emailInput)).toBe(
      'textbox "Email" type=email placeholder="you@example.com"',
    );
    expect(formatCandidateLine(button)).toBe('button "Show password"');
  });

  it("includes text without duplicating name and truncates strings to MAX_TEXT_LENGTH (50)", () => {
    const sameNameAndText: SnapshotElement = {
      id: 1,
      role: "button",
      name: "Show password",
      text: "Show password",
      attrs: {},
      bbox: { x: 0, y: 0, width: 100, height: 30 },
      hittable: true,
    };

    const textOnly: SnapshotElement = {
      id: 2,
      role: "link",
      name: "",
      text: "Forgot your password?",
      attrs: {},
      bbox: { x: 0, y: 40, width: 150, height: 20 },
      hittable: true,
    };

    const longText = "A".repeat(65);
    const truncatedEl: SnapshotElement = {
      id: 3,
      role: "button",
      name: "",
      text: longText,
      attrs: {},
      bbox: { x: 0, y: 70, width: 200, height: 30 },
      hittable: true,
    };

    const distinctNameAndText: SnapshotElement = {
      id: 4,
      role: "button",
      name: "Close modal",
      text: "×",
      attrs: {},
      bbox: { x: 0, y: 110, width: 30, height: 30 },
      hittable: true,
    };

    expect(formatCandidateLine(sameNameAndText)).toBe('button "Show password"');
    expect(formatCandidateLine(textOnly)).toBe('link "Forgot your password?"');
    expect(formatCandidateLine(truncatedEl)).toBe(`button "${"A".repeat(50)}"`);
    expect(formatCandidateLine(distinctNameAndText)).toBe('button "Close modal" text="×"');
  });

  it("formats checked and aria-checked attributes when present", () => {
    const checkbox: SnapshotElement = {
      id: 5,
      role: "checkbox",
      name: "Remember me",
      text: "",
      attrs: { checked: false },
      bbox: { x: 0, y: 0, width: 20, height: 20 },
      hittable: true,
    };

    const toggleSwitch: SnapshotElement = {
      id: 6,
      role: "switch",
      name: "Send a weekly summary",
      text: "",
      attrs: { "aria-checked": "false" },
      bbox: { x: 0, y: 30, width: 40, height: 20 },
      hittable: true,
    };

    expect(formatCandidateLine(checkbox)).toBe('checkbox "Remember me" checked=false');
    expect(formatCandidateLine(toggleSwitch)).toBe(
      'switch "Send a weekly summary" aria-checked=false',
    );
  });
});

describe("getUsableCandidates", () => {
  it("skips non-hittable and disabled elements and caps at MAX_DOM_CANDIDATES (50)", () => {
    const elements: SnapshotElement[] = [
      {
        id: 1,
        role: "button",
        name: "Covered",
        bbox: { x: 0, y: 0, width: 50, height: 30 },
        hittable: false,
      },
      {
        id: 2,
        role: "button",
        name: "Disabled",
        attrs: { disabled: true },
        bbox: { x: 0, y: 40, width: 50, height: 30 },
        hittable: true,
      },
      ...Array.from({ length: 60 }, (_, idx) => ({
        id: idx + 3,
        role: "button",
        name: `Btn ${idx + 1}`,
        bbox: { x: 0, y: (idx + 2) * 40, width: 50, height: 30 },
        hittable: true,
      })),
    ];

    const usable = getUsableCandidates(elements, "click");
    expect(usable).toHaveLength(50);
    expect(usable[0].id).toBe(3);
    expect(usable[49].id).toBe(52);
  });

  it("keeps only textbox and searchbox elements when action is input", () => {
    const elements: SnapshotElement[] = [
      {
        id: 1,
        role: "button",
        name: "Submit",
        bbox: { x: 0, y: 0, width: 80, height: 30 },
        hittable: true,
      },
      {
        id: 2,
        role: "textbox",
        name: "Email",
        bbox: { x: 0, y: 40, width: 200, height: 30 },
        hittable: true,
      },
      {
        id: 3,
        role: "searchbox",
        name: "Search tasks",
        bbox: { x: 0, y: 80, width: 200, height: 30 },
        hittable: true,
      },
      {
        id: 4,
        role: "checkbox",
        name: "Remember me",
        bbox: { x: 0, y: 120, width: 20, height: 20 },
        hittable: true,
      },
    ];

    const usableForInput = getUsableCandidates(elements, "input");
    expect(usableForInput.map((el) => el.id)).toEqual([2, 3]);
  });
});

describe("domLocate", () => {
  it("asks Jev choice with formatted candidate lines and returns chosen candidate elementId", async () => {
    const snapshot: PageSnapshot = {
      elements: [
        {
          id: 10,
          role: "textbox",
          name: "Email",
          attrs: { type: "email" },
          bbox: { x: 10, y: 10, width: 200, height: 30 },
          hittable: true,
        },
        {
          id: 20,
          role: "button",
          name: "Sign in",
          bbox: { x: 10, y: 50, width: 100, height: 36 },
          hittable: true,
        },
      ],
    };

    const jev: JevClient = {
      bbox: vi.fn(),
      choice: vi.fn().mockResolvedValue({ index: 1, confidence: 0.91 }),
    };

    const outcome = await domLocate("Sign in button", "click", async () => snapshot, jev);

    expect(jev.choice).toHaveBeenCalledWith(
      'Which element best matches the description: "Sign in button"?',
      ['textbox "Email" type=email', 'button "Sign in"'],
    );
    expect(outcome.attempt.ok).toBe(true);
    expect(outcome.attempt.method).toBe("dom");
    expect(outcome.attempt.confidence).toBe(0.91);
    expect(outcome.elementId).toBe(20);
  });

  it("fails when there are no candidates, index is null or out of range, confidence is below threshold, or Jev throws", async () => {
    const emptySnapshot: PageSnapshot = { elements: [] };
    const singleSnapshot: PageSnapshot = {
      elements: [
        {
          id: 10,
          role: "button",
          name: "Save",
          bbox: { x: 0, y: 0, width: 80, height: 30 },
          hittable: true,
        },
      ],
    };

    const jevNeverCalled: JevClient = {
      bbox: vi.fn(),
      choice: vi.fn(),
    };
    const noCandOutcome = await domLocate("Save", "click", async () => emptySnapshot, jevNeverCalled);
    expect(noCandOutcome.attempt.ok).toBe(false);
    expect(noCandOutcome.attempt.reason).toBe("no usable candidates");
    expect(jevNeverCalled.choice).not.toHaveBeenCalled();

    const jevNullChoice: JevClient = {
      bbox: vi.fn(),
      choice: vi.fn().mockResolvedValue({ index: null, confidence: 0.85 }),
    };
    const nullOutcome = await domLocate("Save", "click", async () => singleSnapshot, jevNullChoice);
    expect(nullOutcome.attempt.ok).toBe(false);
    expect(nullOutcome.attempt.reason).toBe("Jev chose no candidate");

    const jevOutOfRange: JevClient = {
      bbox: vi.fn(),
      choice: vi.fn().mockResolvedValue({ index: 5, confidence: 0.9 }),
    };
    const rangeOutcome = await domLocate("Save", "click", async () => singleSnapshot, jevOutOfRange);
    expect(rangeOutcome.attempt.ok).toBe(false);
    expect(rangeOutcome.attempt.reason).toBe("choice index 5 out of range");

    const jevLowConf: JevClient = {
      bbox: vi.fn(),
      choice: vi.fn().mockResolvedValue({ index: 0, confidence: 0.55 }),
    };
    const lowConfOutcome = await domLocate("Save", "click", async () => singleSnapshot, jevLowConf);
    expect(lowConfOutcome.attempt.ok).toBe(false);
    expect(lowConfOutcome.attempt.confidence).toBe(0.55);
    expect(lowConfOutcome.attempt.reason).toBe("confidence 0.55 below 0.7");

    const jevThrows: JevClient = {
      bbox: vi.fn(),
      choice: vi.fn().mockRejectedValue(new Error("Jev API 503")),
    };
    const errOutcome = await domLocate("Save", "click", async () => singleSnapshot, jevThrows);
    expect(errOutcome.attempt.ok).toBe(false);
    expect(errOutcome.attempt.reason).toBe("Jev API 503");
  });
});
