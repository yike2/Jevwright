import type { Db } from "../db.js";
import type { Folder, Project, TestFile } from "../generated/prisma/client.js";
import { ApiError } from "../http/errors.js";

// Lookups scoped to the token's user: another user's row answers 404 like a missing one (backend.md 1.2).

/** The user's Project, or a 404. */
export async function ownedProject(db: Db, userId: string, id: string): Promise<Project> {
  const project = await db.project.findFirst({ where: { id, userId } });
  if (!project) throw new ApiError("not_found", "No such Project");
  return project;
}

/** The user's folder, or a 404; with `projectId`, only a folder of that Project. */
export async function ownedFolder(db: Db, userId: string, id: string, projectId?: string): Promise<Folder> {
  const folder = await db.folder.findFirst({ where: { id, project: { userId }, ...(projectId ? { projectId } : {}) } });
  if (!folder) throw new ApiError("not_found", "No such folder");
  return folder;
}

/** The user's Test File, or a 404. */
export async function ownedTestFile(db: Db, userId: string, id: string): Promise<TestFile> {
  const testFile = await db.testFile.findFirst({ where: { id, project: { userId } } });
  if (!testFile) throw new ApiError("not_found", "No such Test File");
  return testFile;
}

// The API's shapes (api/schemas.ts) of the rows: no owner ids, and a source only where the route asks for it.

export const toProject = ({ id, name, createdAt, updatedAt }: Project) => ({ id, name, createdAt, updatedAt });

export const toFolder = ({ id, projectId, parentId, name, createdAt, updatedAt }: Folder) => ({
  id,
  projectId,
  parentId,
  name,
  createdAt,
  updatedAt,
});

export const toTestFile = ({ id, projectId, folderId, name, createdAt, updatedAt }: Omit<TestFile, "source">) => ({
  id,
  projectId,
  folderId,
  name,
  createdAt,
  updatedAt,
});
