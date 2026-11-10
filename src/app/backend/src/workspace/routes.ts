import { analyze } from "@/core/syntax/index.js";
import type { Handlers } from "../app.js";
import type { Db } from "../db.js";
import type { TestFile } from "../generated/prisma/client.js";
import { requireUserId } from "../http/auth.js";
import { ApiError } from "../http/errors.js";
import { isUniqueViolation } from "../http/prisma-errors.js";
import { ownedModule, ownedProject, ownedTestFile, toModule, toProject, toTestFile } from "./owned.js";

export type WorkspaceDeps = { db: Db };

// The validated inputs of the routes, as api/contract.ts parses them.
type Name = { name: string };
type ProjectParams = { projectId: string };
type VariableParams = { projectId: string; name: string };
type ModuleParams = { moduleId: string };
type TestFileParams = { testFileId: string };
type TestFileChange = { name?: string; moduleId?: string; source?: string };

/** Runs a write, answering a unique-name failure as 409. */
async function unique<T>(write: Promise<T>, what: string): Promise<T> {
  try {
    return await write;
  } catch (error) {
    if (isUniqueViolation(error)) throw new ApiError("conflict", `The ${what} is taken`);
    throw error;
  }
}

// A saved Test File answers its source's diagnostics, so the editor can mark them (backend.md 1.3).
const saved = (testFile: TestFile) => ({
  testFile: toTestFile(testFile),
  diagnostics: analyze(testFile.source).diagnostics,
});

/** Projects, Modules, Test Files, Project Variables, and the tree (backend.md 1.3). */
export function workspaceHandlers({ db }: WorkspaceDeps): Handlers {
  return {
    "get /tree": async (input, res) => {
      const projects = await db.project.findMany({
        where: { userId: requireUserId(input) },
        orderBy: { name: "asc" },
        include: {
          modules: {
            orderBy: { name: "asc" },
            include: {
              testFiles: {
                orderBy: { name: "asc" },
                omit: { source: true },
                include: {
                  runs: {
                    orderBy: { createdAt: "desc" },
                    take: 1,
                    select: { id: true, status: true, createdAt: true },
                  },
                },
              },
            },
          },
        },
      });
      res.json({
        items: projects.map((project) => ({
          ...toProject(project),
          modules: project.modules.map((module) => ({
            ...toModule(module),
            testFiles: module.testFiles.map((testFile) => ({
              ...toTestFile(testFile),
              latestRun: testFile.runs[0] ?? null,
            })),
          })),
        })),
      });
    },

    "get /projects": async (input, res) => {
      const projects = await db.project.findMany({ where: { userId: requireUserId(input) }, orderBy: { name: "asc" } });
      res.json({ items: projects.map(toProject) });
    },
    "post /projects": async (input, res) => {
      const { name } = input.body as Name;
      const project = await unique(db.project.create({ data: { userId: requireUserId(input), name } }), "name");
      res.status(201).json(toProject(project));
    },
    "patch /projects/:projectId": async (input, res) => {
      const { projectId } = input.params as ProjectParams;
      const { name } = input.body as Name;
      await ownedProject(db, requireUserId(input), projectId);
      const project = await unique(db.project.update({ where: { id: projectId }, data: { name } }), "name");
      res.json(toProject(project));
    },
    "delete /projects/:projectId": async (input, res) => {
      const { projectId } = input.params as ProjectParams;
      await ownedProject(db, requireUserId(input), projectId);
      // Modules, Test Files, and Variables cascade; Runs keep their rows with null ids (schema.prisma).
      await db.project.delete({ where: { id: projectId } });
      res.status(204).end();
    },

    "get /projects/:projectId/variables": async (input, res) => {
      const { projectId } = input.params as ProjectParams;
      await ownedProject(db, requireUserId(input), projectId);
      const variables = await db.variable.findMany({
        where: { projectId },
        orderBy: { name: "asc" },
        select: { name: true },
      });
      res.json({ items: variables.map((variable) => variable.name) });
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

    "get /projects/:projectId/modules": async (input, res) => {
      const { projectId } = input.params as ProjectParams;
      await ownedProject(db, requireUserId(input), projectId);
      const modules = await db.module.findMany({ where: { projectId }, orderBy: { name: "asc" } });
      res.json({ items: modules.map(toModule) });
    },
    "post /projects/:projectId/modules": async (input, res) => {
      const { projectId } = input.params as ProjectParams;
      const { name } = input.body as Name;
      await ownedProject(db, requireUserId(input), projectId);
      const module = await unique(db.module.create({ data: { projectId, name } }), "name");
      res.status(201).json(toModule(module));
    },
    "patch /modules/:moduleId": async (input, res) => {
      const { moduleId } = input.params as ModuleParams;
      const { name } = input.body as Name;
      await ownedModule(db, requireUserId(input), moduleId);
      const module = await unique(db.module.update({ where: { id: moduleId }, data: { name } }), "name");
      res.json(toModule(module));
    },
    "delete /modules/:moduleId": async (input, res) => {
      const { moduleId } = input.params as ModuleParams;
      await ownedModule(db, requireUserId(input), moduleId);
      await db.module.delete({ where: { id: moduleId } });
      res.status(204).end();
    },

    "get /modules/:moduleId/test-files": async (input, res) => {
      const { moduleId } = input.params as ModuleParams;
      await ownedModule(db, requireUserId(input), moduleId);
      const testFiles = await db.testFile.findMany({
        where: { moduleId },
        orderBy: { name: "asc" },
        omit: { source: true },
      });
      res.json({ items: testFiles.map(toTestFile) });
    },
    "post /modules/:moduleId/test-files": async (input, res) => {
      const { moduleId } = input.params as ModuleParams;
      const { name, source } = input.body as { name: string; source: string };
      await ownedModule(db, requireUserId(input), moduleId);
      const testFile = await unique(db.testFile.create({ data: { moduleId, name, source } }), "name");
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
      const change = input.body as TestFileChange;
      const userId = requireUserId(input);
      await ownedTestFile(db, userId, testFileId);
      if (change.moduleId !== undefined) await ownedModule(db, userId, change.moduleId);
      const testFile = await unique(db.testFile.update({ where: { id: testFileId }, data: change }), "name");
      res.json(saved(testFile));
    },
    "delete /test-files/:testFileId": async (input, res) => {
      const { testFileId } = input.params as TestFileParams;
      await ownedTestFile(db, requireUserId(input), testFileId);
      await db.testFile.delete({ where: { id: testFileId } });
      res.status(204).end();
    },
  };
}
