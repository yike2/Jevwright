import { describe, expect, it } from "vitest";
import type { ApiStep, LiveRun } from "@/app/backend/src/runs/execute-run.js";
import { LiveHub, type LiveMessageShape, type LiveSocket, type LoadRun } from "@/app/backend/src/runs/live.js";
import type { Run } from "@/app/backend/src/generated/prisma/client.js";

const RUN_ID = "0b1c2d3e-4f50-4a6b-8c7d-9e0f1a2b3c4d";
const USER_ID = "3a2b1c0d-9e8f-4a7b-8c6d-5e4f3a2b1c0d";
const SOURCE = `name: "Add"
steps:
  - open:
      url: "https://shop.example"
  - click:
      selector: "#add"
  - back: {}
`;

const row = (overrides: Partial<Run> = {}): Run => ({
  id: RUN_ID,
  userId: USER_ID,
  testFileId: null,
  moduleId: null,
  projectId: null,
  fileName: "add.yaml",
  name: "Add",
  source: SOURCE,
  status: "running",
  createdAt: new Date("2026-11-01T10:00:00Z"),
  startedAt: new Date("2026-11-01T10:00:01Z"),
  finishedAt: null,
  durationMs: null,
  total: null,
  passed: null,
  failed: null,
  pending: null,
  errorKind: null,
  errorMessage: null,
  report: null,
  ...overrides,
});

const liveRun = (status: LiveRun["status"]): LiveRun => ({
  id: RUN_ID,
  testFileId: null,
  moduleId: null,
  projectId: null,
  fileName: "add.yaml",
  name: "Add",
  status,
  createdAt: "2026-11-01T10:00:00.000Z",
  startedAt: "2026-11-01T10:00:01.000Z",
  finishedAt: status === "passed" || status === "failed" ? "2026-11-01T10:00:05.000Z" : null,
  durationMs: null,
  summary: null,
  error: null,
});

const pending = (index: number, line: number, action: string): ApiStep => ({ index, line, action, status: "pending" });
const passed = (index: number, line: number, action: string): ApiStep => ({
  index,
  line,
  action,
  status: "passed",
  startedAt: "2026-11-01T10:00:02.000Z",
  durationMs: 10,
  dialogs: [],
  screenshot: `screenshots/step-${index}.png`,
});

function fakeSocket() {
  const messages: LiveMessageShape[] = [];
  const closed: number[] = [];
  const socket: LiveSocket = {
    send: (data) => void messages.push(JSON.parse(data)),
    close: (code) => void closed.push(code),
  };
  return { socket, messages, closed };
}

const loads =
  (run: Run | undefined): LoadRun =>
  async () =>
    run;

describe("LiveHub", () => {
  it("sends a snapshot with every step of the source pending, and the Run without source and report", async () => {
    const hub = new LiveHub(loads(row({ status: "queued", startedAt: null })));
    const { socket, messages, closed } = fakeSocket();

    expect(await hub.subscribe(RUN_ID, USER_ID, socket)).toBe(true);

    expect(messages).toEqual([
      {
        type: "snapshot",
        run: expect.objectContaining({ id: RUN_ID, status: "queued", startedAt: null }),
        steps: [pending(0, 3, "open"), pending(1, 5, "click"), pending(2, 7, "back")],
      },
    ]);
    expect(messages[0]!.type === "snapshot" && Object.keys(messages[0]!.run)).not.toContain("source");
    expect(closed).toEqual([]);
  });

  it("gives a late subscriber the steps so far in its snapshot", async () => {
    const hub = new LiveHub(loads(row()));
    hub.status(liveRun("running"));
    hub.step(RUN_ID, passed(0, 3, "open"));
    hub.step(RUN_ID, { index: 1, line: 5, action: "click", status: "running", startedAt: "2026-11-01T10:00:03.000Z" });
    const { socket, messages } = fakeSocket();

    await hub.subscribe(RUN_ID, USER_ID, socket);

    expect(messages[0]).toMatchObject({
      type: "snapshot",
      steps: [
        passed(0, 3, "open"),
        { index: 1, status: "running", startedAt: "2026-11-01T10:00:03.000Z" },
        pending(2, 7, "back"),
      ],
    });
  });

  it("forwards step and status messages to every subscriber of the Run", async () => {
    const hub = new LiveHub(loads(row()));
    const first = fakeSocket();
    const second = fakeSocket();
    await hub.subscribe(RUN_ID, USER_ID, first.socket);
    await hub.subscribe(RUN_ID, USER_ID, second.socket);

    hub.step(RUN_ID, passed(0, 3, "open"));
    hub.step("another-run", passed(0, 3, "open"));
    hub.status(liveRun("running"));

    for (const { messages } of [first, second]) {
      expect(messages.slice(1)).toEqual([
        { type: "step", step: passed(0, 3, "open") },
        { type: "status", run: liveRun("running") },
      ]);
    }
  });

  it("closes every subscriber after the final status, and forgets the Run", async () => {
    const hub = new LiveHub(loads(row()));
    const { socket, messages, closed } = fakeSocket();
    await hub.subscribe(RUN_ID, USER_ID, socket);
    hub.step(RUN_ID, passed(0, 3, "open"));

    hub.status(liveRun("failed"));
    hub.step(RUN_ID, passed(1, 5, "click"));

    expect(messages.at(-1)).toEqual({ type: "status", run: liveRun("failed") });
    expect(messages).toHaveLength(3);
    expect(closed).toEqual([1000]);

    // A later subscriber of the same hub does not see the finished Run's old steps.
    const late = fakeSocket();
    await hub.subscribe(RUN_ID, USER_ID, late.socket);
    expect(late.messages[0]!.type === "snapshot" && late.messages[0]!.steps[0]).toEqual(pending(0, 3, "open"));
  });

  it("sends a finished Run's snapshot from its Report, then closes", async () => {
    const steps = [passed(0, 3, "open"), passed(1, 5, "click"), pending(2, 7, "back")];
    const finished = row({
      status: "failed",
      finishedAt: new Date("2026-11-01T10:00:05Z"),
      durationMs: 4000,
      total: 3,
      passed: 2,
      failed: 0,
      pending: 1,
      errorKind: "timeout",
      errorMessage: "Run timed out",
      report: { steps },
    });
    const hub = new LiveHub(loads(finished));
    const { socket, messages, closed } = fakeSocket();

    await hub.subscribe(RUN_ID, USER_ID, socket);

    expect(messages).toEqual([
      {
        type: "snapshot",
        run: expect.objectContaining({
          status: "failed",
          summary: { total: 3, passed: 2, failed: 0, pending: 1 },
          error: { kind: "timeout", message: "Run timed out" },
        }),
        steps,
      },
    ]);
    expect(closed).toEqual([1000]);
  });

  it("keeps steps it never reached pending in a finished Run without a Report", async () => {
    const interrupted = row({ status: "failed", errorKind: "interrupted", errorMessage: "Interrupted" });
    const hub = new LiveHub(loads(interrupted));
    const { socket, messages } = fakeSocket();

    await hub.subscribe(RUN_ID, USER_ID, socket);

    expect(messages[0]).toMatchObject({
      steps: [pending(0, 3, "open"), pending(1, 5, "click"), pending(2, 7, "back")],
    });
  });

  it("answers false and sends nothing for a Run that is not the user's", async () => {
    const hub = new LiveHub(loads(undefined));
    const { socket, messages, closed } = fakeSocket();

    expect(await hub.subscribe(RUN_ID, USER_ID, socket)).toBe(false);
    expect(messages).toEqual([]);
    expect(closed).toEqual([]);
  });

  it("replays messages sent while the Run was loading after the snapshot", async () => {
    let finishLoading: (run: Run) => void = () => {};
    const hub = new LiveHub(() => new Promise((resolve) => (finishLoading = resolve)));
    const { socket, messages, closed } = fakeSocket();

    const subscribed = hub.subscribe(RUN_ID, USER_ID, socket);
    hub.status(liveRun("running"));
    hub.step(RUN_ID, passed(0, 3, "open"));
    hub.status(liveRun("passed"));
    finishLoading(row());
    await subscribed;

    expect(messages.map((message) => message.type)).toEqual(["snapshot", "status", "step", "status"]);
    expect(messages.at(-1)).toEqual({ type: "status", run: liveRun("passed") });
    expect(closed).toEqual([1000]);
  });
});
