import { existsSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import request from "supertest";
import { afterAll, afterEach, beforeAll, expect, it } from "vitest";
import { verifyToken } from "@/app/backend/src/auth/token.js";
import { attachLive, LiveHub, loadRunFrom, type LiveMessageShape } from "@/app/backend/src/runs/live.js";
import { serveFixtures } from "../../core/browser/server.js";
import { createTestBackend, createUser, JWT_SECRET } from "./test-app.js";
import { describeDb, useTestDb } from "./test-db.js";

const FIXTURES = fileURLToPath(new URL("./fixtures/", import.meta.url));
const MISSING_ID = "6f1c2a4e-9b3d-4c5e-8f7a-1b2c3d4e5f60";

let fixtures: Awaited<ReturnType<typeof serveFixtures>>;
beforeAll(async () => (fixtures = await serveFixtures(FIXTURES)));
afterAll(() => fixtures?.stop());

const source = () => `name: "Add to cart"
timeoutMs: 2000
steps:
  - open:
      url: "${fixtures.baseUrl}/page.html"
  - click:
      selector: "#add"
  - click:
      selector: "#missing"
  - back: {}
`;

// Connects to Live Progress and collects every message until the server closes the socket.
function connect(url: string) {
  const messages: LiveMessageShape[] = [];
  const socket = new WebSocket(url);
  socket.addEventListener("message", (event) => messages.push(JSON.parse(String(event.data))));
  const closed = new Promise<number>((resolve) => socket.addEventListener("close", (event) => resolve(event.code)));
  return { messages, closed };
}

describeDb("Live Progress", () => {
  const db = useTestDb("test_live");
  const servers: ReturnType<typeof createServer>[] = [];
  afterEach(async () => {
    for (const server of servers.splice(0)) await new Promise((resolve) => server.close(resolve));
  });

  async function setup(email = "ada@example.com") {
    const { user, token } = await createUser(db(), email);
    const hub = new LiveHub(loadRunFrom(db()));
    const backend = createTestBackend(db(), { progress: hub });
    const server = createServer(backend.app);
    attachLive(server, { hub, verifyToken: (jwt) => verifyToken(jwt, JWT_SECRET) });
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address() as AddressInfo;
    const project = await db().project.create({ data: { userId: user.id, name: "Shop" } });
    const module = await db().module.create({ data: { projectId: project.id, name: "Cart" } });
    const testFile = await db().testFile.create({ data: { moduleId: module.id, name: "add.yaml", source: source() } });
    // A queued Run that is not enqueued yet, so a test can connect before it starts.
    const run = await db().run.create({
      data: {
        userId: user.id,
        projectId: project.id,
        moduleId: module.id,
        testFileId: testFile.id,
        fileName: "add.yaml",
        name: "Add to cart",
        source: source(),
      },
    });
    return {
      ...backend,
      token,
      run,
      live: (runId = run.id, jwt = token) => connect(`ws://127.0.0.1:${port}/api/v1/runs/${runId}/live?token=${jwt}`),
    };
  }

  it("streams a snapshot with every step pending, then each step and status, and closes after the final one", async () => {
    const as = await setup();
    const live = as.live();
    await expect.poll(() => live.messages.length).toBe(1);

    expect(live.messages[0]).toEqual({
      type: "snapshot",
      run: expect.objectContaining({ id: as.run.id, status: "queued" }),
      steps: [
        { index: 0, line: 4, action: "open", status: "pending" },
        { index: 1, line: 6, action: "click", status: "pending" },
        { index: 2, line: 8, action: "click", status: "pending" },
        { index: 3, line: 10, action: "back", status: "pending" },
      ],
    });
    expect(Object.keys(live.messages[0]!.type === "snapshot" ? live.messages[0]!.run : {})).not.toContain("source");

    // Each finished step's screenshot is on disk by the time its message arrives.
    const onDisk: boolean[] = [];
    const seen = new Set<number>();
    const check = setInterval(() => {
      for (const [index, message] of live.messages.entries()) {
        if (seen.has(index) || message.type !== "step" || !("screenshot" in message.step)) continue;
        seen.add(index);
        onDisk.push(existsSync(join(as.runsDir, as.run.id, message.step.screenshot ?? "")));
      }
    }, 1);
    as.queue.enqueue(as.run.id);
    expect(await live.closed).toBe(1000);
    clearInterval(check);

    const rest = live.messages
      .slice(1)
      .map((message) =>
        message.type === "step"
          ? `step ${message.step.index} ${message.step.status}`
          : `${message.type} ${message.type === "status" ? message.run.status : ""}`,
      );
    expect(rest).toEqual([
      "status running",
      "step 0 running",
      "step 0 passed",
      "step 1 running",
      "step 1 passed",
      "step 2 running",
      "step 2 failed",
      "status failed",
    ]);
    const steps = live.messages.flatMap((message) => (message.type === "step" ? [message.step] : []));
    expect(steps.filter((step) => step.status === "running").every((step) => "startedAt" in step)).toBe(true);
    expect(
      steps.filter((step) => step.status !== "running").map((step) => "screenshot" in step && step.screenshot),
    ).toEqual(["screenshots/step-0.png", "screenshots/step-1.png", "screenshots/step-2.png"]);
    expect(onDisk).toEqual([true, true, true]);
    expect(live.messages.at(-1)).toMatchObject({
      type: "status",
      run: {
        status: "failed",
        durationMs: expect.any(Number),
        summary: { total: 4, passed: 2, failed: 1, pending: 1 },
      },
    });
  });

  it("sends a finished Run's snapshot from its Report and closes", async () => {
    const as = await setup();
    as.queue.enqueue(as.run.id);
    await as.queue.idle();

    const live = as.live();

    expect(await live.closed).toBe(1000);
    expect(live.messages).toHaveLength(1);
    expect(live.messages[0]).toMatchObject({
      type: "snapshot",
      run: { status: "failed" },
      steps: [
        { index: 0, status: "passed", screenshot: "screenshots/step-0.png" },
        { index: 1, status: "passed" },
        { index: 2, status: "failed" },
        { index: 3, status: "pending" },
      ],
    });
  });

  it("closes with 4401 for a bad or missing token", async () => {
    const as = await setup();

    expect(await as.live(as.run.id, "not-a-jwt").closed).toBe(4401);
    expect(await as.live(as.run.id, "").closed).toBe(4401);
  });

  it("closes with 4404 for another user's Run, a missing one, or an id that is not a uuid", async () => {
    const as = await setup();
    const other = await setup("bob@example.com");

    expect(await as.live(other.run.id).closed).toBe(4404);
    expect(await as.live(MISSING_ID).closed).toBe(4404);
    expect(await as.live("not-a-uuid").closed).toBe(4404);
  });

  it("answers 400 to a request for Live Progress that is not a WebSocket upgrade", async () => {
    const as = await setup();

    const res = await request(as.app).get(`/api/v1/runs/${as.run.id}/live?token=${as.token}`);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("invalid_request");
  });
});
