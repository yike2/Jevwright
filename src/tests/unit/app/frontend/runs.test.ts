import { describe, expect, it } from "vitest";

import type { LiveMessage, Run, Step } from "@/app/frontend/lib/api.js";
import {
  applyLiveMessage,
  formatDuration,
  isFinalLiveMessage,
  isFinalStatus,
  liveUrl,
  runErrorText,
  runFileUrl,
  runStatusLabel,
  stepStatusLabel,
  type LiveState,
} from "@/app/frontend/lib/runs.js";

const queueRun: Run = {
  id: "run-1",
  testFileId: "tf-1",
  projectId: "p-1",
  path: "Auth/flow.yaml",
  fileName: "flow.yaml",
  name: "flow",
  status: "queued",
  createdAt: "2026-11-13T00:00:00.000Z",
  startedAt: null,
  finishedAt: null,
  durationMs: null,
  summary: {
    total: 1,
    passed: 0,
    failed: 0,
    pending: 1,
  },
  error: null,
};

const pendingStep: Step = {
  index: 0,
  line: 1,
  action: "open",
  status: "pending",
};

const runningStep: Step = {
  index: 0,
  line: 1,
  action: "open",
  status: "running",
  startedAt: "2026-11-13T00:00:05.000Z",
};

describe("run helpers", () => {
  it("labels run statuses", () => {
    expect(runStatusLabel("queued")).toBe("Queued");
    expect(runStatusLabel("running")).toBe("Running");
    expect(runStatusLabel("passed")).toBe("Passed");
    expect(runStatusLabel("failed")).toBe("Failed");
  });

  it("labels step statuses", () => {
    expect(stepStatusLabel("pending")).toBe("Pending");
    expect(stepStatusLabel("running")).toBe("Running");
    expect(stepStatusLabel("passed")).toBe("Passed");
    expect(stepStatusLabel("failed")).toBe("Failed");
  });

  it("formats durations", () => {
    expect(formatDuration(null)).toBe("—");
    expect(formatDuration(850)).toBe("850 ms");
    expect(formatDuration(1000)).toBe("1.0 s");
    expect(formatDuration(1400)).toBe("1.4 s");
  });

  it("builds live websocket URLs", () => {
    expect(liveUrl("http://127.0.0.1:4000/api/v1", "run-1", "a b")).toBe(
      "ws://127.0.0.1:4000/api/v1/runs/run-1/live?token=a%20b",
    );
    expect(liveUrl("https://api.example.com/api/v1", "run-1", "t")).toBe(
      "wss://api.example.com/api/v1/runs/run-1/live?token=t",
    );
  });

  it("builds file URLs", () => {
    expect(runFileUrl("https://api.example.com/api/v1", "run-1", "screenshots/step-0.png", "t")).toBe(
      "https://api.example.com/api/v1/runs/run-1/files/screenshots/step-0.png?token=t",
    );
  });

  it("applies live messages without mutating the input state", () => {
    const state: LiveState = { run: null, steps: [] };
    const snapshot: Extract<LiveMessage, { type: "snapshot" }> = {
      type: "snapshot",
      run: queueRun,
      steps: [pendingStep],
    };
    const snapshotNext = applyLiveMessage(state, snapshot);

    expect(snapshotNext.run).toEqual(queueRun);
    expect(snapshotNext.steps).toEqual([pendingStep]);
    expect(state).toEqual({ run: null, steps: [] });

    const stepMessage: Extract<LiveMessage, { type: "step" }> = {
      type: "step",
      step: runningStep,
    };
    const snapshotCopy = structuredClone(snapshotNext);
    const afterStep = applyLiveMessage(snapshotNext, stepMessage);
    expect(snapshotNext).toEqual(snapshotCopy);

    expect(afterStep.run).toEqual(queueRun);
    expect(afterStep.steps).toEqual([runningStep]);

    const statusRun: Run = {
      ...queueRun,
      status: "running",
      startedAt: "2026-11-13T00:00:05.000Z",
      durationMs: 1000,
      summary: {
        total: 1,
        passed: 0,
        failed: 0,
        pending: 1,
      },
    };
    const statusMessage: Extract<LiveMessage, { type: "status" }> = {
      type: "status",
      run: statusRun,
    };
    const afterStatus = applyLiveMessage(afterStep, statusMessage);

    expect(afterStatus.run).toEqual(statusRun);
    expect(afterStatus.steps).toEqual([runningStep]);

    const secondStep: Step = {
      index: 1,
      line: 2,
      action: "click",
      status: "pending",
    };
    const stepForIndexOne: Extract<LiveMessage, { type: "step" }> = {
      type: "step",
      step: secondStep,
    };
    const afterSecondStep = applyLiveMessage(afterStatus, stepForIndexOne);

    expect(afterSecondStep.steps).toEqual([runningStep, secondStep]);
  });
});

describe("runErrorText", () => {
  it("names a timeout in plain words and keeps the reason", () => {
    expect(runErrorText({ kind: "timeout", message: "The run did not finish within runTimeoutMs (10000 ms)" })).toBe(
      "Timed out: The run did not finish within runTimeoutMs (10000 ms)",
    );
  });

  it("names an interrupted Run and a browser failure", () => {
    expect(runErrorText({ kind: "interrupted", message: "Interrupted by a server restart" })).toBe(
      "Interrupted: Interrupted by a server restart",
    );
    expect(runErrorText({ kind: "infrastructure", message: "The browser is closed or has crashed" })).toBe(
      "Browser error: The browser is closed or has crashed",
    );
  });

  it("hides an internal error's name, which only means something to the server", () => {
    expect(runErrorText({ kind: "internal", message: "TypeError" })).toBe(
      "Something went wrong while running the test. Try running it again.",
    );
  });
});

describe("isFinalStatus", () => {
  it.each(["passed", "failed"] as const)("is true for %s", (status) => {
    expect(isFinalStatus(status)).toBe(true);
  });

  it.each(["queued", "running"] as const)("is false for %s", (status) => {
    expect(isFinalStatus(status)).toBe(false);
  });
});

describe("isFinalLiveMessage", () => {
  it.each(["passed", "failed"] as const)("is true for a %s status or snapshot message", (status) => {
    const run: Run = { ...queueRun, status };
    expect(isFinalLiveMessage({ type: "status", run })).toBe(true);
    expect(isFinalLiveMessage({ type: "snapshot", run, steps: [] })).toBe(true);
  });

  it.each(["queued", "running"] as const)("is false for a %s status or snapshot message", (status) => {
    const run: Run = { ...queueRun, status };
    expect(isFinalLiveMessage({ type: "status", run })).toBe(false);
    expect(isFinalLiveMessage({ type: "snapshot", run, steps: [] })).toBe(false);
  });

  it("is false for a step message", () => {
    expect(isFinalLiveMessage({ type: "step", step: { ...pendingStep, status: "passed", durationMs: 10 } })).toBe(
      false,
    );
  });
});
