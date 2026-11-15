import { expect, it } from "vitest";
import { describeDb, useTestDb } from "./test-db.js";

describeDb("the database schema", () => {
  const db = useTestDb("test_db");

  async function seed() {
    const user = await db().user.create({ data: { email: "a@example.com", passwordHash: "hash" } });
    const project = await db().project.create({ data: { userId: user.id, name: "Shop" } });
    const folder = await db().folder.create({ data: { projectId: project.id, name: "Cart" } });
    const testFile = await db().testFile.create({
      data: { projectId: project.id, folderId: folder.id, name: "add.yaml", source: "x" },
    });
    await db().variable.create({ data: { projectId: project.id, name: "BASE", value: "https://example.com" } });
    const run = await db().run.create({
      data: {
        userId: user.id,
        testFileId: testFile.id,
        projectId: project.id,
        fileName: "add.yaml",
        path: "Cart/add.yaml",
        name: "Add to cart",
        source: "x",
      },
    });
    return { user, project, folder, testFile, run };
  }

  it("rejects a second user with the same email", async () => {
    await seed();

    await expect(db().user.create({ data: { email: "a@example.com", passwordHash: "hash" } })).rejects.toThrow();
  });

  it("keeps names unique within their parent only", async () => {
    const { user, project, folder } = await seed();
    const other = await db().user.create({ data: { email: "b@example.com", passwordHash: "hash" } });

    await expect(db().project.create({ data: { userId: user.id, name: "Shop" } })).rejects.toThrow();
    await expect(
      db().testFile.create({ data: { projectId: project.id, folderId: folder.id, name: "add.yaml", source: "" } }),
    ).rejects.toThrow();
    await expect(db().variable.create({ data: { projectId: project.id, name: "BASE", value: "" } })).rejects.toThrow();
    await expect(db().project.create({ data: { userId: other.id, name: "Shop" } })).resolves.toBeDefined();
    await expect(
      db().folder.create({ data: { projectId: project.id, parentId: folder.id, name: "Cart" } }),
    ).resolves.toBeDefined();
  });

  it("keeps names unique directly in a Project, where the parent is null", async () => {
    const { project } = await seed();
    await db().testFile.create({ data: { projectId: project.id, name: "smoke.yaml", source: "" } });

    await expect(
      db().testFile.create({ data: { projectId: project.id, name: "smoke.yaml", source: "" } }),
    ).rejects.toThrow();
    await expect(db().folder.create({ data: { projectId: project.id, name: "Cart" } })).rejects.toThrow();
  });

  it("stores a new Run as queued", async () => {
    const { run } = await seed();

    expect(run.status).toBe("queued");
  });

  it("deletes a Project's folders, Test Files, and Variables, and keeps its Runs with null ids", async () => {
    const { project, run } = await seed();

    await db().project.delete({ where: { id: project.id } });

    expect(await db().folder.count()).toBe(0);
    expect(await db().testFile.count()).toBe(0);
    expect(await db().variable.count()).toBe(0);
    expect(await db().run.findUnique({ where: { id: run.id } })).toMatchObject({
      testFileId: null,
      projectId: null,
      fileName: "add.yaml",
      path: "Cart/add.yaml",
      name: "Add to cart",
      source: "x",
    });
  });

  it("deletes a folder's subfolders and Test Files, and keeps the Runs in the Project", async () => {
    const { project, folder, run } = await seed();
    await db().folder.create({ data: { projectId: project.id, parentId: folder.id, name: "Coupons" } });

    await db().folder.delete({ where: { id: folder.id } });

    expect(await db().folder.count()).toBe(0);
    expect(await db().testFile.count()).toBe(0);
    expect(await db().run.findUnique({ where: { id: run.id } })).toMatchObject({
      testFileId: null,
      projectId: project.id,
    });
  });

  it("keeps a Run's Project when only its Test File is deleted", async () => {
    const { project, testFile, run } = await seed();

    await db().testFile.delete({ where: { id: testFile.id } });

    expect(await db().run.findUnique({ where: { id: run.id } })).toMatchObject({
      testFileId: null,
      projectId: project.id,
    });
  });
});
