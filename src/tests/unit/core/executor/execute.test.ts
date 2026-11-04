import { afterEach, describe, expect, it, vi } from "vitest";
import type { LaunchOptions } from "@/core/browser/index.js";
import { execute, type ExecuteOptions, type StepEvent } from "@/core/executor/index.js";
import type { Step, TestCase } from "@/core/syntax/index.js";
import { failed, fakeAdapter, TRACE } from "./fake-adapter.js";

const steps: Step[] = [
  { line: 3, action: "open", url: "/login" },
  { line: 5, action: "click", selector: "#go" },
  { line: 7, action: "back" },
];

const testCase = (overrides: Partial<TestCase> = {}): TestCase => ({
  name: "t",
  baseUrl: "http://127.0.0.1:3000",
  timeoutMs: 1000,
  steps,
  ...overrides,
});

// Runs `test` on a fake browser; returns the result, the Adapter calls, the launch options, and the events.
async function run(test: TestCase, script: Parameters<typeof fakeAdapter>[0] = {}, options: Partial<ExecuteOptions> = {}) {
  const { adapter, calls } = fakeAdapter(script);
  const launches: LaunchOptions[] = [];
  const events: StepEvent[] = [];
  const launch = async (launchOptions: LaunchOptions) => (launches.push(launchOptions), adapter);
  const result = await execute(test, { headed: false, vars: {}, onEvent: (event) => events.push(event), ...options }, launch);
  return { result, calls, launches, events };
}

// Fails the step whose action is `action`.
const failOn = (action: string) => ({
  perform: (step: { action: string }) => (step.action === action ? failed(`${action} failed`) : { ok: true as const, dialogs: [] }),
});

afterEach(() => vi.useRealTimers());

describe("execute", () => {
  it("launches the browser with headed and the TestCase's baseUrl and timeoutMs", async () => {
    const { launches } = await run(testCase({ timeoutMs: 4321 }), {}, { headed: true });

    expect(launches).toEqual([{ headed: true, baseUrl: "http://127.0.0.1:3000", timeoutMs: 4321 }]);
  });

  it("runs every step in order and returns their results with the trace", async () => {
    const { result, calls } = await run(testCase());

    expect(calls.filter((call) => call.method === "perform").map((call) => "action" in call && call.action.action)).toEqual([
      "open",
      "click",
      "back",
    ]);
    expect(result.steps.map(({ index, line, status }) => ({ index, line, status }))).toEqual([
      { index: 0, line: 3, status: "passed" },
      { index: 1, line: 5, status: "passed" },
      { index: 2, line: 7, status: "passed" },
    ]);
    expect(result.trace).toBe(TRACE);
  });

  it("stops at the first failed step and marks the later steps pending", async () => {
    const { result, calls } = await run(testCase(), failOn("click"));

    expect(result.steps.map(({ status }) => status)).toEqual(["passed", "failed", "pending"]);
    expect(result.steps[2]).toEqual({ index: 2, line: 7, action: "back", status: "pending" });
    expect(calls).not.toContainEqual({ method: "perform", action: { action: "back" } });
  });

  it("sends a started and a finished event for each step it runs, and none for pending steps", async () => {
    const { result, events } = await run(testCase(), failOn("click"));

    expect(events).toEqual([
      { type: "started", step: { index: 0, line: 3, action: "open" } },
      { type: "finished", result: result.steps[0] },
      { type: "started", step: { index: 1, line: 5, action: "click" } },
      { type: "finished", result: result.steps[1] },
    ]);
  });

  it("closes the browser and returns the trace after a failed step", async () => {
    const { result, calls } = await run(testCase(), failOn("open"));

    expect(calls.at(-1)).toEqual({ method: "close" });
    expect(result.trace).toBe(TRACE);
  });

  it("closes the browser and rethrows when the Adapter throws", async () => {
    const crash = new Error("Browser has been closed");
    const { adapter, calls } = fakeAdapter({ perform: () => Promise.reject(crash) });

    await expect(execute(testCase(), { headed: false, vars: {}, onEvent: () => {} }, async () => adapter)).rejects.toBe(crash);
    expect(calls.at(-1)).toEqual({ method: "close" });
  });

  it("throws both errors when closing also fails after the Adapter threw", async () => {
    const crash = new Error("Browser has been closed");
    const closeError = new Error("Could not stop the trace");
    const { adapter } = fakeAdapter({ perform: () => Promise.reject(crash), close: () => Promise.reject(closeError) });

    const error = await execute(testCase(), { headed: false, vars: {}, onEvent: () => {} }, async () => adapter).catch(
      (thrown: unknown) => thrown,
    );

    expect(error).toBeInstanceOf(AggregateError);
    expect((error as AggregateError).errors).toEqual([crash, closeError]);
  });

  it("rethrows when launching fails", async () => {
    const launchError = new Error("Chromium did not start");

    await expect(
      execute(testCase(), { headed: false, vars: {}, onEvent: () => {} }, () => Promise.reject(launchError)),
    ).rejects.toBe(launchError);
  });

  it("fills Variables in the baseUrl before launching", async () => {
    const { launches } = await run(testCase({ baseUrl: "{{BASE}}/app" }), {}, { vars: { BASE: "https://demo.test" } });

    expect(launches).toEqual([{ headed: false, baseUrl: "https://demo.test/app", timeoutMs: 1000 }]);
  });

  it("fails the first step without launching when a Variable in the baseUrl is missing", async () => {
    const { result, launches, events } = await run(testCase({ baseUrl: "{{BASE}}" }));

    expect(launches).toEqual([]);
    expect(result.steps.map(({ status }) => status)).toEqual(["failed", "pending", "pending"]);
    expect(result.steps[0]).toMatchObject({ reason: "Variable {{BASE}} is not set", dialogs: [] });
    expect(result.steps[0]).not.toHaveProperty("screenshot");
    expect(result.trace).toEqual(Buffer.alloc(0));
    expect(events).toEqual([
      { type: "started", step: { index: 0, line: 3, action: "open" } },
      { type: "finished", result: result.steps[0] },
    ]);
  });

  it("returns no Step results for a TestCase without steps, even with a missing baseUrl Variable", async () => {
    const ran = run(testCase({ baseUrl: "{{BASE}}", steps: [] }));

    await expect(ran.then(({ result }) => result)).resolves.toEqual({ steps: [], trace: Buffer.alloc(0) });
    expect((await ran).launches).toEqual([]);
  });

  it("records when the first step failed for a missing baseUrl Variable", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-03T10:00:00.000Z"));
    const { result } = await run(testCase({ baseUrl: "{{BASE}}" }));

    expect(result.steps[0]).toMatchObject({ startedAt: "2026-11-03T10:00:00.000Z", durationMs: 0 });
  });

  it("redacts Variable values in the events it sends", async () => {
    const { events } = await run(
      testCase({ steps: [{ line: 3, action: "input", selector: "#p", value: "{{PASSWORD}}" }] }),
      { perform: () => failed("Typed s3cret into a disabled field") },
      { vars: { PASSWORD: "s3cret" } },
    );

    expect(events.at(-1)).toMatchObject({ type: "finished", result: { reason: "Typed {{PASSWORD}} into a disabled field" } });
  });
});
