import { readFileSync } from "node:fs";
import { afterAll, beforeAll, expect, it } from "vitest";
import { createDb, type Db } from "@/app/backend/src/db.js";
import { describeDb } from "./test-db.js";

// The folders migration turns every Module into a folder directly in its Project and loses nothing (backend.md 3.3).
// The schema is built from the migrations before it, filled with rows of that shape, then migrated.

const MIGRATIONS = new URL("../../../../app/backend/prisma/migrations/", import.meta.url);
const SCHEMA = "test_migration";
const BEFORE = ["20261110232026_init"];
const FOLDERS = "20261115120000_folders";

const ids = {
  user: "00000000-0000-4000-8000-000000000001",
  project: "00000000-0000-4000-8000-000000000002",
  cart: "00000000-0000-4000-8000-000000000003",
  empty: "00000000-0000-4000-8000-000000000004",
  add: "00000000-0000-4000-8000-000000000005",
  remove: "00000000-0000-4000-8000-000000000006",
  variable: "00000000-0000-4000-8000-000000000007",
  run: "00000000-0000-4000-8000-000000000008",
  orphanRun: "00000000-0000-4000-8000-000000000009",
};
const CREATED = "2026-11-01 10:00:00";

// Rows as the schema before folders had them: a Project with two Modules, Test Files, a Variable, and Runs, one of
// them of a Module and Test File already deleted.
const ROWS = `
INSERT INTO "User" ("id", "email", "passwordHash") VALUES ('${ids.user}', 'ada@example.com', 'hash');
INSERT INTO "Project" ("id", "userId", "name", "updatedAt") VALUES ('${ids.project}', '${ids.user}', 'Shop', NOW());
INSERT INTO "Variable" ("id", "projectId", "name", "value") VALUES ('${ids.variable}', '${ids.project}', 'BASE', 'https://shop.example');
INSERT INTO "Module" ("id", "projectId", "name", "createdAt", "updatedAt") VALUES ('${ids.cart}', '${ids.project}', 'Cart', '${CREATED}', '${CREATED}');
INSERT INTO "Module" ("id", "projectId", "name", "updatedAt") VALUES ('${ids.empty}', '${ids.project}', 'Empty', NOW());
INSERT INTO "TestFile" ("id", "moduleId", "name", "source", "updatedAt") VALUES ('${ids.add}', '${ids.cart}', 'add.yaml', 'name: add', NOW());
INSERT INTO "TestFile" ("id", "moduleId", "name", "source", "updatedAt") VALUES ('${ids.remove}', '${ids.cart}', 'remove.yaml', 'name: remove', NOW());
INSERT INTO "Run" ("id", "userId", "testFileId", "moduleId", "projectId", "fileName", "name", "source", "status") VALUES ('${ids.run}', '${ids.user}', '${ids.add}', '${ids.cart}', '${ids.project}', 'add.yaml', 'Add', 'name: add', 'passed');
INSERT INTO "Run" ("id", "userId", "testFileId", "moduleId", "projectId", "fileName", "name", "source", "status") VALUES ('${ids.orphanRun}', '${ids.user}', NULL, NULL, '${ids.project}', 'gone.yaml', 'Gone', 'name: gone', 'failed');
`;

const statements = (sql: string) =>
  sql
    .split(/;\s*\n/)
    .map((statement) => statement.trim())
    .filter((statement) => statement.replace(/^--.*$/gm, "").trim().length > 0);

const migration = (name: string) => readFileSync(new URL(`${name}/migration.sql`, MIGRATIONS), "utf8");

describeDb("the folders migration", () => {
  let db: Db | undefined;

  // Runs SQL in the test's schema, on one connection.
  const run = (sql: string) =>
    db!.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL search_path TO "${SCHEMA}"`);
      for (const statement of statements(sql)) await tx.$executeRawUnsafe(statement);
    });

  beforeAll(async () => {
    db = createDb(process.env.DATABASE_URL ?? "", SCHEMA);
    await db.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${SCHEMA}" CASCADE`);
    await db.$executeRawUnsafe(`CREATE SCHEMA "${SCHEMA}"`);
    for (const name of BEFORE) await run(migration(name));
    await run(ROWS);
    await run(migration(FOLDERS));
  }, 60_000);
  afterAll(async () => {
    await db?.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${SCHEMA}" CASCADE`);
    await db?.$disconnect();
  });

  it("turns every Module into a folder directly in its Project, with the same id, name, and times", async () => {
    const folders = await db!.folder.findMany({ orderBy: { name: "asc" } });

    expect(folders.map(({ id, projectId, parentId, name }) => ({ id, projectId, parentId, name }))).toEqual([
      { id: ids.cart, projectId: ids.project, parentId: null, name: "Cart" },
      { id: ids.empty, projectId: ids.project, parentId: null, name: "Empty" },
    ]);
    expect(folders[0]!.createdAt.toISOString()).toBe("2026-11-01T10:00:00.000Z");
  });

  it("keeps every Test File with its source, in the folder made from its Module", async () => {
    const testFiles = await db!.testFile.findMany({ orderBy: { name: "asc" } });

    expect(
      testFiles.map(({ id, projectId, folderId, name, source }) => ({ id, projectId, folderId, name, source })),
    ).toEqual([
      { id: ids.add, projectId: ids.project, folderId: ids.cart, name: "add.yaml", source: "name: add" },
      { id: ids.remove, projectId: ids.project, folderId: ids.cart, name: "remove.yaml", source: "name: remove" },
    ]);
  });

  it("keeps the Project's Variables", async () => {
    expect(await db!.variable.findMany()).toEqual([
      { id: ids.variable, projectId: ids.project, name: "BASE", value: "https://shop.example" },
    ]);
  });

  it("keeps every Run, with its file's path in the Project", async () => {
    const runs = await db!.run.findMany({ orderBy: { fileName: "asc" } });

    expect(
      runs.map(({ id, testFileId, projectId, fileName, path, status }) => ({
        id,
        testFileId,
        projectId,
        fileName,
        path,
        status,
      })),
    ).toEqual([
      {
        id: ids.run,
        testFileId: ids.add,
        projectId: ids.project,
        fileName: "add.yaml",
        path: "Cart/add.yaml",
        status: "passed",
      },
      {
        id: ids.orphanRun,
        testFileId: null,
        projectId: ids.project,
        fileName: "gone.yaml",
        path: "gone.yaml",
        status: "failed",
      },
    ]);
  });

  it("keeps names unique in each parent after the migration", async () => {
    await expect(db!.folder.create({ data: { projectId: ids.project, name: "Cart" } })).rejects.toThrow();
  });
});
