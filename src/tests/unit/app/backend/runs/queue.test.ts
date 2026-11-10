import { describe, expect, it, vi } from "vitest";
import { RunQueue } from "@/app/backend/src/runs/queue.js";

// A run function whose Runs finish only when the test releases them.
function controlledRuns() {
  const started: string[] = [];
  const release = new Map<string, () => void>();
  let running = 0;
  let maxRunning = 0;
  const run = (runId: string) =>
    new Promise<void>((resolve) => {
      started.push(runId);
      running += 1;
      maxRunning = Math.max(maxRunning, running);
      release.set(runId, () => {
        running -= 1;
        resolve();
      });
    });
  return { run, started, release: (runId: string) => release.get(runId)?.(), max: () => maxRunning };
}

const tick = () => new Promise((resolve) => setImmediate(resolve));

describe("RunQueue", () => {
  it("starts Runs in the order they were enqueued", async () => {
    const order: string[] = [];
    const queue = new RunQueue(async (runId) => void order.push(runId), 1);

    for (const runId of ["a", "b", "c", "d"]) queue.enqueue(runId);
    await queue.idle();

    expect(order).toEqual(["a", "b", "c", "d"]);
  });

  it("runs at most `concurrency` Runs at a time, starting the next as one finishes", async () => {
    const runs = controlledRuns();
    const queue = new RunQueue(runs.run, 2);

    for (const runId of ["a", "b", "c"]) queue.enqueue(runId);
    await tick();
    expect(runs.started).toEqual(["a", "b"]);

    runs.release("b");
    await tick();
    expect(runs.started).toEqual(["a", "b", "c"]);

    runs.release("a");
    runs.release("c");
    await queue.idle();
    expect(runs.max()).toBe(2);
  });

  it("keeps a Run waiting while another runs with a concurrency of 1", async () => {
    const runs = controlledRuns();
    const queue = new RunQueue(runs.run, 1);

    queue.enqueue("a");
    queue.enqueue("b");
    await tick();
    expect(runs.started).toEqual(["a"]);

    runs.release("a");
    await tick();
    expect(runs.started).toEqual(["a", "b"]);
    runs.release("b");
    await queue.idle();
  });

  it("goes on with the next Run when one fails, and logs the failure", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const order: string[] = [];
    const queue = new RunQueue(async (runId) => {
      order.push(runId);
      if (runId === "a") throw new Error("boom");
    }, 1);

    queue.enqueue("a");
    queue.enqueue("b");
    await queue.idle();

    expect(order).toEqual(["a", "b"]);
    expect(error).toHaveBeenCalledWith(expect.stringContaining("a"), expect.any(Error));
    error.mockRestore();
  });

  it("is idle at once when nothing was enqueued", async () => {
    await expect(new RunQueue(async () => {}, 1).idle()).resolves.toBeUndefined();
  });
});
