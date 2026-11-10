import type { Db } from "../db.js";
import type { Module, Project, TestFile } from "../generated/prisma/client.js";
import { ApiError } from "../http/errors.js";

// Lookups scoped to the token's user: another user's row answers 404 like a missing one (backend.md 1.2).

/** The user's Project, or a 404. */
export async function ownedProject(db: Db, userId: string, id: string): Promise<Project> {
  const project = await db.project.findFirst({ where: { id, userId } });
  if (!project) throw new ApiError("not_found", "No such Project");
  return project;
}

/** The user's Module, or a 404. */
export async function ownedModule(db: Db, userId: string, id: string): Promise<Module> {
  const module = await db.module.findFirst({ where: { id, project: { userId } } });
  if (!module) throw new ApiError("not_found", "No such Module");
  return module;
}

/** The user's Test File, or a 404. */
export async function ownedTestFile(db: Db, userId: string, id: string): Promise<TestFile> {
  const testFile = await db.testFile.findFirst({ where: { id, module: { project: { userId } } } });
  if (!testFile) throw new ApiError("not_found", "No such Test File");
  return testFile;
}

// The API's shapes (api/schemas.ts) of the rows: no owner ids, and a source only where the route asks for it.

export const toProject = ({ id, name, createdAt, updatedAt }: Project) => ({ id, name, createdAt, updatedAt });

export const toModule = ({ id, projectId, name, createdAt, updatedAt }: Module) => ({
  id,
  projectId,
  name,
  createdAt,
  updatedAt,
});

export const toTestFile = ({ id, moduleId, name, createdAt, updatedAt }: Omit<TestFile, "source">) => ({
  id,
  moduleId,
  name,
  createdAt,
  updatedAt,
});
