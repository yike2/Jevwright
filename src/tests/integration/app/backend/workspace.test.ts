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
const TOO_DEEP = "Folders can be at most 4 levels deep, counting the project.";

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

  // A Project "Shop" with a folder "Cart" holding add.yaml.
  async function workspace(as: Client) {
    const project = (await as.post("/projects", { name: "Shop" })).body;
    const folder = (await as.post(`/projects/${project.id}/folders`, { name: "Cart" })).body;
    const testFile = await addFile(as, project.id, folder.id, "add.yaml");
    return { project, folder, testFile };
  }

  // A Test File without its source, as lists and the tree answer it.
  async function addFile(as: Client, projectId: string, folderId: string | null, name: string) {
    const saved = (await as.post(`/projects/${projectId}/test-files`, { name, source: VALID, folderId })).body;
    const { source: _source, ...testFile } = saved.testFile;
    return testFile;
  }

  // Folders nested in each other from the Project down, e.g. ["a", "b"] for Project/a/b; answers the last one.
  async function addFolders(as: Client, projectId: string, names: string[]) {
    let parentId: string | null = null;
    let folder = { id: "" };
    for (const name of names) {
      folder = (await as.post(`/projects/${projectId}/folders`, { name, parentId })).body;
      parentId = folder.id;
    }
    return folder;
  }

  async function addRun(userId: string, ids: { project: { id: string }; testFile: { id: string } }) {
    return db().run.create({
      data: {
        userId,
        projectId: ids.project.id,
        testFileId: ids.testFile.id,
        fileName: "add.yaml",
        path: "Cart/add.yaml",
        name: "Add to cart",
        source: VALID,
      },
    });
  }

  const names = (items: { name: string }[]) => items.map((item) => item.name);

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

  it("creates and lists a folder directly in a Project", async () => {
    const as = await client();
    const project = (await as.post("/projects", { name: "Shop" })).body;

    const created = await as.post(`/projects/${project.id}/folders`, { name: "  Cart  " });

    expect(created.status).toBe(201);
    expect(created.body).toEqual({
      id: expect.any(String),
      projectId: project.id,
      parentId: null,
      name: "Cart",
      ...timestamps,
    });
    expect((await as.get(`/projects/${project.id}/folders`)).body).toEqual({ items: [created.body] });
  });

  it("creates a folder inside a folder", async () => {
    const as = await client();
    const { project, folder } = await workspace(as);

    const created = await as.post(`/projects/${project.id}/folders`, { name: "Coupons", parentId: folder.id });

    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ projectId: project.id, parentId: folder.id, name: "Coupons" });
  });

  it("lists every folder of a Project, at any level, by name", async () => {
    const as = await client();
    const { project } = await workspace(as);
    await addFolders(as, project.id, ["Account", "Profile", "Avatar"]);

    const listed = await as.get(`/projects/${project.id}/folders`);

    expect(names(listed.body.items)).toEqual(["Account", "Avatar", "Cart", "Profile"]);
  });

  it("creates a folder at level 4, counting the Project", async () => {
    const as = await client();
    const project = (await as.post("/projects", { name: "Shop" })).body;

    const deepest = await addFolders(as, project.id, ["a", "b", "c"]);

    expect(deepest).toMatchObject({ name: "c" });
  });

  it("answers 400 for a folder below level 4, and adds nothing", async () => {
    const as = await client();
    const project = (await as.post("/projects", { name: "Shop" })).body;
    const deepest = await addFolders(as, project.id, ["a", "b", "c"]);

    const res = await as.post(`/projects/${project.id}/folders`, { name: "d", parentId: deepest.id });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatchObject({ code: "invalid_request", message: TOO_DEEP });
    expect(await db().folder.count()).toBe(3);
  });

  it("answers 404 for a parent folder of another Project", async () => {
    const as = await client();
    const { folder } = await workspace(as);
    const other = (await as.post("/projects", { name: "Blog" })).body;

    const res = await as.post(`/projects/${other.id}/folders`, { name: "Posts", parentId: folder.id });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("not_found");
  });

  it("renames a folder", async () => {
    const as = await client();
    const { folder } = await workspace(as);

    const renamed = await as.patch(`/folders/${folder.id}`, { name: "Basket" });

    expect(renamed.status).toBe(200);
    expect(renamed.body).toEqual({ ...folder, name: "Basket", updatedAt: expect.any(String) });
  });

  it("deletes a folder with every folder and Test File inside, and keeps their Runs in the Project", async () => {
    const as = await client();
    const ids = await workspace(as);
    const inner = (await as.post(`/projects/${ids.project.id}/folders`, { name: "Coupons", parentId: ids.folder.id }))
      .body;
    const innerFile = await addFile(as, ids.project.id, inner.id, "code.yaml");
    const run = await addRun(as.user.id, ids);

    expect((await as.delete(`/folders/${ids.folder.id}`)).status).toBe(204);

    expect((await as.get(`/test-files/${ids.testFile.id}`)).status).toBe(404);
    expect((await as.get(`/test-files/${innerFile.id}`)).status).toBe(404);
    expect(await db().folder.count()).toBe(0);
    expect(await db().run.findUniqueOrThrow({ where: { id: run.id } })).toMatchObject({
      projectId: ids.project.id,
      testFileId: null,
      fileName: "add.yaml",
      path: "Cart/add.yaml",
    });
  });

  it("creates, reads, renames, and deletes a Test File in a folder", async () => {
    const as = await client();
    const { project, folder } = await workspace(as);

    const created = await as.post(`/projects/${project.id}/test-files`, {
      name: "remove.yaml",
      source: VALID,
      folderId: folder.id,
    });
    expect(created.status).toBe(201);
    const testFile = { id: expect.any(String), projectId: project.id, folderId: folder.id, name: "remove.yaml" };
    expect(created.body).toEqual({ testFile: { ...testFile, ...timestamps, source: VALID }, diagnostics: [] });

    const read = await as.get(`/test-files/${created.body.testFile.id}`);
    expect(read.status).toBe(200);
    expect(read.body).toEqual({ ...testFile, ...timestamps, source: VALID });

    const renamed = await as.patch(`/test-files/${created.body.testFile.id}`, { name: "drop.yaml" });
    expect(renamed.status).toBe(200);
    expect(renamed.body.testFile).toMatchObject({ ...testFile, name: "drop.yaml", source: VALID });

    expect((await as.delete(`/test-files/${created.body.testFile.id}`)).status).toBe(204);
    expect((await as.get(`/test-files/${created.body.testFile.id}`)).status).toBe(404);
  });

  it("creates a Test File directly in a Project", async () => {
    const as = await client();
    const project = (await as.post("/projects", { name: "Shop" })).body;

    const created = await as.post(`/projects/${project.id}/test-files`, { name: "smoke.yaml", source: VALID });

    expect(created.status).toBe(201);
    expect(created.body.testFile).toMatchObject({ projectId: project.id, folderId: null, name: "smoke.yaml" });
  });

  it("lists every Test File of a Project, at any level, without sources", async () => {
    const as = await client();
    const { project } = await workspace(as);
    await addFile(as, project.id, null, "smoke.yaml");

    const listed = await as.get(`/projects/${project.id}/test-files`);

    expect(names(listed.body.items)).toEqual(["add.yaml", "smoke.yaml"]);
    expect(listed.body.items.every((item: object) => !("source" in item))).toBe(true);
  });

  it("answers 409 for a folder name taken by a folder or a Test File in the same parent", async () => {
    const as = await client();
    const { project, folder } = await workspace(as);
    await addFile(as, project.id, null, "smoke.yaml");
    await addFile(as, project.id, folder.id, "deep.yaml");
    const spare = (await as.post(`/projects/${project.id}/folders`, { name: "Spare" })).body;

    const conflicts = [
      await as.post(`/projects/${project.id}/folders`, { name: "Cart" }),
      await as.post(`/projects/${project.id}/folders`, { name: "smoke.yaml" }),
      await as.post(`/projects/${project.id}/folders`, { name: "deep.yaml", parentId: folder.id }),
      await as.patch(`/folders/${spare.id}`, { name: "Cart" }),
    ];

    expect(conflicts.map((res) => [res.status, res.body.error.message])).toEqual([
      [409, "A folder or test file with this name already exists in this project."],
      [409, "A folder or test file with this name already exists in this project."],
      [409, "A folder or test file with this name already exists in this folder."],
      [409, "A folder or test file with this name already exists in this project."],
    ]);
    expect(await db().folder.count()).toBe(2);
  });

  it("answers 409 for a Test File name taken by a folder or a Test File in the same parent", async () => {
    const as = await client();
    const { project, folder } = await workspace(as);
    await as.post(`/projects/${project.id}/folders`, { name: "named.yaml" });
    const renamable = await addFile(as, project.id, folder.id, "b.yaml");

    const conflicts = [
      await as.post(`/projects/${project.id}/test-files`, { name: "add.yaml", source: VALID, folderId: folder.id }),
      await as.post(`/projects/${project.id}/test-files`, { name: "named.yaml", source: VALID }),
      await as.patch(`/test-files/${renamable.id}`, { name: "add.yaml" }),
    ];

    expect(conflicts.map((res) => [res.status, res.body.error.message])).toEqual([
      [409, "A folder or test file with this name already exists in this folder."],
      [409, "A folder or test file with this name already exists in this project."],
      [409, "A folder or test file with this name already exists in this folder."],
    ]);
  });

  it("allows the same name in different parents and in another user's workspace", async () => {
    const as = await client();
    const other = await client("bob@example.com");
    const { project, folder } = await workspace(as);

    const answers = [
      await as.post(`/projects/${project.id}/folders`, { name: "Cart", parentId: folder.id }),
      await as.post(`/projects/${project.id}/test-files`, { name: "add.yaml", source: VALID }),
      await as.post("/projects", { name: "Blog" }),
      await other.post("/projects", { name: "Shop" }),
    ];

    expect(answers.map((res) => res.status)).toEqual([201, 201, 201, 201]);
    const blog = answers[2]!.body;
    expect((await as.post(`/projects/${blog.id}/folders`, { name: "Cart" })).status).toBe(201);
  });

  it("answers 409 for a project name taken by the user", async () => {
    const as = await client();
    await workspace(as);
    const spare = (await as.post("/projects", { name: "Spare" })).body;

    const conflicts = [
      await as.post("/projects", { name: "Shop" }),
      await as.patch(`/projects/${spare.id}`, { name: "Shop" }),
    ];

    expect(conflicts.map((res) => [res.status, res.body.error.message])).toEqual([
      [409, "A project with this name already exists."],
      [409, "A project with this name already exists."],
    ]);
  });

  it("saves a source with diagnostics and answers them", async () => {
    const as = await client();
    const { project, folder, testFile } = await workspace(as);
    const diagnostics = analyze(INVALID).diagnostics;
    expect(diagnostics.length).toBeGreaterThan(0);

    const created = await as.post(`/projects/${project.id}/test-files`, {
      name: "plan.yaml",
      source: INVALID,
      folderId: folder.id,
    });
    const changed = await as.patch(`/test-files/${testFile.id}`, { source: INVALID });

    expect(created.status).toBe(201);
    expect(created.body.diagnostics).toEqual(diagnostics);
    expect(changed.status).toBe(200);
    expect(changed.body.diagnostics).toEqual(diagnostics);
    expect((await as.get(`/test-files/${testFile.id}`)).body.source).toBe(INVALID);
  });

  it("answers the saved source with a PATCH, so the editor can show it without reading it again", async () => {
    const as = await client();
    const { testFile } = await workspace(as);

    const changed = await as.patch(`/test-files/${testFile.id}`, { source: INVALID });

    expect(changed.status).toBe(200);
    expect(changed.body.testFile.source).toBe(INVALID);
  });

  it("answers the diagnostics of the saved source when a PATCH leaves it as it is", async () => {
    const as = await client();
    const { project } = await workspace(as);
    const created = (await as.post(`/projects/${project.id}/test-files`, { name: "plan.yaml", source: INVALID })).body;

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

  it("adds the Quick Start project to an account without one", async () => {
    const as = await client();

    const res = await as.post("/projects/quick-start");

    expect(res.status).toBe(201);
    expect(res.body).toEqual({ id: expect.any(String), name: "Quick Start", ...timestamps });
    const tree = (await as.get("/tree")).body.items;
    expect(tree.map((project: { name: string }) => project.name)).toEqual(["Quick Start"]);
    expect(names(tree[0].folders)).toEqual([
      "1 Passing tests",
      "2 Failing tests - see why they fail",
      "3 Invalid files - fix the errors",
      "4 Jev - find and check by description",
    ]);
    const variables = (await as.get(`/projects/${res.body.id}/variables`)).body.items;
    expect(variables.map((variable: { name: string }) => variable.name)).toEqual(["BASE", "SWAG_PASSWORD"]);
  });

  it("answers 409 when the account already has a project named Quick Start, and adds nothing", async () => {
    const as = await client();
    await as.post("/projects", { name: "Quick Start" });

    const res = await as.post("/projects/quick-start");

    expect(res.status).toBe(409);
    expect(res.body.error).toEqual({
      code: "conflict",
      message: "You already have a project named Quick Start. Rename or delete it, then add it again.",
    });
    const tree = (await as.get("/tree")).body.items;
    expect(tree).toHaveLength(1);
    expect(tree[0].folders).toEqual([]);
  });

  it("sets, lists with their values, and deletes Project Variables", async () => {
    const as = await client();
    const { project } = await workspace(as);

    expect((await as.put(`/projects/${project.id}/variables/PASSWORD`, { value: "hunter2" })).status).toBe(204);
    expect((await as.put(`/projects/${project.id}/variables/BASE`, { value: "https://a.example" })).status).toBe(204);
    expect((await as.put(`/projects/${project.id}/variables/BASE`, { value: "https://b.example" })).status).toBe(204);

    const listed = await as.get(`/projects/${project.id}/variables`);
    expect(listed.status).toBe(200);
    expect(listed.body).toEqual({
      items: [
        { name: "BASE", value: "https://b.example" },
        { name: "PASSWORD", value: "hunter2" },
      ],
    });
    expect((await db().variable.findFirstOrThrow({ where: { name: "BASE" } })).value).toBe("https://b.example");

    expect((await as.delete(`/projects/${project.id}/variables/PASSWORD`)).status).toBe(204);
    expect((await as.get(`/projects/${project.id}/variables`)).body).toEqual({
      items: [{ name: "BASE", value: "https://b.example" }],
    });
    expect((await as.delete(`/projects/${project.id}/variables/PASSWORD`)).status).toBe(404);
  });

  it("moves a Test File into another folder and keeps its Runs", async () => {
    const as = await client();
    const ids = await workspace(as);
    const target = (await as.post(`/projects/${ids.project.id}/folders`, { name: "Checkout" })).body;
    const run = await addRun(as.user.id, ids);

    const moved = await as.patch(`/test-files/${ids.testFile.id}`, { folderId: target.id });

    expect(moved.status).toBe(200);
    expect(moved.body.testFile).toMatchObject({ id: ids.testFile.id, projectId: ids.project.id, folderId: target.id });
    expect((await db().run.findUniqueOrThrow({ where: { id: run.id } })).testFileId).toBe(ids.testFile.id);
  });

  it("moves a Test File directly into its Project", async () => {
    const as = await client();
    const { project, testFile } = await workspace(as);

    const moved = await as.patch(`/test-files/${testFile.id}`, { folderId: null });

    expect(moved.status).toBe(200);
    expect(moved.body.testFile).toMatchObject({ projectId: project.id, folderId: null });
  });

  it("moves a Test File to another Project, whose Variables its Runs then read", async () => {
    const as = await client();
    const ids = await workspace(as);
    const blog = (await as.post("/projects", { name: "Blog" })).body;
    const run = await addRun(as.user.id, ids);

    const moved = await as.patch(`/test-files/${ids.testFile.id}`, { projectId: blog.id, folderId: null });

    expect(moved.status).toBe(200);
    expect(moved.body.testFile).toMatchObject({ projectId: blog.id, folderId: null });
    expect((await db().run.findUniqueOrThrow({ where: { id: run.id } })).testFileId).toBe(ids.testFile.id);
  });

  it("moves a Test File into a folder of another Project", async () => {
    const as = await client();
    const { testFile } = await workspace(as);
    const blog = (await as.post("/projects", { name: "Blog" })).body;
    const posts = (await as.post(`/projects/${blog.id}/folders`, { name: "Posts" })).body;

    const moved = await as.patch(`/test-files/${testFile.id}`, { folderId: posts.id });

    expect(moved.body.testFile).toMatchObject({ projectId: blog.id, folderId: posts.id });
  });

  it("moves a folder into another folder with everything inside", async () => {
    const as = await client();
    const { project, folder, testFile } = await workspace(as);
    const target = (await as.post(`/projects/${project.id}/folders`, { name: "Shopping" })).body;

    const moved = await as.patch(`/folders/${folder.id}`, { parentId: target.id });

    expect(moved.status).toBe(200);
    expect(moved.body).toMatchObject({ id: folder.id, parentId: target.id });
    const tree = (await as.get("/tree")).body.items[0];
    expect(names(tree.folders)).toEqual(["Shopping"]);
    expect(tree.folders[0].folders[0].testFiles.map((file: { id: string }) => file.id)).toEqual([testFile.id]);
  });

  it("moves a folder to another Project with every folder and Test File inside", async () => {
    const as = await client();
    const ids = await workspace(as);
    const inner = (await as.post(`/projects/${ids.project.id}/folders`, { name: "Coupons", parentId: ids.folder.id }))
      .body;
    const innerFile = await addFile(as, ids.project.id, inner.id, "code.yaml");
    const blog = (await as.post("/projects", { name: "Blog" })).body;

    const moved = await as.patch(`/folders/${ids.folder.id}`, { projectId: blog.id, parentId: null });

    expect(moved.status).toBe(200);
    expect(moved.body).toMatchObject({ projectId: blog.id, parentId: null });
    expect(await db().folder.findUniqueOrThrow({ where: { id: inner.id } })).toMatchObject({ projectId: blog.id });
    expect((await as.get(`/test-files/${ids.testFile.id}`)).body.projectId).toBe(blog.id);
    expect((await as.get(`/test-files/${innerFile.id}`)).body).toMatchObject({
      projectId: blog.id,
      folderId: inner.id,
    });
  });

  it("answers 400 for moving a folder into itself or one of its own folders, and changes nothing", async () => {
    const as = await client();
    const { project, folder } = await workspace(as);
    const inner = (await as.post(`/projects/${project.id}/folders`, { name: "Coupons", parentId: folder.id })).body;

    const answers = [
      await as.patch(`/folders/${folder.id}`, { parentId: folder.id }),
      await as.patch(`/folders/${folder.id}`, { parentId: inner.id }),
    ];

    for (const res of answers) {
      expect(res.status).toBe(400);
      expect(res.body.error).toMatchObject({
        code: "invalid_request",
        message: "A folder cannot be moved into itself or into one of its own folders.",
      });
    }
    expect(await db().folder.findUniqueOrThrow({ where: { id: folder.id } })).toMatchObject({ parentId: null });
  });

  it("answers 400 for moving a folder where it or its folders would be below level 4, and changes nothing", async () => {
    const as = await client();
    const project = (await as.post("/projects", { name: "Shop" })).body;
    const deep = await addFolders(as, project.id, ["a", "b"]);
    await addFolders(as, project.id, ["x", "y"]);
    const x = (await db().folder.findFirstOrThrow({ where: { name: "x" } })).id;

    const res = await as.patch(`/folders/${x}`, { parentId: deep.id });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatchObject({ code: "invalid_request", message: TOO_DEEP });
    expect(await db().folder.findUniqueOrThrow({ where: { id: x } })).toMatchObject({ parentId: null });
  });

  it("answers 409 for a move to a parent where the name is taken, and changes nothing", async () => {
    const as = await client();
    const { project, folder, testFile } = await workspace(as);
    const target = (await as.post(`/projects/${project.id}/folders`, { name: "Checkout" })).body;
    await addFile(as, project.id, target.id, "add.yaml");
    await as.post(`/projects/${project.id}/folders`, { name: "Cart", parentId: target.id });

    const answers = [
      await as.patch(`/test-files/${testFile.id}`, { folderId: target.id }),
      await as.patch(`/folders/${folder.id}`, { parentId: target.id }),
    ];

    expect(answers.map((res) => [res.status, res.body.error.message])).toEqual([
      [409, "A folder or test file with this name already exists in this folder."],
      [409, "A folder or test file with this name already exists in this folder."],
    ]);
    expect((await as.get(`/test-files/${testFile.id}`)).body.folderId).toBe(folder.id);
    expect(await db().folder.findUniqueOrThrow({ where: { id: folder.id } })).toMatchObject({ parentId: null });
  });

  it("answers 404 for a move to a missing or another user's Project or folder", async () => {
    const as = await client();
    const other = await client("bob@example.com");
    const { folder, testFile } = await workspace(as);
    const theirs = await workspace(other);

    const answers = [
      await as.patch(`/test-files/${testFile.id}`, { folderId: MISSING_ID }),
      await as.patch(`/test-files/${testFile.id}`, { folderId: theirs.folder.id }),
      await as.patch(`/test-files/${testFile.id}`, { projectId: theirs.project.id, folderId: null }),
      await as.patch(`/folders/${folder.id}`, { parentId: theirs.folder.id }),
      await as.patch(`/folders/${folder.id}`, { projectId: theirs.project.id, parentId: null }),
    ];

    for (const res of answers) {
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe("not_found");
    }
    expect((await other.get("/tree")).body.items[0].folders).toHaveLength(1);
  });

  it("answers the nested tree of Projects, folders, and Test Files with each file's latest Run", async () => {
    const as = await client();
    const ids = await workspace(as);
    const smoke = await addFile(as, ids.project.id, null, "smoke.yaml");
    const inner = (await as.post(`/projects/${ids.project.id}/folders`, { name: "Coupons", parentId: ids.folder.id }))
      .body;
    const empty = (await as.post(`/projects/${ids.project.id}/folders`, { name: "Empty" })).body;
    await addRun(as.user.id, ids);
    const latest = await addRun(as.user.id, ids);

    const res = await as.get("/tree");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      items: [
        {
          ...ids.project,
          folders: [
            {
              ...ids.folder,
              folders: [{ ...inner, folders: [], testFiles: [] }],
              testFiles: [
                {
                  ...ids.testFile,
                  latestRun: { id: latest.id, status: "queued", createdAt: latest.createdAt.toISOString() },
                },
              ],
            },
            { ...empty, folders: [], testFiles: [] },
          ],
          testFiles: [{ ...smoke, latestRun: null }],
        },
      ],
    });
  });

  it("deletes a Project's folders, Test Files, and Variables, and keeps its Runs", async () => {
    const as = await client();
    const ids = await workspace(as);
    await as.put(`/projects/${ids.project.id}/variables/BASE`, { value: "x" });
    const run = await addRun(as.user.id, ids);

    expect((await as.delete(`/projects/${ids.project.id}`)).status).toBe(204);

    expect(await db().folder.count()).toBe(0);
    expect((await as.get(`/test-files/${ids.testFile.id}`)).status).toBe(404);
    expect(await db().variable.count()).toBe(0);
    expect(await db().run.findUniqueOrThrow({ where: { id: run.id } })).toMatchObject({
      projectId: null,
      testFileId: null,
      path: "Cart/add.yaml",
      source: VALID,
    });
  });

  it("answers 404 for every route on another user's Project, folder, or Test File, and changes nothing", async () => {
    const as = await client();
    const other = await client("bob@example.com");
    const theirs = await workspace(other);
    const { project, folder, testFile } = theirs;
    await other.put(`/projects/${project.id}/variables/BASE`, { value: "x" });
    const mine = await workspace(as);

    const answers = [
      await as.patch(`/projects/${project.id}`, { name: "Mine" }),
      await as.delete(`/projects/${project.id}`),
      await as.get(`/projects/${project.id}/variables`),
      await as.put(`/projects/${project.id}/variables/BASE`, { value: "mine" }),
      await as.delete(`/projects/${project.id}/variables/BASE`),
      await as.get(`/projects/${project.id}/folders`),
      await as.post(`/projects/${project.id}/folders`, { name: "Mine" }),
      await as.post(`/projects/${mine.project.id}/folders`, { name: "Mine", parentId: folder.id }),
      await as.patch(`/folders/${folder.id}`, { name: "Mine" }),
      await as.patch(`/folders/${folder.id}`, { parentId: mine.folder.id }),
      await as.delete(`/folders/${folder.id}`),
      await as.get(`/projects/${project.id}/test-files`),
      await as.post(`/projects/${project.id}/test-files`, { name: "mine.yaml", source: VALID }),
      await as.post(`/projects/${mine.project.id}/test-files`, {
        name: "mine.yaml",
        source: VALID,
        folderId: folder.id,
      }),
      await as.get(`/test-files/${testFile.id}`),
      await as.patch(`/test-files/${testFile.id}`, { folderId: mine.folder.id }),
      await as.delete(`/test-files/${testFile.id}`),
    ];

    for (const [index, res] of answers.entries()) {
      expect(res.status, `answer ${index}`).toBe(404);
      expect(res.body.error.code).toBe("not_found");
    }
    const tree = (await other.get("/tree")).body.items[0];
    expect(names(tree.folders)).toEqual(["Cart"]);
    expect(tree.folders[0].testFiles).toHaveLength(1);
    expect(await db().variable.findFirstOrThrow({ where: { projectId: project.id } })).toMatchObject({ value: "x" });
    expect((await as.get("/tree")).body.items[0].folders[0].folders).toEqual([]);
  });

  it("answers 404 for ids that do not exist", async () => {
    const as = await client();

    expect((await as.patch(`/projects/${MISSING_ID}`, { name: "x" })).status).toBe(404);
    expect((await as.patch(`/folders/${MISSING_ID}`, { name: "x" })).status).toBe(404);
    expect((await as.delete(`/folders/${MISSING_ID}`)).status).toBe(404);
    expect((await as.get(`/test-files/${MISSING_ID}`)).status).toBe(404);
  });
});
