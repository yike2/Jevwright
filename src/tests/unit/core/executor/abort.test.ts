import { describe, expect, it } from "vitest";
import type { BrowserAdapter, LaunchOptions } from "@/core/browser/index.js";
import { execute, RunAbortedError, type StepEvent } from "@/core/executor/index.js";
import type { Step, TestCase } from "@/core/syntax/index.js";
import { fakeAdapter, OK, TRACE } from "./fake-adapter.js";

const steps: Step[] = [
  { line: 3, action: "open", url: "/login" },
  { line: 5, action: "click", selector: "#go" },
  { line: 7, action: "back" },
];

const testCase = (overrides: Partial<TestCase> = {}): TestCase => ({
  name: "t",
  baseUrl: "http://127.0.0.1:3000",
  timeoutMs: 1000,
  runTimeoutMs: 600000,
  steps,
  ...overrides,
});

const never = <T>() => new Promise<T>(() => {});
const later = <T>(ms: number, value: T) => new Promise<T>((resolve) => setTimeout(() => resolve(value), ms));

// Runs `test` and returns the RunAbortedError it throws, with the events it sent.
async function abort(test: TestCase, launch: (options: LaunchOptions) => Promise<BrowserAdapter>, vars = {}) {
  const events: StepEvent[] = [];
  const error = await execute(test, { headed: false, vars, onEvent: (event) => events.push(event) }, launch).then(
    () => undefined,
    (thrown: unknown) => thrown,
  );
  expect(error).toBeInstanceOf(RunAbortedError);
  return { error: error as RunAbortedError, events };
}

describe("execute, aborted Runs", () => {
  it("aborts with a timeout when a step outlasts the Run timeout, keeping earlier steps and the trace", async () => {
    // Like Playwright, closing the browser rejects the call that is still pending.
    let rejectPending: (error: Error) => void = () => {};
    const { adapter, calls } = fakeAdapter({
      perform: (action) => (action.action === "click" ? new Promise((_, reject) => (rejectPending = reject)) : OK),
      close: () => (rejectPending(new Error("Target page, context or browser has been closed")), TRACE),
    });

    const { error } = await abort(testCase({ runTimeoutMs: 50 }), async () => adapter);

    expect(error.name).toBe("RunAbortedError");
    expect(error.kind).toBe("timeout");
    expect(error.message).toBe("The run did not finish within runTimeoutMs (50 ms)");
    expect(error.steps.map(({ status }) => status)).toEqual(["passed", "failed", "pending"]);
    expect(error.steps[1]).toMatchObject({ reason: error.message, dialogs: [] });
    expect((error.steps[1] as { durationMs: number }).durationMs).toBeGreaterThanOrEqual(45);
    expect(error.steps[1]).not.toHaveProperty("screenshot");
    expect(error.trace).toBe(TRACE);
    expect(calls.at(-1)).toEqual({ method: "close" });
  });

  it("sends a finished event for the step that timed out and drops its late result", async () => {
    const { adapter, calls } = fakeAdapter({ perform: (action) => (action.action === "click" ? later(100, OK) : OK) });

    const { error, events } = await abort(testCase({ runTimeoutMs: 50 }), async () => adapter);
    await later(150, undefined);

    expect(events.at(-1)).toEqual({ type: "finished", result: error.steps[1] });
    expect(events.filter((event) => event.type === "finished")).toHaveLength(2);
    expect(error.steps[1]).toMatchObject({ status: "failed" });
    expect(calls).not.toContainEqual({ method: "perform", action: { action: "back" } });
  });

  it("aborts with an infrastructure error when an Adapter call throws, failing the running step", async () => {
    const crash = new Error("Browser closed while typing s3cret\n  call log: ...");
    const { adapter, calls } = fakeAdapter({ perform: (action) => (action.action === "click" ? Promise.reject(crash) : OK) });
    const test = testCase({ steps: [steps[0]!, { line: 5, action: "click", selector: "{{PASSWORD}}" }, steps[2]!] });

    const { error, events } = await abort(test, async () => adapter, { PASSWORD: "s3cret" });

    expect(error.kind).toBe("infrastructure");
    expect(error.message).toBe("Browser closed while typing {{PASSWORD}}");
    expect(error.cause).toBe(crash);
    expect(error.steps.map(({ status }) => status)).toEqual(["passed", "failed", "pending"]);
    expect(error.steps[1]).toMatchObject({ reason: error.message, dialogs: [] });
    expect(events.at(-1)).toEqual({ type: "finished", result: error.steps[1] });
    expect(error.trace).toBe(TRACE);
    expect(calls.at(-1)).toEqual({ method: "close" });
  });

  it("keeps both errors and returns no trace when closing fails after a crash", async () => {
    const crash = new Error("Browser has been closed");
    const closeError = new Error("Could not stop the trace");
    const { adapter } = fakeAdapter({ perform: () => Promise.reject(crash), close: () => Promise.reject(closeError) });

    const { error } = await abort(testCase(), async () => adapter);

    expect(error.kind).toBe("infrastructure");
    expect(error.message).toBe("Browser has been closed");
    expect((error.cause as AggregateError).errors).toEqual([crash, closeError]);
    expect(error.steps.map(({ status }) => status)).toEqual(["failed", "pending", "pending"]);
    expect(error.trace).toEqual(Buffer.alloc(0));
  });

  it("aborts with an infrastructure error when closing fails after the steps passed", async () => {
    const closeError = new Error("Could not stop the trace");
    const { adapter } = fakeAdapter({ close: () => Promise.reject(closeError) });

    const { error } = await abort(testCase(), async () => adapter);

    expect(error.kind).toBe("infrastructure");
    expect(error.message).toBe("Could not stop the trace");
    expect(error.cause).toBe(closeError);
    expect(error.steps.map(({ status }) => status)).toEqual(["passed", "passed", "passed"]);
    expect(error.trace).toEqual(Buffer.alloc(0));
  });

  it("keeps the close error as the cause when closing fails after a timeout", async () => {
    const closeError = new Error("Could not stop the trace");
    const { adapter } = fakeAdapter({ perform: () => never(), close: () => Promise.reject(closeError) });

    const { error } = await abort(testCase({ runTimeoutMs: 50 }), async () => adapter);

    expect(error.kind).toBe("timeout");
    expect(error.cause).toBe(closeError);
    expect(error.trace).toEqual(Buffer.alloc(0));
  });

  it("aborts with an infrastructure error and every step pending when launching fails", async () => {
    const launchError = new Error("Chromium did not start");

    const { error, events } = await abort(testCase(), () => Promise.reject(launchError));

    expect(error.kind).toBe("infrastructure");
    expect(error.message).toBe("Chromium did not start");
    expect(error.cause).toBe(launchError);
    expect(error.steps.map(({ status }) => status)).toEqual(["pending", "pending", "pending"]);
    expect(error.trace).toEqual(Buffer.alloc(0));
    expect(events).toEqual([]);
  });

  it("aborts with a timeout when launching outlasts the Run timeout, and closes the late browser", async () => {
    const { adapter, calls } = fakeAdapter();

    const { error, events } = await abort(testCase({ runTimeoutMs: 50 }), () => later(100, adapter));
    await later(100, undefined);

    expect(error.kind).toBe("timeout");
    expect(error.steps.map(({ status }) => status)).toEqual(["pending", "pending", "pending"]);
    expect(error.trace).toEqual(Buffer.alloc(0));
    expect(events).toEqual([]);
    expect(calls).toEqual([{ method: "close" }]);
  });

  it("still closes the browser and throws a RunAbortedError when onEvent throws for the step that crashed", async () => {
    const crash = new Error("Browser has been closed");
    const listenerError = new Error("WebSocket is closed");
    const { adapter, calls } = fakeAdapter({ perform: () => Promise.reject(crash) });
    const onEvent = (event: StepEvent) => {
      if (event.type === "finished") throw listenerError;
    };

    const error = await execute(testCase(), { headed: false, vars: {}, onEvent }, async () => adapter).catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(RunAbortedError);
    expect((error as RunAbortedError).message).toBe("Browser has been closed");
    expect(((error as RunAbortedError).cause as AggregateError).errors).toEqual([crash, listenerError]);
    expect(calls.at(-1)).toEqual({ method: "close" });
  });

  it("fails the step whose started event threw", async () => {
    const listenerError = new Error("WebSocket is closed");
    const { adapter } = fakeAdapter();
    const onEvent = (event: StepEvent) => {
      if (event.type === "started" && event.step.index === 1) throw listenerError;
    };

    const error = await execute(testCase(), { headed: false, vars: {}, onEvent }, async () => adapter).catch((thrown: unknown) => thrown);

    expect((error as RunAbortedError).steps.map(({ status }) => status)).toEqual(["passed", "failed", "pending"]);
    expect((error as RunAbortedError).steps[1]).toMatchObject({ reason: "WebSocket is closed" });
  });
});
