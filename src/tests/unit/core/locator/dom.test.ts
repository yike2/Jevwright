import { describe, expect, it } from "vitest";
import type { PageSnapshot, SnapshotElement } from "@/core/browser/index.js";
import { MAX_DOM_CANDIDATES } from "@/core/locator/constants.js";
import { describeCandidate, filterUsable, runDom, selectCandidates } from "@/core/locator/dom.js";
import type { LocateRequest } from "@/core/locator/types.js";

const element = (overrides: Partial<SnapshotElement> = {}): SnapshotElement => ({
  id: 0,
  tag: "button",
  role: "button",
  name: "Example",
  attrs: {},
  bbox: { x: 0, y: 0, width: 10, height: 10 },
  hittable: true,
  ...overrides,
});

describe("selectCandidates", () => {
  it("skips non-hittable and disabled elements", () => {
    const candidates = [
      element({ id: 0, hittable: false }),
      element({ id: 1, attrs: { disabled: true } }),
      element({ id: 2, hittable: true, attrs: {} }),
    ];

    expect(selectCandidates(candidates, "click")).toEqual([candidates[2]]);
  });

  it("keeps only textbox and searchbox for the input action, including password inputs", () => {
    const candidates = [
      element({ id: 0, role: "textbox", name: "Email" }),
      element({ id: 1, role: "searchbox", name: "Search" }),
      element({ id: 2, role: "textbox", name: "Password", attrs: { type: "password" } }),
      element({ id: 3, role: "checkbox", name: "Remember me" }),
      element({ id: 4, role: "combobox", name: "Status" }),
    ];

    expect(selectCandidates(candidates, "input").map((item) => item.id)).toEqual([0, 1, 2]);
  });

  it("caps the list at 50 and keeps snapshot order", () => {
    const candidates = Array.from({ length: 60 }, (_, id) => element({ id, hittable: true, name: `Item ${id}` }));

    expect(selectCandidates(candidates, "click")).toHaveLength(50);
    expect(selectCandidates(candidates, "click").map((item) => item.id)).toEqual(
      Array.from({ length: 50 }, (_, i) => i),
    );
  });
});

describe("filterUsable", () => {
  it("excludes non-hittable elements", () => {
    const candidates = [element({ id: 0, hittable: false }), element({ id: 1, hittable: true })];

    expect(filterUsable(candidates, "click").map((item) => item.id)).toEqual([1]);
  });

  it("excludes disabled elements but keeps disabled=false", () => {
    const candidates = [
      element({ id: 0, attrs: { disabled: true } }),
      element({ id: 1, attrs: { disabled: false } }),
      element({ id: 2, attrs: {} }),
    ];

    expect(filterUsable(candidates, "click").map((item) => item.id)).toEqual([1, 2]);
  });

  it("keeps only textbox and searchbox roles for input actions", () => {
    const candidates = [
      element({ id: 0, role: "textbox" }),
      element({ id: 1, role: "searchbox" }),
      element({ id: 2, role: "button" }),
      element({ id: 3, role: "checkbox" }),
    ];

    expect(filterUsable(candidates, "input").map((item) => item.id)).toEqual([0, 1]);
  });

  it("returns all usable elements when under the cap and leaves selectCandidates capped", () => {
    const candidates = Array.from({ length: MAX_DOM_CANDIDATES + 10 }, (_, id) =>
      element({ id, hittable: true, attrs: { disabled: false } }),
    );

    expect(filterUsable(candidates, "click")).toHaveLength(MAX_DOM_CANDIDATES + 10);
    expect(selectCandidates(candidates, "click")).toHaveLength(MAX_DOM_CANDIDATES);
  });
});

describe("describeCandidate", () => {
  it("reproduces the doc examples exactly", () => {
    expect(
      describeCandidate(
        element({
          tag: "input",
          role: "textbox",
          name: "Email",
          attrs: { type: "email", placeholder: "you@example.com" },
        }),
      ),
    ).toBe('textbox "Email" type=email placeholder="you@example.com"');

    expect(
      describeCandidate(
        element({
          tag: "button",
          role: "button",
          name: "Show password",
          attrs: {},
        }),
      ),
    ).toBe('button "Show password"');

    expect(
      describeCandidate(
        element({
          tag: "input",
          role: "checkbox",
          name: "Remember me",
          attrs: { checked: false },
        }),
      ),
    ).toBe('checkbox "Remember me" checked=false');

    expect(
      describeCandidate(
        element({
          tag: "div",
          role: "switch",
          name: "Send a weekly summary",
          attrs: { "aria-checked": "false" },
        }),
      ),
    ).toBe('switch "Send a weekly summary" aria-checked=false');
  });

  it("omits undefined and empty-string fields but keeps false values", () => {
    const candidate = element({
      role: "button",
      name: "Save",
      text: "",
      attrs: { type: "submit", placeholder: "", checked: false },
    });

    expect(describeCandidate(candidate)).toBe('button "Save" type=submit checked=false');
  });

  it("truncates text at exactly 50 characters before escaping", () => {
    const text = "A".repeat(60);
    const candidate = element({
      role: "button",
      name: "Title",
      text,
      attrs: { type: "button" },
    });

    expect(describeCandidate(candidate)).toContain('text="' + "A".repeat(50) + '"');
    expect(describeCandidate(candidate)).not.toContain("...");
  });

  it("formats checked and aria-checked consistently", () => {
    const candidate = element({
      role: "switch",
      name: "Weekly",
      attrs: { checked: true, "aria-checked": "false" },
    });

    expect(describeCandidate(candidate)).toBe('switch "Weekly" checked=true aria-checked=false');
  });
});

describe("runDom", () => {
  const baseRequest = (overrides: Partial<LocateRequest> = {}): LocateRequest => ({
    action: "click",
    target: "Sign in button",
    timeoutMs: 1000,
    ...overrides,
  });

  const snapshot = (elements: SnapshotElement[]): PageSnapshot => ({
    url: "https://example.test",
    title: "Example",
    viewport: { width: 1280, height: 720 },
    elements,
  });

  it("uses existingSnapshot and does not call adapter.snapshot", async () => {
    const existing = snapshot([element({ id: 10, role: "button", name: "Sign in" })]);
    let snapshotCalls = 0;

    const adapter = {
      snapshot: async () => {
        snapshotCalls += 1;
        return { ok: true as const, data: existing };
      },
    };

    const jev = {
      choice: async () => ({ ok: true as const, data: { index: 0, confidence: 0.9 } }),
    };

    const result = await runDom(baseRequest(), adapter, jev, existing);

    expect(snapshotCalls).toBe(0);
    expect(result.attempt.ok).toBe(true);
    expect(result.snapshot).toBe(existing);
    expect(result.attempt.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("calls adapter.snapshot once when no existingSnapshot and does not call choice on snapshot failure", async () => {
    let snapshotCalls = 0;
    let choiceCalls = 0;

    const adapter = {
      snapshot: async () => {
        snapshotCalls += 1;
        return { ok: false as const, reason: "snapshot failed" };
      },
    };

    const jev = {
      choice: async () => {
        choiceCalls += 1;
        return { ok: true as const, data: { index: 0, confidence: 0.9 } };
      },
    };

    const result = await runDom(baseRequest(), adapter, jev);

    expect(snapshotCalls).toBe(1);
    expect(choiceCalls).toBe(0);
    expect(result.attempt.ok).toBe(false);
    expect(result.attempt.reason).toContain("snapshot");
    expect(result.attempt.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("fails when there are no usable candidates and does not call choice", async () => {
    let choiceCalls = 0;
    const currentSnapshot = snapshot([
      element({ id: 1, hittable: false }),
      element({ id: 2, attrs: { disabled: true } }),
    ]);

    const adapter = {
      snapshot: async () => ({ ok: true as const, data: currentSnapshot }),
    };

    const jev = {
      choice: async () => {
        choiceCalls += 1;
        return { ok: true as const, data: { index: 0, confidence: 0.9 } };
      },
    };

    const result = await runDom(baseRequest(), adapter, jev);

    expect(choiceCalls).toBe(0);
    expect(result.attempt.ok).toBe(false);
    expect(result.attempt.reason).toContain("usable");
    expect(result.snapshot).toBe(currentSnapshot);
    expect(result.attempt.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("calls choice with exact options, exact question, and request.signal", async () => {
    const signal = new AbortController().signal;
    const request = baseRequest({ target: "Sign in button", signal });
    const currentSnapshot = snapshot([
      element({ id: 1, role: "button", name: "Cancel" }),
      element({ id: 2, role: "button", name: "Sign in" }),
    ]);

    const calls: Array<{ question: string; options: string[]; signalArg: AbortSignal | undefined }> = [];

    const adapter = {
      snapshot: async () => ({ ok: true as const, data: currentSnapshot }),
    };

    const jev = {
      choice: async (question: string, options: string[], signalArg?: AbortSignal) => {
        calls.push({ question, options, signalArg });
        return { ok: true as const, data: { index: 1, confidence: 0.9 } };
      },
    };

    await runDom(request, adapter, jev);

    expect(calls).toHaveLength(1);
    expect(calls[0].question).toBe('Which element best matches the description: "Sign in button"?');
    expect(calls[0].options).toEqual(selectCandidates(currentSnapshot.elements, request.action).map(describeCandidate));
    expect(calls[0].signalArg).toBe(signal);
  });

  it("fails when choice returns ok false", async () => {
    const currentSnapshot = snapshot([element({ id: 2, role: "button", name: "Sign in" })]);

    const adapter = {
      snapshot: async () => ({ ok: true as const, data: currentSnapshot }),
    };

    const jev = {
      choice: async () => ({ ok: false as const, reason: "upstream error" }),
    };

    const result = await runDom(baseRequest(), adapter, jev);

    expect(result.attempt.ok).toBe(false);
    expect(result.attempt.reason).toContain("upstream");
    expect(result.snapshot).toBe(currentSnapshot);
    expect(result.attempt.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("fails when index is null and leaves attempt.confidence undefined", async () => {
    const currentSnapshot = snapshot([element({ id: 2, role: "button", name: "Sign in" })]);

    const adapter = {
      snapshot: async () => ({ ok: true as const, data: currentSnapshot }),
    };

    const jev = {
      choice: async () => ({ ok: true as const, data: { index: null, confidence: 0.95 } }),
    };

    const result = await runDom(baseRequest(), adapter, jev);

    expect(result.attempt.ok).toBe(false);
    expect(result.attempt.reason).toContain("no candidate");
    expect(result.attempt.confidence).toBeUndefined();
    expect(result.attempt.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("fails when index is out of range", async () => {
    const currentSnapshot = snapshot([element({ id: 2, role: "button", name: "Sign in" })]);

    const adapter = {
      snapshot: async () => ({ ok: true as const, data: currentSnapshot }),
    };

    const jev = {
      choice: async () => ({ ok: true as const, data: { index: 1, confidence: 0.88 } }),
    };

    const result = await runDom(baseRequest(), adapter, jev);

    expect(result.attempt.ok).toBe(false);
    expect(result.attempt.reason).toContain("out of range");
    expect(result.attempt.confidence).toBe(0.88);
    expect(result.attempt.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("fails when confidence is below 0.7 and succeeds at exactly 0.7", async () => {
    const currentSnapshot = snapshot([element({ id: 2, role: "button", name: "Sign in" })]);

    const adapter = {
      snapshot: async () => ({ ok: true as const, data: currentSnapshot }),
    };

    const lowConfidenceJev = {
      choice: async () => ({ ok: true as const, data: { index: 0, confidence: 0.69 } }),
    };

    const thresholdJev = {
      choice: async () => ({ ok: true as const, data: { index: 0, confidence: 0.7 } }),
    };

    const low = await runDom(baseRequest(), adapter, lowConfidenceJev);
    expect(low.attempt.ok).toBe(false);
    expect(low.attempt.reason).toContain("below");
    expect(low.attempt.confidence).toBe(0.69);
    expect(low.attempt.durationMs).toBeGreaterThanOrEqual(0);

    const pass = await runDom(baseRequest(), adapter, thresholdJev);
    expect(pass.attempt.ok).toBe(true);
    expect(pass.attempt.confidence).toBe(0.7);
    expect(pass.element).toEqual({ snapshotId: 2 });
    expect(pass.attempt.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("maps Jev index to candidates index when unusable elements shift the list", async () => {
    const currentSnapshot = snapshot([
      element({ id: 10, role: "button", name: "Blocked", hittable: false }),
      element({ id: 20, role: "button", name: "First usable" }),
      element({ id: 30, role: "button", name: "Second usable" }),
    ]);

    const adapter = {
      snapshot: async () => ({ ok: true as const, data: currentSnapshot }),
    };

    const jev = {
      choice: async () => ({ ok: true as const, data: { index: 0, confidence: 0.9 } }),
    };

    const result = await runDom(baseRequest(), adapter, jev);

    expect(result.attempt.ok).toBe(true);
    expect(result.element).toEqual({ snapshotId: 20 });
    expect(result.attempt.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("propagates errors thrown by adapter.snapshot", async () => {
    const adapter = {
      snapshot: async () => {
        throw new Error("adapter exploded");
      },
    };

    const jev = {
      choice: async () => ({ ok: true as const, data: { index: 0, confidence: 0.9 } }),
    };

    await expect(runDom(baseRequest(), adapter, jev)).rejects.toThrow("adapter exploded");
  });
});
