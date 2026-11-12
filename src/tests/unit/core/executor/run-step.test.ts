import { afterEach, describe, expect, it, vi } from "vitest";
import { QUESTION_PREFIX } from "@/core/asserter/constants.js";
import type { BrowserAction, BrowserCheck, DialogRecord, PageSnapshot } from "@/core/browser/index.js";
import type { JevClient } from "@/core/jev/index.js";
import { SELECTOR_PROBE_MS } from "@/core/locator/constants.js";
import { runStep } from "@/core/executor/run-step.js";
import { createRedact } from "@/core/executor/variables.js";
import type { Step } from "@/core/syntax/index.js";
import { failed, fakeAdapter, PNG, throwingJev } from "./fake-adapter.js";

const alert = (message: string): DialogRecord => ({ type: "alert", message, answer: "accepted", expected: true });

// Runs `step` as step 3 of a TestCase that holds only it.
async function run(
  step: Step,
  script: Parameters<typeof fakeAdapter>[0] = {},
  vars: Record<string, string> = {},
  screenshotEveryStep?: boolean,
) {
  const { adapter, calls } = fakeAdapter(script);
  const redact = createRedact({ name: "t", timeoutMs: 1000, runTimeoutMs: 600000, steps: [step] }, vars);
  const context = { browser: adapter, vars, redact, jev: throwingJev, timeoutMs: 1000, screenshotEveryStep };
  const result = await runStep(step, 3, context);
  return { result, calls };
}

function makeJev(overrides: Partial<JevClient> = {}): JevClient {
  return {
    bbox: vi.fn(async () => ({ ok: false as const, reason: "bbox not stubbed" })),
    choice: vi.fn(async () => ({ ok: false as const, reason: "choice not stubbed" })),
    noul: vi.fn(async () => ({ ok: false as const, reason: "noul not stubbed" })),
    ...overrides,
  };
}

const SNAPSHOT: PageSnapshot = {
  url: "https://example.test/",
  title: "Example",
  viewport: { width: 1000, height: 800 },
  elements: [
    {
      id: 101,
      tag: "button",
      role: "button",
      name: "Target",
      text: "Target",
      attrs: {},
      bbox: { x: 100, y: 100, width: 120, height: 40 },
      hittable: true,
    },
    {
      id: 202,
      tag: "input",
      role: "textbox",
      name: "Email",
      text: "",
      attrs: { type: "email" },
      bbox: { x: 300, y: 100, width: 220, height: 40 },
      hittable: true,
    },
  ],
};

afterEach(() => vi.useRealTimers());

describe("runStep mapping", () => {
  it.each<[string, Step, BrowserAction]>([
    ["open", { line: 2, action: "open", url: "/login" }, { action: "open", url: "/login" }],
    ["back", { line: 2, action: "back" }, { action: "back" }],
    ["forward", { line: 2, action: "forward" }, { action: "forward" }],
    [
      "reload",
      { line: 2, action: "reload", dialog: { accept: false } },
      { action: "reload", dialog: { accept: false } },
    ],
    ["press", { line: 2, action: "press", key: "Enter" }, { action: "press", key: "Enter" }],
    [
      "scroll",
      { line: 2, action: "scroll", direction: "down", distance: 300 },
      { action: "scroll", direction: "down", distance: 300 },
    ],
    ["sleep", { line: 2, action: "sleep", ms: 50 }, { action: "sleep", ms: 50 }],
    ["switchTab", { line: 2, action: "switchTab", url: "**/help" }, { action: "switchTab", url: "**/help" }],
  ])("performs %s with the step's fields after ready()", async (_action, step, action) => {
    const { result, calls } = await run(step);

    expect(calls).toEqual([{ method: "ready" }, { method: "perform", action }]);
    expect(result.status).toBe("passed");
  });

  it.each<[string, Step, BrowserAction]>([
    [
      "click by selector",
      { line: 2, action: "click", selector: "#go", dialog: { accept: true } },
      { action: "click", element: { selector: "#go" }, dialog: { accept: true } },
    ],
    [
      "doubleClick",
      { line: 2, action: "doubleClick", selector: "#a" },
      { action: "doubleClick", element: { selector: "#a" } },
    ],
    [
      "rightClick",
      { line: 2, action: "rightClick", selector: "#a" },
      { action: "rightClick", element: { selector: "#a" } },
    ],
    ["hover", { line: 2, action: "hover", selector: "#a" }, { action: "hover", element: { selector: "#a" } }],
    [
      "input",
      { line: 2, action: "input", selector: "#email", value: "a@b.c" },
      { action: "input", element: { selector: "#email" }, value: "a@b.c" },
    ],
    [
      "input with a dialog",
      { line: 2, action: "input", selector: "#name", value: "x", dialog: { accept: false } },
      { action: "input", element: { selector: "#name" }, value: "x", dialog: { accept: false } },
    ],
  ])("performs %s with the selector and records the selector locate method", async (_case, step, action) => {
    const { result, calls } = await run(step);

    expect(calls).toEqual([{ method: "ready" }, { method: "perform", action }]);
    expect(result).toMatchObject({ status: "passed", locateMethod: "selector" });
  });

  it("records the selector locate method when the action fails", async () => {
    const { result } = await run(
      { line: 2, action: "click", selector: "#gone" },
      { perform: () => failed("Timeout 1000ms exceeded waiting for #gone") },
    );

    expect(result).toMatchObject({
      status: "failed",
      locateMethod: "selector",
      reason: "Timeout 1000ms exceeded waiting for #gone",
    });
  });

  it.each<[string, Step]>([
    ["click", { line: 2, action: "click", selector: "#old-id", target: "The Go button" }],
    ["input", { line: 2, action: "input", selector: "#old-id", target: "The email field", value: "a@b.c" }],
  ])("reports the perform failure when the selector of a %s with a target is visible", async (_action, step) => {
    const { result } = await run(step, {
      isVisible: () => ({ ok: true, data: true }),
      perform: () => failed("Timeout 1000ms exceeded waiting for #old-id"),
    });

    expect(result).toMatchObject({
      status: "failed",
      reason: "Timeout 1000ms exceeded waiting for #old-id",
    });
  });

  it.each<[string, Step, BrowserCheck]>([
    ["waitFor selector", { line: 2, action: "waitFor", selector: ".done" }, { check: "visible", selector: ".done" }],
    ["waitFor url", { line: 2, action: "waitFor", url: "**/done" }, { check: "url", url: "**/done" }],
    [
      "assert selector",
      { line: 2, action: "assert", check: { selector: ".done" } },
      { check: "visible", selector: ".done" },
    ],
    [
      "assert selector and text",
      { line: 2, action: "assert", check: { selector: "h1", text: "Hi" } },
      { check: "text", selector: "h1", text: "Hi" },
    ],
    ["assert url", { line: 2, action: "assert", check: { url: "**/done" } }, { check: "url", url: "**/done" }],
    [
      "assert check with a statement",
      { line: 2, action: "assert", check: { selector: "h1", text: "Hi" }, statement: "A greeting is shown" },
      { check: "text", selector: "h1", text: "Hi" },
    ],
  ])("checks %s after ready()", async (_case, step, check) => {
    const { result, calls } = await run(step);

    expect(calls).toEqual([{ method: "ready" }, { method: "check", check }]);
    expect(result).toMatchObject({ status: "passed" });
    expect(result).not.toHaveProperty("locateMethod");
  });
});

describe("runStep steps that need Jev", () => {
  it.each<[string, Step, string]>([
    [
      "a target-only element action",
      { line: 2, action: "click", target: "The Go button" },
      'Could not locate "The Go button":\n  visual — No snapshot in the fake\n  dom — No snapshot in the fake',
    ],
    [
      "a target-only input",
      { line: 2, action: "input", target: "The email field", value: "a@b.c" },
      'Could not locate "The email field":\n  visual — No snapshot in the fake\n  dom — No snapshot in the fake',
    ],
  ])("fails %s without acting on the page", async (_case, step, reason) => {
    const { result, calls } = await run(step);

    expect(result).toMatchObject({ status: "failed", reason });
    expect(calls.filter((call) => call.method === "perform" || call.method === "check")).toEqual([]);
  });
});

describe("runStep results", () => {
  it("describes the step by its index, line, and action", async () => {
    const { result } = await run({ line: 7, action: "back" });

    expect(result).toMatchObject({ index: 3, line: 7, action: "back" });
  });

  it("sends the Adapter the step with its Variables filled in", async () => {
    const { calls } = await run(
      { line: 2, action: "input", selector: "#p", value: "{{PASSWORD}}" },
      {},
      { PASSWORD: "s3cret" },
    );

    expect(calls).toContainEqual({
      method: "perform",
      action: { action: "input", element: { selector: "#p" }, value: "s3cret" },
    });
  });

  it("fails a step with a missing Variable before ready() or its Adapter call", async () => {
    const { result, calls } = await run({ line: 2, action: "open", url: "{{BASE}}/{{PATH}}" });

    expect(result).toMatchObject({ status: "failed", reason: "Variables {{BASE}}, {{PATH}} are not set" });
    expect(calls).toEqual([{ method: "screenshot" }]);
  });

  it("names a single missing Variable", async () => {
    const { result } = await run({ line: 2, action: "open", url: "{{BASE}}/login" });

    expect(result).toMatchObject({ status: "failed", reason: "Variable {{BASE}} is not set" });
  });

  it("fails without its Adapter call when ready() fails, keeping the dialogs ready() answered", async () => {
    const { result, calls } = await run(
      { line: 2, action: "back" },
      { ready: () => failed('Unexpected alert dialog: "Hi"', [alert("Hi")]) },
    );

    expect(result).toMatchObject({ status: "failed", reason: 'Unexpected alert dialog: "Hi"', dialogs: [alert("Hi")] });
    expect(calls.map((call) => call.method)).toEqual(["ready", "screenshot"]);
  });

  it("lists the dialogs of ready() before those of the step's call", async () => {
    const { result } = await run(
      { line: 2, action: "click", selector: "#go" },
      {
        ready: () => ({ ok: true, dialogs: [alert("first")] }),
        perform: () => ({ ok: true, dialogs: [alert("second")] }),
      },
    );

    expect(result).toMatchObject({ status: "passed", dialogs: [alert("first"), alert("second")] });
  });

  it("attaches a screenshot to a failed step", async () => {
    const { result } = await run({ line: 2, action: "back" }, { perform: () => failed("No page to go back to") });

    expect(result).toMatchObject({ status: "failed", reason: "No page to go back to", screenshot: PNG });
  });

  it("takes no screenshot of a passed step", async () => {
    const { result, calls } = await run({ line: 2, action: "back" });

    expect(calls.map((call) => call.method)).not.toContain("screenshot");
    expect(result).not.toHaveProperty("screenshot");
  });

  it("attaches a screenshot to a passed step with screenshotEveryStep, after its Adapter call", async () => {
    const { result, calls } = await run({ line: 2, action: "back" }, {}, {}, true);

    expect(calls.map((call) => call.method)).toEqual(["ready", "perform", "screenshot"]);
    expect(result).toMatchObject({ status: "passed", screenshot: PNG });
  });

  it("takes one screenshot of a failed step with screenshotEveryStep", async () => {
    const { result, calls } = await run(
      { line: 2, action: "back" },
      { perform: () => failed("No page to go back to") },
      {},
      true,
    );

    expect(calls.filter((call) => call.method === "screenshot")).toHaveLength(1);
    expect(result).toMatchObject({ status: "failed", screenshot: PNG });
  });

  it("passes a step without a screenshot when screenshotEveryStep cannot read one", async () => {
    const { result } = await run(
      { line: 2, action: "back" },
      { screenshot: () => ({ ok: false, reason: "The current tab was closed" }) },
      {},
      true,
    );

    expect(result).toMatchObject({ status: "passed" });
    expect(result).not.toHaveProperty("screenshot");
  });

  it("keeps the step's reason and has no screenshot when the screenshot cannot be read", async () => {
    const { result } = await run(
      { line: 2, action: "back" },
      {
        perform: () => failed("No page to go back to"),
        screenshot: () => ({ ok: false, reason: "The current tab was closed" }),
      },
    );

    expect(result).toMatchObject({ status: "failed", reason: "No page to go back to" });
    expect(result).not.toHaveProperty("screenshot");
  });

  it("redacts Variable values in the reason and dialog messages", async () => {
    const { result } = await run(
      { line: 2, action: "assert", check: { selector: "#user", text: "{{EMAIL}}" } },
      { check: () => failed('Text of "#user" did not contain "a@b.c"', [alert("Hello a@b.c")]) },
      { EMAIL: "a@b.c" },
    );

    expect(result).toMatchObject({
      reason: 'Text of "#user" did not contain "{{EMAIL}}"',
      dialogs: [alert("Hello {{EMAIL}}")],
    });
  });

  it("records when the step started and how long it ran, without the failure screenshot", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-03T10:00:00.000Z"));
    const { result } = await run(
      { line: 2, action: "back" },
      {
        perform: () => {
          vi.setSystemTime(new Date("2026-11-03T10:00:00.250Z"));
          return failed("No page to go back to");
        },
        screenshot: () => {
          vi.setSystemTime(new Date("2026-11-03T10:00:05.000Z"));
          return { ok: true, data: PNG };
        },
      },
    );

    expect(result).toMatchObject({ startedAt: "2026-11-03T10:00:00.000Z", durationMs: 250 });
  });
});

describe("runStep locator integration", () => {
  it("target only, visual succeeds: perform receives { snapshotId } and locateMethod visual", async () => {
    const jev = makeJev({
      bbox: vi.fn(async () => ({
        ok: true as const,
        data: { box: { x: 120, y: 110, width: 20, height: 20 }, confidence: 0.95 },
      })),
    });
    const { adapter, calls } = fakeAdapter({
      snapshot: () => ({ ok: true, data: SNAPSHOT }),
      perform: (action) => {
        expect(action).toEqual({ action: "click", element: { snapshotId: 101 } });
        return { ok: true, dialogs: [] };
      },
    });

    const step: Step = { line: 2, action: "click", target: "The target button" };
    const redact = createRedact({ name: "t", timeoutMs: 1000, runTimeoutMs: 600000, steps: [step] }, {});
    const result = await runStep(step, 3, { browser: adapter, vars: {}, redact, jev, timeoutMs: 1000 });

    expect(result).toMatchObject({ status: "passed", locateMethod: "visual" });
    expect(calls).toEqual([
      { method: "ready" },
      { method: "screenshot" },
      { method: "snapshot" },
      { method: "perform", action: { action: "click", element: { snapshotId: 101 } } },
    ]);
    expect(jev.choice).not.toHaveBeenCalled();
  });

  it("selector + target, selector visible: perform receives { selector }, locateMethod selector, Jev not called", async () => {
    const jev = makeJev();
    const { adapter, calls } = fakeAdapter({ isVisible: () => ({ ok: true, data: true }) });

    const step: Step = { line: 2, action: "hover", selector: "#go", target: "Go button" };
    const redact = createRedact({ name: "t", timeoutMs: 1000, runTimeoutMs: 600000, steps: [step] }, {});
    const result = await runStep(step, 3, { browser: adapter, vars: {}, redact, jev, timeoutMs: 1000 });

    expect(result).toMatchObject({ status: "passed", locateMethod: "selector" });
    expect(calls).toEqual([
      { method: "ready" },
      { method: "isVisible", selector: "#go", timeoutMs: 1000 },
      { method: "perform", action: { action: "hover", element: { selector: "#go" } } },
    ]);
    expect(jev.bbox).not.toHaveBeenCalled();
    expect(jev.choice).not.toHaveBeenCalled();
  });

  it("selector + target, selector not visible: falls back to visual and probes with min(SELECTOR_PROBE_MS, timeoutMs)", async () => {
    const timeoutMs = 500;
    const jev = makeJev({
      bbox: vi.fn(async () => ({
        ok: true as const,
        data: { box: { x: 120, y: 110, width: 20, height: 20 }, confidence: 0.95 },
      })),
    });
    const { adapter, calls } = fakeAdapter({
      isVisible: () => ({ ok: true, data: false }),
      snapshot: () => ({ ok: true, data: SNAPSHOT }),
    });

    const step: Step = { line: 2, action: "click", selector: "#legacy", target: "The target button" };
    const redact = createRedact({ name: "t", timeoutMs, runTimeoutMs: 600000, steps: [step] }, {});
    const result = await runStep(step, 3, { browser: adapter, vars: {}, redact, jev, timeoutMs });

    expect(result).toMatchObject({ status: "passed", locateMethod: "visual" });
    expect(calls).toContainEqual({
      method: "isVisible",
      selector: "#legacy",
      timeoutMs: Math.min(SELECTOR_PROBE_MS, timeoutMs),
    });
  });

  it("input with target: perform receives located element and value", async () => {
    const jev = makeJev({
      bbox: vi.fn(async () => ({
        ok: true as const,
        data: { box: { x: 320, y: 110, width: 20, height: 20 }, confidence: 0.9 },
      })),
    });
    const { adapter, calls } = fakeAdapter({ snapshot: () => ({ ok: true, data: SNAPSHOT }) });

    const step: Step = { line: 2, action: "input", target: "Email", value: "a@b.c" };
    const redact = createRedact({ name: "t", timeoutMs: 1000, runTimeoutMs: 600000, steps: [step] }, {});
    const result = await runStep(step, 3, { browser: adapter, vars: {}, redact, jev, timeoutMs: 1000 });

    expect(result).toMatchObject({ status: "passed", locateMethod: "visual" });
    expect(calls).toContainEqual({
      method: "perform",
      action: { action: "input", element: { snapshotId: 202 }, value: "a@b.c" },
    });
  });

  it("locate fails (LocateError): step fails with the LocateError message, perform not called", async () => {
    const jev = makeJev();
    const { adapter, calls } = fakeAdapter();

    const step: Step = { line: 2, action: "click", target: "The Go button" };
    const redact = createRedact({ name: "t", timeoutMs: 1000, runTimeoutMs: 600000, steps: [step] }, {});
    const result = await runStep(step, 3, { browser: adapter, vars: {}, redact, jev, timeoutMs: 1000 });

    expect(result).toMatchObject({
      status: "failed",
      reason: 'Could not locate "The Go button":\n  visual — No snapshot in the fake\n  dom — No snapshot in the fake',
    });
    expect(calls.filter((call) => call.method === "perform")).toEqual([]);
  });

  it("a non-LocateError thrown by the adapter propagates from runStep", async () => {
    const jev = makeJev();
    const { adapter } = fakeAdapter({
      snapshot: () => {
        throw new Error("Browser disconnected");
      },
    });

    const step: Step = { line: 2, action: "click", target: "The Go button" };
    const redact = createRedact({ name: "t", timeoutMs: 1000, runTimeoutMs: 600000, steps: [step] }, {});

    await expect(runStep(step, 3, { browser: adapter, vars: {}, redact, jev, timeoutMs: 1000 })).rejects.toThrow(
      "Browser disconnected",
    );
  });

  it("passes context timeoutMs to locate", async () => {
    const timeoutMs = 321;
    const jev = makeJev({
      bbox: vi.fn(async () => ({
        ok: true as const,
        data: { box: { x: 120, y: 110, width: 20, height: 20 }, confidence: 0.95 },
      })),
    });
    const { adapter, calls } = fakeAdapter({
      isVisible: (_selector, probedTimeoutMs) => ({ ok: true, data: probedTimeoutMs === timeoutMs ? false : true }),
      snapshot: () => ({ ok: true, data: SNAPSHOT }),
    });

    const step: Step = { line: 2, action: "click", selector: "#legacy", target: "The target button" };
    const redact = createRedact({ name: "t", timeoutMs, runTimeoutMs: 600000, steps: [step] }, {});
    const result = await runStep(step, 3, { browser: adapter, vars: {}, redact, jev, timeoutMs });

    expect(result).toMatchObject({ status: "passed", locateMethod: "visual" });
    expect(calls).toContainEqual({ method: "isVisible", selector: "#legacy", timeoutMs });
  });
});

describe("runStep asserter integration", () => {
  function makeJevWithNoul(noul: JevClient["noul"]): JevClient {
    return {
      bbox: vi.fn(async () => ({ ok: false as const, reason: "bbox not stubbed" })),
      choice: vi.fn(async () => ({ ok: false as const, reason: "choice not stubbed" })),
      noul,
    };
  }

  it("waitFor condition holds (noul=0.9): passed and asks once with QUESTION_PREFIX + condition", async () => {
    const condition = "The list has loaded";
    const noul = vi.fn<JevClient["noul"]>(async () => ({ ok: true as const, data: { probability: 0.9 } }));
    const jev = makeJevWithNoul(noul);
    const { adapter } = fakeAdapter();
    const step: Step = { line: 2, action: "waitFor", condition };
    const redact = createRedact({ name: "t", timeoutMs: 1000, runTimeoutMs: 600000, steps: [step] }, {});

    const result = await runStep(step, 3, { browser: adapter, vars: {}, redact, jev, timeoutMs: 1000 });

    expect(result).toMatchObject({ status: "passed" });
    expect(noul).toHaveBeenCalledTimes(1);
    expect(noul).toHaveBeenCalledWith(`${QUESTION_PREFIX}${condition}`, { image: PNG });
  });

  it("waitFor condition never holds with timeoutMs 0: failed with timeout reason", async () => {
    const noul = vi.fn<JevClient["noul"]>(async () => ({ ok: true as const, data: { probability: 0.1 } }));
    const jev = makeJevWithNoul(noul);
    const { adapter } = fakeAdapter();
    const step: Step = { line: 2, action: "waitFor", condition: "The list has loaded" };
    const redact = createRedact({ name: "t", timeoutMs: 0, runTimeoutMs: 600000, steps: [step] }, {});

    const result = await runStep(step, 3, { browser: adapter, vars: {}, redact, jev, timeoutMs: 0 });

    expect(result).toMatchObject({ status: "failed", reason: "Condition did not hold within 0ms (last noul=0.1)" });
  });

  it.each([
    { probability: 0.9, status: "passed" },
    { probability: 0.1, status: "failed", reason: "Statement does not hold (noul=0.1)" },
  ] as const)("assert statement only (noul=$probability): $status", async ({ probability, status, reason }) => {
    const noul = vi.fn<JevClient["noul"]>(async () => ({ ok: true as const, data: { probability } }));
    const jev = makeJevWithNoul(noul);
    const { adapter } = fakeAdapter();
    const step: Step = { line: 2, action: "assert", statement: "The list has loaded" };
    const redact = createRedact({ name: "t", timeoutMs: 1000, runTimeoutMs: 600000, steps: [step] }, {});

    const result = await runStep(step, 3, { browser: adapter, vars: {}, redact, jev, timeoutMs: 1000 });

    expect(result).toMatchObject({ status, ...(reason ? { reason } : {}) });
  });

  it("assert check passes with a statement: Jev not called", async () => {
    const noul = vi.fn<JevClient["noul"]>(async () => ({ ok: true as const, data: { probability: 0.9 } }));
    const jev = makeJevWithNoul(noul);
    const { adapter } = fakeAdapter();
    const step: Step = {
      line: 2,
      action: "assert",
      check: { selector: "h1", text: "Hi" },
      statement: "A greeting is shown",
    };
    const redact = createRedact({ name: "t", timeoutMs: 1000, runTimeoutMs: 600000, steps: [step] }, {});

    const result = await runStep(step, 3, { browser: adapter, vars: {}, redact, jev, timeoutMs: 1000 });

    expect(result).toMatchObject({ status: "passed" });
    expect(noul).not.toHaveBeenCalled();
  });

  it("assert check fails and statement holds: passed and keeps check dialogs", async () => {
    const noul = vi.fn<JevClient["noul"]>(async () => ({ ok: true as const, data: { probability: 0.9 } }));
    const jev = makeJevWithNoul(noul);
    const checkDialogs = [alert("Check said no")];
    const { adapter } = fakeAdapter({ check: () => failed('Text of "h1" did not contain "Hi"', checkDialogs) });
    const step: Step = {
      line: 2,
      action: "assert",
      check: { selector: "h1", text: "Hi" },
      statement: "A greeting is shown",
    };
    const redact = createRedact({ name: "t", timeoutMs: 1000, runTimeoutMs: 600000, steps: [step] }, {});

    const result = await runStep(step, 3, { browser: adapter, vars: {}, redact, jev, timeoutMs: 1000 });

    expect(result).toMatchObject({ status: "passed", dialogs: checkDialogs });
  });

  it("assert check fails and statement does not hold: failed with combined reason", async () => {
    const noul = vi.fn<JevClient["noul"]>(async () => ({ ok: true as const, data: { probability: 0.1 } }));
    const jev = makeJevWithNoul(noul);
    const checkDialogs = [alert("Check said no")];
    const { adapter } = fakeAdapter({ check: () => failed('Text of "h1" did not contain "Hi"', checkDialogs) });
    const step: Step = {
      line: 2,
      action: "assert",
      check: { selector: "h1", text: "Hi" },
      statement: "A greeting is shown",
    };
    const redact = createRedact({ name: "t", timeoutMs: 1000, runTimeoutMs: 600000, steps: [step] }, {});

    const result = await runStep(step, 3, { browser: adapter, vars: {}, redact, jev, timeoutMs: 1000 });

    expect(result).toMatchObject({
      status: "failed",
      reason: 'Text of "h1" did not contain "Hi"; Statement does not hold (noul=0.1)',
      dialogs: checkDialogs,
    });
  });

  it("noul returns { ok: false, reason }: failed with that reason", async () => {
    const noul = vi.fn<JevClient["noul"]>(async () => ({ ok: false as const, reason: "Service unavailable" }));
    const jev = makeJevWithNoul(noul);
    const { adapter } = fakeAdapter();
    const step: Step = { line: 2, action: "assert", statement: "The list has loaded" };
    const redact = createRedact({ name: "t", timeoutMs: 1000, runTimeoutMs: 600000, steps: [step] }, {});

    const result = await runStep(step, 3, { browser: adapter, vars: {}, redact, jev, timeoutMs: 1000 });

    expect(result).toMatchObject({ status: "failed", reason: "Service unavailable" });
  });

  it("noul throws: runStep rejects with the same error", async () => {
    const error = new Error("noul exploded");
    const noul = vi.fn<JevClient["noul"]>(async () => {
      throw error;
    });
    const jev = makeJevWithNoul(noul);
    const { adapter } = fakeAdapter();
    const step: Step = { line: 2, action: "assert", statement: "The list has loaded" };
    const redact = createRedact({ name: "t", timeoutMs: 1000, runTimeoutMs: 600000, steps: [step] }, {});

    await expect(runStep(step, 3, { browser: adapter, vars: {}, redact, jev, timeoutMs: 1000 })).rejects.toBe(error);
  });
});
