import { describe, expect, it, vi } from "vitest";
import { domLocate, formatCandidateLine } from "../../../../core/locator/dom.js";
import type { JevClient, SnapshotElement } from "../../../../core/locator/types.js";

function makeEl(overrides: Partial<SnapshotElement>): SnapshotElement {
  return {
    id: 1,
    role: "button",
    name: "",
    text: "",
    attrs: {},
    bbox: { x: 0, y: 0, width: 100, height: 40 },
    hittable: true,
    ...overrides,
  };
}

describe("formatCandidateLine", () => {
  it("formats role, name, text, and attributes while omitting empty fields and truncating to MAX_TEXT_LENGTH", () => {
    expect(
      formatCandidateLine(
        makeEl({
          role: "textbox",
          name: "Email",
          attrs: { type: "email", placeholder: "you@example.com" },
        }),
      ),
    ).toBe('textbox "Email" type=email placeholder="you@example.com"');

    expect(
      formatCandidateLine(
        makeEl({
          role: "button",
          name: "Show password",
          text: "Show password",
        }),
      ),
    ).toBe('button "Show password"');

    expect(
      formatCandidateLine(
        makeEl({
          role: "checkbox",
          name: "Remember me",
          attrs: { checked: "false" },
        }),
      ),
    ).toBe('checkbox "Remember me" checked=false');

    expect(
      formatCandidateLine(
        makeEl({
          role: "switch",
          name: "Send a weekly summary",
          attrs: { "aria-checked": "false" },
        }),
      ),
    ).toBe('switch "Send a weekly summary" aria-checked=false');

    const longText = "A".repeat(70);
    const truncatedLine = formatCandidateLine(
      makeEl({
        role: "button",
        name: "",
        text: longText,
      }),
    );
    expect(truncatedLine).toBe(`button "${"A".repeat(50)}"`);
  });
});

describe("domLocate", () => {
  it("filters usable candidates for action, limits to MAX_DOM_CANDIDATES, and returns chosen element id", async () => {
    const elements: SnapshotElement[] = [
      makeEl({ id: 10, role: "button", name: "Covered", hittable: false }),
      makeEl({ id: 11, role: "button", name: "Disabled", attrs: { disabled: "true" } }),
      makeEl({ id: 12, role: "button", name: "Submit" }),
      makeEl({ id: 13, role: "textbox", name: "Email", attrs: { type: "email" } }),
      makeEl({ id: 14, role: "searchbox", name: "Search tasks" }),
    ];

    const jev: JevClient = {
      bbox: vi.fn(),
      choice: vi.fn().mockResolvedValue({ index: 1, confidence: 0.88 }),
    };

    // For "input", only textbox and searchbox (ids 13 and 14) are included
    const res = await domLocate("Search tasks input", "input", { elements }, jev);
    expect(res).toEqual({
      ok: true,
      elementId: 14,
      confidence: 0.88,
    });
    expect(jev.choice).toHaveBeenCalledWith(
      'Which element best matches the description: "Search tasks input"?',
      ['textbox "Email" type=email', 'searchbox "Search tasks"'],
    );

    // Fails when confidence is below threshold (0.7)
    const lowJev: JevClient = {
      bbox: vi.fn(),
      choice: vi.fn().mockResolvedValue({ index: 0, confidence: 0.52 }),
    };
    const lowRes = await domLocate("Submit", "click", { elements }, lowJev);
    expect(lowRes).toEqual({
      ok: false,
      confidence: 0.52,
      reason: "confidence 0.52 below 0.7",
    });

    // Fails when Jev returns null choice
    const nullJev: JevClient = {
      bbox: vi.fn(),
      choice: vi.fn().mockResolvedValue({ index: null, confidence: 0.9 }),
    };
    const nullRes = await domLocate("Missing button", "click", { elements }, nullJev);
    expect(nullRes).toEqual({
      ok: false,
      confidence: 0.9,
      reason: "Jev chose no candidate",
    });

    // Fails without calling Jev when there are no usable candidates
    const noCandRes = await domLocate("Field", "input", { elements: [elements[0]!, elements[2]!] }, nullJev);
    expect(noCandRes).toEqual({
      ok: false,
      reason: "no usable candidates in snapshot",
    });
  });
});
