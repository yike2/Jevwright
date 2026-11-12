import request from "supertest";
import { expect, it } from "vitest";
import { analyze } from "@/core/syntax/index.js";
import { createTestApp, createUser } from "./test-app.js";
import { describeDb, useTestDb } from "./test-db.js";

const VALID = `name: "Add to cart"
steps:
  - click:
      selector: "#add"
`;
const INVALID = `name: "Plan it"
steps:
  - ai: "buy something"
`;
const MISSING_ID = "6f1c2a4e-9b3d-4c5e-8f7a-1b2c3d4e5f60";

const timestamps = { createdAt: expect.any(String), updatedAt: expect.any(String) };

describeDb("workspace routes", () => {
  const db = useTestDb("test_workspace");

  // Requests as one user, with its token.
  async function client(email = "ada@example.com") {
    const { user, token } = await createUser(db(), email);
    const app = createTestApp(db());
    const auth = { authorization: `Bearer ${token}` };
    return {
      user,
      get: (path: string) => request(app).get(`/api/v1${path}`).set(auth),
      post: (path: string, body: object = {}) => request(app).post(`/api/v1${path}`).set(auth).send(body),
      patch: (path: string, body: object) => request(app).patch(`/api/v1${path}`).set(auth).send(body),
      put: (path: string, body: object) => request(app).put(`/api/v1${path}`).set(auth).send(body),
      delete: (path: string) => request(app).delete(`/api/v1${path}`).set(auth),
    };
  }
  type Client = Awaited<ReturnType<typeof client>>;

  async function workspace(as: Client) {
    const project = (await as.post("/projects", { name: "Shop" })).body;
    const module = (await as.post(`/projects/${project.id}/modules`, { name: "Cart" })).body;
    const saved = (await as.post(`/modules/${module.id}/test-files`, { name: "add.yaml", source: VALID })).body;
    return { project, module, testFile: saved.testFile };
  }

  async function addRun(
    userId: string,
    ids: { project: { id: string }; module: { id: string }; testFile: { id: string } },
  ) {
    return db().run.create({
      data: {
        userId,
        projectId: ids.project.id,
        moduleId: ids.module.id,
        testFileId: ids.testFile.id,
        fileName: "add.yaml",
        name: "Add to cart",
        source: VALID,
      },
    });
  }

  it("creates, lists, renames, and deletes a Project", async () => {
    const as = await client();

    const created = await as.post("/projects", { name: "  Shop  " });
    expect(created.status).toBe(201);
    expect(created.body).toEqual({ id: expect.any(String), name: "Shop", ...timestamps });

    const renamed = await as.patch(`/projects/${created.body.id}`, { name: "Store" });
    expect(renamed.status).toBe(200);
    expect(renamed.body).toMatchObject({ id: created.body.id, name: "Store" });

    expect((await as.get("/projects")).body).toEqual({ items: [renamed.body] });
    expect((await as.delete(`/projects/${created.body.id}`)).status).toBe(204);
    expect((await as.get("/projects")).body).toEqual({ items: [] });
  });

  it("creates, lists, renames, and deletes a Module", async () => {
    const as = await client();
    const project = (await as.post("/projects", { name: "Shop" })).body;

    const created = await as.post(`/projects/${project.id}/modules`, { name: "Cart" });
    expect(created.status).toBe(201);
    expect(created.body).toEqual({ id: expect.any(String), projectId: project.id, name: "Cart", ...timestamps });

    const renamed = await as.patch(`/modules/${created.body.id}`, { name: "Basket" });
    expect(renamed.status).toBe(200);
    expect(renamed.body).toMatchObject({ id: created.body.id, name: "Basket" });

    expect((await as.get(`/projects/${project.id}/modules`)).body).toEqual({ items: [renamed.body] });
    expect((await as.delete(`/modules/${created.body.id}`)).status).toBe(204);
    expect((await as.get(`/projects/${project.id}/modules`)).body).toEqual({ items: [] });
  });

  it("creates, reads, lists without sources, renames, and deletes a Test File", async () => {
    const as = await client();
    const { module } = await workspace(as);

    const created = await as.post(`/modules/${module.id}/test-files`, { name: "remove.yaml", source: VALID });
    expect(created.status).toBe(201);
    const testFile = { id: expect.any(String), moduleId: module.id, name: "remove.yaml", ...timestamps };
    expect(created.body).toEqual({ testFile, diagnostics: [] });

    const read = await as.get(`/test-files/${created.body.testFile.id}`);
    expect(read.status).toBe(200);
    expect(read.body).toEqual({ ...testFile, source: VALID });

    const renamed = await as.patch(`/test-files/${created.body.testFile.id}`, { name: "drop.yaml" });
    expect(renamed.status).toBe(200);
    expect(renamed.body).toEqual({ testFile: { ...testFile, name: "drop.yaml" }, diagnostics: [] });

    const listed = await as.get(`/modules/${module.id}/test-files`);
    expect(listed.body.items.map((item: { name: string }) => item.name)).toEqual(["add.yaml", "drop.yaml"]);
    expect(listed.body.items.every((item: object) => !("source" in item))).toBe(true);

    expect((await as.delete(`/test-files/${created.body.testFile.id}`)).status).toBe(204);
    expect((await as.get(`/test-files/${created.body.testFile.id}`)).status).toBe(404);
  });

  it("saves a source with diagnostics and answers them", async () => {
    const as = await client();
    const { module, testFile } = await workspace(as);
    const diagnostics = analyze(INVALID).diagnostics;
    expect(diagnostics.length).toBeGreaterThan(0);

    const created = await as.post(`/modules/${module.id}/test-files`, { name: "plan.yaml", source: INVALID });
    const changed = await as.patch(`/test-files/${testFile.id}`, { source: INVALID });

    expect(created.status).toBe(201);
    expect(created.body.diagnostics).toEqual(diagnostics);
    expect(changed.status).toBe(200);
    expect(changed.body.diagnostics).toEqual(diagnostics);
    expect((await as.get(`/test-files/${testFile.id}`)).body.source).toBe(INVALID);
  });

  it("answers the diagnostics of the saved source when a PATCH leaves it as it is", async () => {
    const as = await client();
    const { module } = await workspace(as);
    const created = (await as.post(`/modules/${module.id}/test-files`, { name: "plan.yaml", source: INVALID })).body;

    const renamed = await as.patch(`/test-files/${created.testFile.id}`, { name: "plan-2.yaml" });

    expect(renamed.body.diagnostics).toEqual(analyze(INVALID).diagnostics);
  });

  it("validates a source without saving it", async () => {
    const as = await client();

    const valid = await as.post("/test-files/validate", { source: VALID });
    const invalid = await as.post("/test-files/validate", { source: INVALID });

    expect(valid.status).toBe(200);
    expect(valid.body).toEqual({ diagnostics: [] });
    expect(invalid.body).toEqual({ diagnostics: analyze(INVALID).diagnostics });
    expect(await db().testFile.count()).toBe(0);
  });

  it("moves a Test File to another of the user's Modules", async () => {
    const as = await client();
    const { project, testFile } = await workspace(as);
    const target = (await as.post(`/projects/${project.id}/modules`, { name: "Checkout" })).body;

    const moved = await as.patch(`/test-files/${testFile.id}`, { moduleId: target.id });

    expect(moved.status).toBe(200);
    expect(moved.body.testFile.moduleId).toBe(target.id);
    expect((await as.get(`/modules/${target.id}/test-files`)).body.items).toHaveLength(1);
  });

  it("answers 404 for a move to a missing Module or another user's Module", async () => {
    const as = await client();
    const other = await client("bob@example.com");
    const { testFile } = await workspace(as);
    const theirs = await workspace(other);

    for (const moduleId of [MISSING_ID, theirs.module.id]) {
      const res = await as.patch(`/test-files/${testFile.id}`, { moduleId });
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe("not_found");
    }
    expect((await as.get(`/test-files/${testFile.id}`)).body.moduleId).not.toBe(theirs.module.id);
  });

  it("answers 409 for a name taken within the same parent, and allows it elsewhere", async () => {
    const as = await client();
    const other = await client("bob@example.com");
    const { project, module, testFile } = await workspace(as);
    const second = (await as.post(`/projects/${project.id}/modules`, { name: "Checkout" })).body;
    await as.post(`/modules/${second.id}/test-files`, { name: "add.yaml", source: VALID });
    const spare = (await as.post("/projects", { name: "Spare" })).body;
    const renamable = (await as.post(`/modules/${module.id}/test-files`, { name: "b.yaml", source: VALID })).body;

    const conflicts = [
      await as.post("/projects", { name: "Shop" }),
      await as.patch(`/projects/${spare.id}`, { name: "Shop" }),
      await as.post(`/projects/${project.id}/modules`, { name: "Cart" }),
      await as.patch(`/modules/${second.id}`, { name: "Cart" }),
      await as.post(`/modules/${module.id}/test-files`, { name: "add.yaml", source: VALID }),
      await as.patch(`/test-files/${renamable.testFile.id}`, { name: "add.yaml" }),
      await as.patch(`/test-files/${testFile.id}`, { moduleId: second.id }),
    ];

    for (const res of conflicts) {
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe("conflict");
    }
    expect((await other.post("/projects", { name: "Shop" })).status).toBe(201);
  });

  it("sets, lists by name only, and deletes Project Variables", async () => {
    const as = await client();
    const { project } = await workspace(as);

    expect((await as.put(`/projects/${project.id}/variables/PASSWORD`, { value: "hunter2" })).status).toBe(204);
    expect((await as.put(`/projects/${project.id}/variables/BASE`, { value: "https://a.example" })).status).toBe(204);
    expect((await as.put(`/projects/${project.id}/variables/BASE`, { value: "https://b.example" })).status).toBe(204);

    const listed = await as.get(`/projects/${project.id}/variables`);
    expect(listed.status).toBe(200);
    expect(listed.body).toEqual({ items: ["BASE", "PASSWORD"] });
    expect(JSON.stringify(listed.body)).not.toContain("hunter2");
    expect((await db().variable.findFirstOrThrow({ where: { name: "BASE" } })).value).toBe("https://b.example");

    expect((await as.delete(`/projects/${project.id}/variables/PASSWORD`)).status).toBe(204);
    expect((await as.get(`/projects/${project.id}/variables`)).body).toEqual({ items: ["BASE"] });
    expect((await as.delete(`/projects/${project.id}/variables/PASSWORD`)).status).toBe(404);
  });

  it("answers the tree of Projects, Modules, and Test Files with each file's latest Run", async () => {
    const as = await client();
    const ids = await workspace(as);
    const empty = (await as.post(`/projects/${ids.project.id}/modules`, { name: "Empty" })).body;
    await addRun(as.user.id, ids);
    const latest = await addRun(as.user.id, ids);

    const res = await as.get("/tree");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      items: [
        {
          ...ids.project,
          modules: [
            {
              ...ids.module,
              testFiles: [
                {
                  ...ids.testFile,
                  latestRun: { id: latest.id, status: "queued", createdAt: latest.createdAt.toISOString() },
                },
              ],
            },
            { ...empty, testFiles: [] },
          ],
        },
      ],
    });
  });

  it("answers latestRun null for a Test File that never ran", async () => {
    const as = await client();
    await workspace(as);

    const res = await as.get("/tree");

    expect(res.body.items[0].modules[0].testFiles[0].latestRun).toBeNull();
  });

  it("deletes a Project's Modules, Test Files, and Variables, and keeps its Runs", async () => {
    const as = await client();
    const ids = await workspace(as);
    await as.put(`/projects/${ids.project.id}/variables/BASE`, { value: "x" });
    const run = await addRun(as.user.id, ids);

    expect((await as.delete(`/projects/${ids.project.id}`)).status).toBe(204);

    expect((await as.get(`/modules/${ids.module.id}/test-files`)).status).toBe(404);
    expect((await as.get(`/test-files/${ids.testFile.id}`)).status).toBe(404);
    expect(await db().variable.count()).toBe(0);
    expect(await db().run.findUniqueOrThrow({ where: { id: run.id } })).toMatchObject({
      projectId: null,
      moduleId: null,
      testFileId: null,
      source: VALID,
    });
  });

  it("deletes a Module's Test Files and keeps their Runs in the Project", async () => {
    const as = await client();
    const ids = await workspace(as);
    const run = await addRun(as.user.id, ids);

    expect((await as.delete(`/modules/${ids.module.id}`)).status).toBe(204);

    expect((await as.get(`/test-files/${ids.testFile.id}`)).status).toBe(404);
    expect(await db().run.findUniqueOrThrow({ where: { id: run.id } })).toMatchObject({
      projectId: ids.project.id,
      moduleId: null,
      testFileId: null,
    });
  });

  it("answers 404 for every route on another user's Project, Module, or Test File, and changes nothing", async () => {
    const as = await client();
    const other = await client("bob@example.com");
    const theirs = await workspace(other);
    const { project, module, testFile } = theirs;
    await other.put(`/projects/${project.id}/variables/BASE`, { value: "x" });
    const mine = await workspace(as);

    const answers = [
      await as.patch(`/projects/${project.id}`, { name: "Mine" }),
      await as.delete(`/projects/${project.id}`),
      await as.get(`/projects/${project.id}/variables`),
      await as.put(`/projects/${project.id}/variables/BASE`, { value: "mine" }),
      await as.delete(`/projects/${project.id}/variables/BASE`),
      await as.get(`/projects/${project.id}/modules`),
      await as.post(`/projects/${project.id}/modules`, { name: "Mine" }),
      await as.patch(`/modules/${module.id}`, { name: "Mine" }),
      await as.delete(`/modules/${module.id}`),
      await as.get(`/modules/${module.id}/test-files`),
      await as.post(`/modules/${module.id}/test-files`, { name: "mine.yaml", source: VALID }),
      await as.get(`/test-files/${testFile.id}`),
      await as.patch(`/test-files/${testFile.id}`, { moduleId: mine.module.id }),
      await as.delete(`/test-files/${testFile.id}`),
    ];

    for (const [index, res] of answers.entries()) {
      expect(res.status, `answer ${index}`).toBe(404);
      expect(res.body.error.code).toBe("not_found");
    }
    expect((await other.get("/tree")).body.items[0].modules[0].testFiles).toHaveLength(1);
    expect(await db().variable.findFirstOrThrow({ where: { projectId: project.id } })).toMatchObject({ value: "x" });
    expect((await as.get("/projects")).body.items.map((item: { id: string }) => item.id)).toEqual([mine.project.id]);
    expect((await as.get("/tree")).body.items).toHaveLength(1);
  });

  it("answers 404 for ids that do not exist", async () => {
    const as = await client();

    expect((await as.patch(`/projects/${MISSING_ID}`, { name: "x" })).status).toBe(404);
    expect((await as.patch(`/modules/${MISSING_ID}`, { name: "x" })).status).toBe(404);
    expect((await as.get(`/test-files/${MISSING_ID}`)).status).toBe(404);
  });
});
