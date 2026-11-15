import { analyze } from "@/core/syntax/index.js";
import type { Handlers } from "../app.js";
import type { Db } from "../db.js";
import type { TestFile } from "../generated/prisma/client.js";
import { requireUserId } from "../http/auth.js";
import { ApiError } from "../http/errors.js";
import { isUniqueViolation } from "../http/prisma-errors.js";
import { heightOf, isWithin, nest, subtreeIds } from "./folders.js";
import { ownedFolder, ownedProject, ownedTestFile, toFolder, toProject, toTestFile } from "./owned.js";
import {
  checkDepth,
  checkNameFree,
  invalid,
  levelOfParent,
  moveTarget,
  parentIn,
  projectFolders,
  uniqueIn,
  type MoveTo,
  type Parent,
} from "./parents.js";
import { quickStartProject } from "./quick-start.js";

export type WorkspaceDeps = { db: Db; demoAppUrl: string };

// The validated inputs of the routes, as api/contract.ts parses them.
type Name = { name: string };
type ProjectParams = { projectId: string };
type VariableParams = { projectId: string; name: string };
type FolderParams = { folderId: string };
type TestFileParams = { testFileId: string };
type FolderChange = { name?: string; projectId?: string; parentId?: string | null };
type TestFileChange = { name?: string; source?: string } & MoveTo;

const TAKEN = {
  project: "A project with this name already exists.",
  quickStart: "You already have a project named Quick Start. Rename or delete it, then add it again.",
} as const;

const INTO_ITSELF = "A folder cannot be moved into itself or into one of its own folders.";

/** Runs a write, answering a unique-name failure as 409 with what is taken where. */
async function unique<T>(write: Promise<T>, what: keyof typeof TAKEN): Promise<T> {
  try {
    return await write;
  } catch (error) {
    if (isUniqueViolation(error)) throw new ApiError("conflict", TAKEN[what]);
    throw error;
  }
}

// A saved Test File answers its source and the source's diagnostics, so the editor shows and marks what was
// saved without reading it again (backend.md 1.3).
const saved = (testFile: TestFile) => ({
  testFile: { ...toTestFile(testFile), source: testFile.source },
  diagnostics: analyze(testFile.source).diagnostics,
});

/** Projects, folders, Test Files, Project Variables, and the tree (backend.md 1.3). */
export function workspaceHandlers({ db, demoAppUrl }: WorkspaceDeps): Handlers {
  return {
    "get /tree": async (input, res) => {
      const projects = await db.project.findMany({
        where: { userId: requireUserId(input) },
        orderBy: { name: "asc" },
        include: {
          folders: { orderBy: { name: "asc" } },
          testFiles: {
            orderBy: { name: "asc" },
            omit: { source: true },
            include: {
              runs: { orderBy: { createdAt: "desc" }, take: 1, select: { id: true, status: true, createdAt: true } },
            },
          },
        },
      });
      res.json({
        items: projects.map((project) => ({
          ...toProject(project),
          ...nest(
            project.folders.map(toFolder),
            project.testFiles.map((testFile) => ({ ...toTestFile(testFile), latestRun: testFile.runs[0] ?? null })),
          ),
        })),
      });
    },

    "get /projects": async (input, res) => {
      const projects = await db.project.findMany({ where: { userId: requireUserId(input) }, orderBy: { name: "asc" } });
      res.json({ items: projects.map(toProject) });
    },
    "post /projects": async (input, res) => {
      const { name } = input.body as Name;
      const project = await unique(db.project.create({ data: { userId: requireUserId(input), name } }), "project");
      res.status(201).json(toProject(project));
    },
    "post /projects/quick-start": async (input, res) => {
      const data = { userId: requireUserId(input), ...quickStartProject(demoAppUrl) };
      // One nested create, so a taken name leaves nothing half added.
      const project = await unique(db.project.create({ data }), "quickStart");
      res.status(201).json(toProject(project));
    },
    "patch /projects/:projectId": async (input, res) => {
      const { projectId } = input.params as ProjectParams;
      const { name } = input.body as Name;
      await ownedProject(db, requireUserId(input), projectId);
      const project = await unique(db.project.update({ where: { id: projectId }, data: { name } }), "project");
      res.json(toProject(project));
    },
    "delete /projects/:projectId": async (input, res) => {
      const { projectId } = input.params as ProjectParams;
      await ownedProject(db, requireUserId(input), projectId);
      // Folders, Test Files, and Variables cascade; Runs keep their rows with null ids (schema.prisma).
      await db.project.delete({ where: { id: projectId } });
      res.status(204).end();
    },

    "get /projects/:projectId/variables": async (input, res) => {
      const { projectId } = input.params as ProjectParams;
      await ownedProject(db, requireUserId(input), projectId);
      const variables = await db.variable.findMany({
        where: { projectId },
        orderBy: { name: "asc" },
        select: { name: true, value: true },
      });
      res.json({ items: variables });
    },
    "put /projects/:projectId/variables/:name": async (input, res) => {
      const { projectId, name } = input.params as VariableParams;
      const { value } = input.body as { value: string };
      await ownedProject(db, requireUserId(input), projectId);
      await db.variable.upsert({
        where: { projectId_name: { projectId, name } },
        create: { projectId, name, value },
        update: { value },
      });
      res.status(204).end();
    },
    "delete /projects/:projectId/variables/:name": async (input, res) => {
      const { projectId, name } = input.params as VariableParams;
      await ownedProject(db, requireUserId(input), projectId);
      const { count } = await db.variable.deleteMany({ where: { projectId, name } });
      if (count === 0) throw new ApiError("not_found", "No such Variable");
      res.status(204).end();
    },

    "get /projects/:projectId/folders": async (input, res) => {
      const { projectId } = input.params as ProjectParams;
      await ownedProject(db, requireUserId(input), projectId);
      const folders = await db.folder.findMany({ where: { projectId }, orderBy: { name: "asc" } });
      res.json({ items: folders.map(toFolder) });
    },
    "post /projects/:projectId/folders": async (input, res) => {
      const { projectId } = input.params as ProjectParams;
      const { name, parentId = null } = input.body as Name & { parentId?: string | null };
      const parent = await parentIn(db, requireUserId(input), projectId, parentId);
      checkDepth(await levelOfParent(db, parent));
      await checkNameFree(db, parent, name);
      const folder = await uniqueIn(parent, db.folder.create({ data: { projectId, parentId, name } }));
      res.status(201).json(toFolder(folder));
    },
    "patch /folders/:folderId": async (input, res) => {
      const { folderId } = input.params as FolderParams;
      const { name, projectId, parentId } = input.body as FolderChange;
      const userId = requireUserId(input);
      const folder = await ownedFolder(db, userId, folderId);
      const current: Parent = { projectId: folder.projectId, folderId: folder.parentId };
      const target = (await moveTarget(db, userId, current, { projectId, folderId: parentId })) ?? current;
      const moved = target.projectId !== current.projectId || target.folderId !== current.folderId;
      // Moving a folder takes everything inside it along, so the deepest folder inside must stay within the levels.
      const folders = await projectFolders(db, folder.projectId);
      if (moved) {
        if (target.folderId !== null && isWithin(folders, target.folderId, folder.id))
          throw invalid("body.parentId", INTO_ITSELF);
        checkDepth(await levelOfParent(db, target), heightOf(folders, folder.id));
      }
      const newName = name ?? folder.name;
      await checkNameFree(db, target, newName, folder.id);
      const inside = subtreeIds(folders, folder.id);
      const [, updated] = await uniqueIn(
        target,
        db.$transaction([
          // To another Project, the folders and Test Files inside it go along.
          db.folder.updateMany({ where: { id: { in: inside } }, data: { projectId: target.projectId } }),
          db.folder.update({
            where: { id: folderId },
            data: { name: newName, projectId: target.projectId, parentId: target.folderId },
          }),
          db.testFile.updateMany({ where: { folderId: { in: inside } }, data: { projectId: target.projectId } }),
        ]),
      );
      res.json(toFolder(updated));
    },
    "delete /folders/:folderId": async (input, res) => {
      const { folderId } = input.params as FolderParams;
      await ownedFolder(db, requireUserId(input), folderId);
      // The folders and Test Files inside cascade; Runs keep their rows with a null testFileId (schema.prisma).
      await db.folder.delete({ where: { id: folderId } });
      res.status(204).end();
    },

    "get /projects/:projectId/test-files": async (input, res) => {
      const { projectId } = input.params as ProjectParams;
      await ownedProject(db, requireUserId(input), projectId);
      const testFiles = await db.testFile.findMany({
        where: { projectId },
        orderBy: { name: "asc" },
        omit: { source: true },
      });
      res.json({ items: testFiles.map(toTestFile) });
    },
    "post /projects/:projectId/test-files": async (input, res) => {
      const { projectId } = input.params as ProjectParams;
      const {
        name,
        source,
        folderId = null,
      } = input.body as { name: string; source: string; folderId?: string | null };
      const parent = await parentIn(db, requireUserId(input), projectId, folderId);
      await checkNameFree(db, parent, name);
      const testFile = await uniqueIn(parent, db.testFile.create({ data: { projectId, folderId, name, source } }));
      res.status(201).json(saved(testFile));
    },
    "post /test-files/validate": async (input, res) => {
      const { source } = input.body as { source: string };
      res.json({ diagnostics: analyze(source).diagnostics });
    },
    "get /test-files/:testFileId": async (input, res) => {
      const { testFileId } = input.params as TestFileParams;
      const testFile = await ownedTestFile(db, requireUserId(input), testFileId);
      res.json({ ...toTestFile(testFile), source: testFile.source });
    },
    "patch /test-files/:testFileId": async (input, res) => {
      const { testFileId } = input.params as TestFileParams;
      const { name, source, ...to } = input.body as TestFileChange;
      const userId = requireUserId(input);
      const testFile = await ownedTestFile(db, userId, testFileId);
      const current: Parent = { projectId: testFile.projectId, folderId: testFile.folderId };
      const target = (await moveTarget(db, userId, current, to)) ?? current;
      const newName = name ?? testFile.name;
      await checkNameFree(db, target, newName, testFile.id);
      // A moved Test File keeps its id, so its Runs stay its own; in another Project it reads that Project's Variables.
      const updated = await uniqueIn(
        target,
        db.testFile.update({
          where: { id: testFileId },
          data: { name: newName, source, projectId: target.projectId, folderId: target.folderId },
        }),
      );
      res.json(saved(updated));
    },
    "delete /test-files/:testFileId": async (input, res) => {
      const { testFileId } = input.params as TestFileParams;
      await ownedTestFile(db, requireUserId(input), testFileId);
      await db.testFile.delete({ where: { id: testFileId } });
      res.status(204).end();
    },
  };
}
