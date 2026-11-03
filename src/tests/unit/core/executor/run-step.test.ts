import { afterEach, describe, expect, it, vi } from "vitest";
import type { BrowserAction, BrowserCheck, DialogRecord } from "@/core/browser/index.js";
import { runStep } from "@/core/executor/run-step.js";
import { createRedact } from "@/core/executor/variables.js";
import type { Step } from "@/core/syntax/index.js";
import { failed, fakeAdapter, PNG } from "./fake-adapter.js";

const NEEDS_LOCATOR = "Locating by target needs the Element Locator, which is not available yet";
const NEEDS_ASSERTER = "Judging a natural-language condition needs the Asserter, which is not available yet";

const alert = (message: string): DialogRecord => ({ type: "alert", message, answer: "accepted", expected: true });

// Runs `step` as step 3 of a TestCase that holds only it.
async function run(step: Step, script: Parameters<typeof fakeAdapter>[0] = {}, vars: Record<string, string> = {}) {
  const { adapter, calls } = fakeAdapter(script);
  const redact = createRedact({ name: "t", timeoutMs: 1000, steps: [step] }, vars);
  const result = await runStep(step, 3, { browser: adapter, vars, redact });
  return { result, calls };
}

afterEach(() => vi.useRealTimers());

describe("runStep mapping", () => {
  it.each<[string, Step, BrowserAction]>([
    ["open", { line: 2, action: "open", url: "/login" }, { action: "open", url: "/login" }],
    ["back", { line: 2, action: "back" }, { action: "back" }],
    ["forward", { line: 2, action: "forward" }, { action: "forward" }],
    ["reload", { line: 2, action: "reload", dialog: { accept: false } }, { action: "reload", dialog: { accept: false } }],
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
    ["doubleClick", { line: 2, action: "doubleClick", selector: "#a" }, { action: "doubleClick", element: { selector: "#a" } }],
    ["rightClick", { line: 2, action: "rightClick", selector: "#a" }, { action: "rightClick", element: { selector: "#a" } }],
    ["hover", { line: 2, action: "hover", selector: "#a" }, { action: "hover", element: { selector: "#a" } }],
    [
      "input",
      { line: 2, action: "input", selector: "#email", value: "a@b.c" },
      { action: "input", element: { selector: "#email" }, value: "a@b.c" },
    ],
    [
      "click by selector with a target",
      { line: 2, action: "click", selector: "#go", target: "The Go button" },
      { action: "click", element: { selector: "#go" } },
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
    ["a target-only element action", { line: 2, action: "click", target: "The Go button" }, NEEDS_LOCATOR],
    ["a target-only input", { line: 2, action: "input", target: "The email field", value: "a@b.c" }, NEEDS_LOCATOR],
    ["waitFor with a condition", { line: 2, action: "waitFor", condition: "The list has loaded" }, NEEDS_ASSERTER],
    ["assert with only a statement", { line: 2, action: "assert", statement: "The list has loaded" }, NEEDS_ASSERTER],
  ])("fails %s without acting on the page", async (_case, step, reason) => {
    const { result, calls } = await run(step);

    expect(result).toMatchObject({ status: "failed", reason });
    expect(calls.filter((call) => call.method === "perform" || call.method === "check")).toEqual([]);
  });

  it("fails an assert whose check fails, adding that the statement needs the Asserter", async () => {
    const { result } = await run(
      { line: 2, action: "assert", check: { selector: "h1", text: "Hi" }, statement: "A greeting is shown" },
      { check: () => failed('Text of "h1" did not contain "Hi"') },
    );

    expect(result).toMatchObject({ status: "failed", reason: `Text of "h1" did not contain "Hi"; ${NEEDS_ASSERTER}` });
  });
});

describe("runStep results", () => {
  it("describes the step by its index, line, and action", async () => {
    const { result } = await run({ line: 7, action: "back" });

    expect(result).toMatchObject({ index: 3, line: 7, action: "back" });
  });

  it("sends the Adapter the step with its Variables filled in", async () => {
    const { calls } = await run({ line: 2, action: "input", selector: "#p", value: "{{PASSWORD}}" }, {}, { PASSWORD: "s3cret" });

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
      { ready: () => ({ ok: true, dialogs: [alert("first")] }), perform: () => ({ ok: true, dialogs: [alert("second")] }) },
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

  it("keeps the step's reason and has no screenshot when the screenshot cannot be read", async () => {
    const { result } = await run(
      { line: 2, action: "back" },
      { perform: () => failed("No page to go back to"), screenshot: () => ({ ok: false, reason: "The current tab was closed" }) },
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
