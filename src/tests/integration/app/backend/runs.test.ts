import { existsSync } from "node:fs";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import request from "supertest";
import { afterAll, beforeAll, expect, it } from "vitest";
import { browserLauncher } from "@/app/backend/src/runs/browser.js";
import { recoverInterruptedRuns } from "@/app/backend/src/runs/execute-run.js";
import { analyze } from "@/core/syntax/index.js";
import { startRunServer } from "../../core/browser/run-server.js";
import { serveFixtures } from "../../core/browser/server.js";
import { createTestBackend, createUser, type TestBackendOptions } from "./test-app.js";
import { describeDb, useTestDb } from "./test-db.js";

const FIXTURES = fileURLToPath(new URL("./fixtures/", import.meta.url));
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
const MISSING_ID = "6f1c2a4e-9b3d-4c5e-8f7a-1b2c3d4e5f60";

let server: Awaited<ReturnType<typeof serveFixtures>>;
beforeAll(async () => (server = await serveFixtures(FIXTURES)));
afterAll(() => server?.stop());

const passing = () => `name: "Add to cart"
timeoutMs: 2000
steps:
  - open:
      url: "${server.baseUrl}/page.html"
  - click:
      selector: "#add"
  - assert:
      selector: "#count"
      text: "1"
`;

describeDb("run routes", () => {
  const db = useTestDb("test_runs");

  // A user with one Project, Module, and Test File holding `source`, and requests with its token.
  async function setup(source: string, options: TestBackendOptions = {}, email = "ada@example.com") {
    const { user, token } = await createUser(db(), email);
    const backend = createTestBackend(db(), options);
    const auth = { authorization: `Bearer ${token}` };
    const project = await db().project.create({ data: { userId: user.id, name: "Shop" } });
    const module = await db().module.create({ data: { projectId: project.id, name: "Cart" } });
    const testFile = await db().testFile.create({ data: { moduleId: module.id, name: "add.yaml", source } });
    return {
      ...backend,
      user,
      token,
      project,
      module,
      testFile,
      get: (path: string) => request(backend.app).get(`/api/v1${path}`).set(auth),
      trigger: (id = testFile.id) => request(backend.app).post(`/api/v1/test-files/${id}/runs`).set(auth),
      anonymous: () => request(backend.app),
    };
  }

  // Stores a finished Run directly, `minutesAgo` before now.
  async function storeRun(
    ids: { userId: string; projectId: string; moduleId: string; testFileId: string },
    minutesAgo: number,
  ) {
    return db().run.create({
      data: {
        ...ids,
        fileName: "add.yaml",
        name: "Add to cart",
        source: "x",
        status: "passed",
        createdAt: new Date(Date.now() - minutesAgo * 60_000),
      },
    });
  }

  it("answers 422 with the diagnostics for a Test File that has them, and stores no Run", async () => {
    const source = 'name: "Plan"\nsteps:\n  - ai: "buy"\n';
    const as = await setup(source);

    const res = await as.trigger();

    expect(res.status).toBe(422);
    expect(res.body).toEqual({
      error: { code: "invalid_test", message: expect.any(String), details: analyze(source).diagnostics },
    });
    expect(await db().run.count()).toBe(0);
  });

  it("answers 404 for a missing Test File or another user's", async () => {
    const as = await setup(passing());
    const other = await setup(passing(), {}, "bob@example.com");

    expect((await as.trigger(MISSING_ID)).status).toBe(404);
    expect((await as.trigger(other.testFile.id)).status).toBe(404);
  });

  it("answers 202 with a queued Run that keeps the source as it was", async () => {
    const as = await setup(passing());

    const res = await as.trigger();
    await db().testFile.update({ where: { id: as.testFile.id }, data: { source: "changed" } });

    expect(res.status).toBe(202);
    expect(res.body).toEqual({
      id: expect.any(String),
      testFileId: as.testFile.id,
      moduleId: as.module.id,
      projectId: as.project.id,
      fileName: "add.yaml",
      name: "Add to cart",
      status: "queued",
      createdAt: expect.any(String),
      startedAt: null,
      finishedAt: null,
      durationMs: null,
      summary: null,
      error: null,
    });
    await as.queue.idle();
    expect((await as.get(`/runs/${res.body.id}`)).body.source).toBe(passing());
  });

  it("keeps a second Run queued while the first runs", async () => {
    const slow = `name: "Slow"\nsteps:\n  - sleep:\n      ms: 1500\n`;
    const as = await setup(slow);

    const first = (await as.trigger()).body;
    const second = (await as.trigger()).body;
    await expect.poll(async () => (await as.get(`/runs/${first.id}`)).body.status).toBe("running");

    expect((await as.get(`/runs/${second.id}`)).body.status).toBe("queued");
    await as.queue.idle();
    expect((await as.get(`/runs/${second.id}`)).body.status).toBe("passed");
  });

  it("stores a passed Run's status, times, summary, and Report, with a screenshot of every step", async () => {
    const as = await setup(passing());

    const { id } = (await as.trigger()).body;
    await as.queue.idle();
    const res = await as.get(`/runs/${id}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      status: "passed",
      startedAt: expect.any(String),
      finishedAt: expect.any(String),
      durationMs: expect.any(Number),
      summary: { total: 3, passed: 3, failed: 0, pending: 0 },
      error: null,
      source: passing(),
    });
    expect(res.body.report).toMatchObject({
      file: "add.yaml",
      name: "Add to cart",
      status: "passed",
      trace: "trace.zip",
    });
    expect(res.body.durationMs).toBe(res.body.report.durationMs);
    expect(res.body.report.steps.map((step: { screenshot?: string }) => step.screenshot)).toEqual([
      "screenshots/step-0.png",
      "screenshots/step-1.png",
      "screenshots/step-2.png",
    ]);
    for (const path of ["report.json", "trace.zip", "screenshots/step-0.png", "screenshots/step-2.png"])
      expect(existsSync(join(as.runsDir, id, path)), path).toBe(true);
    expect(JSON.parse(await readFile(join(as.runsDir, id, "report.json"), "utf8"))).toEqual(res.body.report);
  });

  it("runs with the Project Variables", async () => {
    const source = `name: "Vars"\nsteps:\n  - open:\n      url: "{{PAGE}}"\n`;
    const as = await setup(source);
    await db().variable.create({
      data: { projectId: as.project.id, name: "PAGE", value: `${server.baseUrl}/page.html` },
    });

    const { id } = (await as.trigger()).body;
    await as.queue.idle();

    expect((await as.get(`/runs/${id}`)).body.status).toBe("passed");
  });

  it("fails a Run at its failed step, with the step's reason and no Run error", async () => {
    const source = `name: "Missing"\ntimeoutMs: 1500\nsteps:\n  - open:\n      url: "${server.baseUrl}/page.html"\n  - click:\n      selector: "#missing"\n  - back: {}\n`;
    const as = await setup(source);

    const { id } = (await as.trigger()).body;
    await as.queue.idle();
    const run = (await as.get(`/runs/${id}`)).body;

    expect(run).toMatchObject({
      status: "failed",
      error: null,
      summary: { total: 3, passed: 1, failed: 1, pending: 1 },
    });
    expect(run.report.steps[1]).toMatchObject({ status: "failed", reason: expect.any(String) });
  });

  it("stores Core's timeout as the Run's error", async () => {
    const source = `name: "Too slow"\nrunTimeoutMs: 1500\nsteps:\n  - sleep:\n      ms: 5000\n`;
    const as = await setup(source);

    const { id } = (await as.trigger()).body;
    await as.queue.idle();

    expect((await as.get(`/runs/${id}`)).body).toMatchObject({
      status: "failed",
      error: { kind: "timeout", message: expect.any(String) },
      report: { error: { kind: "timeout" } },
    });
  });

  it("caps a Run at the server's longest run time, whatever its runTimeoutMs", async () => {
    const source = `name: "Forever"\nrunTimeoutMs: 2147483647\nsteps:\n  - sleep:\n      ms: 2147483647\n`;
    const as = await setup(source, { maxRunTimeoutMs: 1000 });

    const { id } = (await as.trigger()).body;
    await as.queue.idle();

    expect((await as.get(`/runs/${id}`)).body).toMatchObject({
      status: "failed",
      error: { kind: "timeout", message: "The run did not finish within the longest run time allowed (1000 ms)" },
    });
  });

  it("fails a Run that throws with an internal error naming only the error, never its message", async () => {
    const notADir = join(await mkdtemp(join(tmpdir(), "runs-")), "file");
    await writeFile(notADir, "");
    const as = await setup(passing(), { runsDir: notADir });

    const { id } = (await as.trigger()).body;
    await as.queue.idle();
    const run = (await as.get(`/runs/${id}`)).body;

    expect(run).toMatchObject({ status: "failed", finishedAt: expect.any(String), error: { kind: "internal" } });
    expect(run.error.message).not.toContain(notADir);
    expect(run.error.message).toMatch(/^\w*Error$/);
  });

  it("runs on the browser at BROWSER_ENDPOINT when it is set", async () => {
    const runServer = await startRunServer();
    try {
      const as = await setup(passing(), { launch: browserLauncher(runServer.endpoint) });

      const { id } = (await as.trigger()).body;
      await as.queue.idle();

      expect((await as.get(`/runs/${id}`)).body).toMatchObject({ status: "passed", summary: { passed: 3 } });
      expect(runServer.connections()).toBe(1);
    } finally {
      runServer.stop();
    }
  });

  it('blocks a page on a private address with network: "public"', async () => {
    const source = `name: "Local"\ntimeoutMs: 2000\nsteps:\n  - open:\n      url: "${server.baseUrl}/page.html"\n`;
    const as = await setup(source, { network: "public" });

    const { id } = (await as.trigger()).body;
    await as.queue.idle();
    const run = (await as.get(`/runs/${id}`)).body;

    expect(run.status).toBe("failed");
    expect(run.report.steps[0].reason).toContain("net::ERR_FAILED");
  });

  it("serves Run Files with a Bearer token or ?token=, with their content type", async () => {
    const as = await setup(passing());
    const { id } = (await as.trigger()).body;
    await as.queue.idle();

    const report = await as.get(`/runs/${id}/files/report.json`);
    const screenshot = await as.anonymous().get(`/api/v1/runs/${id}/files/screenshots/step-0.png?token=${as.token}`);

    expect(report.status).toBe(200);
    expect(report.headers["content-type"]).toMatch(/application\/json/);
    expect(report.body.name).toBe("Add to cart");
    expect(screenshot.status).toBe(200);
    expect(screenshot.headers["content-type"]).toBe("image/png");
    expect(Buffer.from(screenshot.body).subarray(0, 4)).toEqual(PNG_SIGNATURE);
  });

  it("answers 404 for a path outside the Run's folder, a missing file, and another user's Run Files", async () => {
    const as = await setup(passing());
    const other = await setup(passing(), { runsDir: as.runsDir }, "bob@example.com");
    const { id } = (await as.trigger()).body;
    const theirs = (await other.trigger()).body;
    await as.queue.idle();
    await other.queue.idle();
    await writeFile(join(as.runsDir, "secret.txt"), "secret");

    for (const path of [
      `/runs/${id}/files/..%2Fsecret.txt`,
      `/runs/${id}/files/..%2F${theirs.id}%2Freport.json`,
      `/runs/${id}/files/screenshots%2F..%2F..%2Fsecret.txt`,
      `/runs/${id}/files/nothing.png`,
      `/runs/${theirs.id}/files/report.json`,
    ]) {
      const res = await as.get(path);
      expect(res.status, path).toBe(404);
      expect(res.body.error.code).toBe("not_found");
    }
  });

  it("lists the user's Runs newest first, without source and report, filtered by Test File or Project", async () => {
    const as = await setup(passing());
    const other = await setup(passing(), {}, "bob@example.com");
    const ids = { userId: as.user.id, projectId: as.project.id, moduleId: as.module.id };
    const second = await db().testFile.create({ data: { moduleId: as.module.id, name: "b.yaml", source: "x" } });
    const project2 = await db().project.create({ data: { userId: as.user.id, name: "Blog" } });
    const module2 = await db().module.create({ data: { projectId: project2.id, name: "Posts" } });
    const file3 = await db().testFile.create({ data: { moduleId: module2.id, name: "c.yaml", source: "x" } });
    const old = await storeRun({ ...ids, testFileId: as.testFile.id }, 30);
    const mid = await storeRun({ ...ids, testFileId: second.id }, 20);
    const recent = await storeRun(
      { userId: as.user.id, projectId: project2.id, moduleId: module2.id, testFileId: file3.id },
      10,
    );
    await storeRun(
      { userId: other.user.id, projectId: other.project.id, moduleId: other.module.id, testFileId: other.testFile.id },
      5,
    );

    const all = await as.get("/runs");
    const byFile = await as.get(`/runs?testFileId=${as.testFile.id}`);
    const byProject = await as.get(`/runs?projectId=${as.project.id}`);

    expect(all.status).toBe(200);
    expect(all.body.items.map((run: { id: string }) => run.id)).toEqual([recent.id, mid.id, old.id]);
    expect(all.body.nextCursor).toBeNull();
    expect(all.body.items.every((run: object) => !("source" in run) && !("report" in run))).toBe(true);
    expect(byFile.body.items.map((run: { id: string }) => run.id)).toEqual([old.id]);
    expect(byProject.body.items.map((run: { id: string }) => run.id)).toEqual([mid.id, old.id]);
  });

  it("pages through Runs with limit and nextCursor, also between Runs created at the same time", async () => {
    const as = await setup(passing());
    const ids = { userId: as.user.id, projectId: as.project.id, moduleId: as.module.id, testFileId: as.testFile.id };
    const runs = [await storeRun(ids, 1), await storeRun(ids, 2), await storeRun(ids, 2), await storeRun(ids, 3)];
    const tied = await db().run.findMany({ where: { id: { in: [runs[1]!.id, runs[2]!.id] } } });
    await db().run.updateMany({
      where: { id: { in: tied.map((run) => run.id) } },
      data: { createdAt: tied[0]!.createdAt },
    });

    const seen: string[] = [];
    let cursor: string | null = null;
    let pages = 0;
    do {
      const res = await as.get(`/runs?limit=2${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`);
      expect(res.status).toBe(200);
      expect(res.body.items.length).toBeLessThanOrEqual(2);
      seen.push(...res.body.items.map((run: { id: string }) => run.id));
      cursor = res.body.nextCursor;
      pages += 1;
    } while (cursor !== null && pages < 5);

    expect(pages).toBe(2);
    expect(new Set(seen)).toEqual(new Set(runs.map((run) => run.id)));
    expect(seen).toHaveLength(4);
    expect(seen[0]).toBe(runs[0]!.id);
    expect(seen[3]).toBe(runs[3]!.id);
  });

  it("answers 400 for a cursor it did not give out", async () => {
    const as = await setup(passing());

    const res = await as.get("/runs?cursor=not-a-cursor");

    expect(res.status).toBe(400);
    expect(res.body.error.details.map((issue: { path: string }) => issue.path)).toEqual(["query.cursor"]);
  });

  it("answers 404 for another user's Run and lists none of theirs", async () => {
    const as = await setup(passing());
    const other = await setup(passing(), {}, "bob@example.com");
    const theirs = await storeRun(
      { userId: other.user.id, projectId: other.project.id, moduleId: other.module.id, testFileId: other.testFile.id },
      1,
    );

    expect((await as.get(`/runs/${theirs.id}`)).status).toBe(404);
    expect((await as.get(`/runs?testFileId=${other.testFile.id}`)).body.items).toEqual([]);
  });

  it("still lists a deleted Test File's Runs by Project", async () => {
    const as = await setup(passing());
    const run = await storeRun(
      { userId: as.user.id, projectId: as.project.id, moduleId: as.module.id, testFileId: as.testFile.id },
      1,
    );
    await db().testFile.delete({ where: { id: as.testFile.id } });

    const res = await as.get(`/runs?projectId=${as.project.id}`);

    expect(res.body.items).toEqual([expect.objectContaining({ id: run.id, testFileId: null, fileName: "add.yaml" })]);
  });

  it("fails the Runs a previous process left queued or running, and leaves finished ones", async () => {
    const as = await setup(passing());
    const ids = { userId: as.user.id, projectId: as.project.id, moduleId: as.module.id, testFileId: as.testFile.id };
    const finished = await storeRun(ids, 3);
    const queued = await db().run.update({ where: { id: (await storeRun(ids, 2)).id }, data: { status: "queued" } });
    const running = await db().run.update({
      where: { id: (await storeRun(ids, 1)).id },
      data: { status: "running", startedAt: new Date() },
    });

    expect(await recoverInterruptedRuns(db())).toBe(2);

    for (const { id } of [queued, running]) {
      expect((await as.get(`/runs/${id}`)).body).toMatchObject({
        status: "failed",
        finishedAt: expect.any(String),
        error: { kind: "interrupted", message: "Interrupted by a server restart" },
      });
    }
    expect((await as.get(`/runs/${finished.id}`)).body).toMatchObject({ status: "passed", error: null });
  });
});
