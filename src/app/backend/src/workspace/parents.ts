import type { Db } from "../db.js";
import { ApiError } from "../http/errors.js";
import { isUniqueViolation } from "../http/prisma-errors.js";
import { MAX_LEVEL, levelOf, type FolderRow } from "./folders.js";
import { ownedFolder, ownedProject } from "./owned.js";

// Where folders and Test Files sit, and the rules for putting one there (backend.md 1.3).

/** A parent: a Project's folder, or the Project itself when `folderId` is null. */
export type Parent = { projectId: string; folderId: string | null };

/** A move's body: a folder, which brings its Project; or a Project, directly in it when the folder is null. */
export type MoveTo = { projectId?: string; folderId?: string | null };

export const TOO_DEEP = "Folders can be at most 4 levels deep, counting the project.";

/** A 400 at `path` with a plain message, shaped like a schema failure so clients show it the same way. */
export const invalid = (path: string, message: string) => new ApiError("invalid_request", message, [{ path, message }]);

const taken = ({ folderId }: Parent) =>
  new ApiError(
    "conflict",
    `A folder or test file with this name already exists in this ${folderId === null ? "project" : "folder"}.`,
  );

/** The folders of a Project, for the level and path checks of folders.ts. */
export function projectFolders(db: Db, projectId: string): Promise<FolderRow[]> {
  return db.folder.findMany({ where: { projectId }, select: { id: true, parentId: true, name: true } });
}

/** The parent a create names: the user's Project, or one of its folders; a 404 otherwise. */
export async function parentIn(db: Db, userId: string, projectId: string, folderId: string | null): Promise<Parent> {
  await ownedProject(db, userId, projectId);
  if (folderId !== null) await ownedFolder(db, userId, folderId, projectId);
  return { projectId, folderId };
}

/** The new parent a move names, or undefined when the body moves nothing; a 404 for one the user does not own. */
export async function moveTarget(db: Db, userId: string, current: Parent, to: MoveTo): Promise<Parent | undefined> {
  if (typeof to.folderId === "string") {
    const folder = await ownedFolder(db, userId, to.folderId, to.projectId);
    return { projectId: folder.projectId, folderId: folder.id };
  }
  if (to.folderId === undefined && to.projectId === undefined) return undefined;
  const projectId = to.projectId ?? current.projectId;
  await ownedProject(db, userId, projectId);
  return { projectId, folderId: null };
}

/** The level of a parent: 1 for the Project, a folder's own level otherwise (folders.ts). */
export async function levelOfParent(db: Db, parent: Parent): Promise<number> {
  return parent.folderId === null ? 1 : levelOf(await projectFolders(db, parent.projectId), parent.folderId);
}

/** Refuses a new folder whose deepest level would be below MAX_LEVEL. */
export function checkDepth(parentLevel: number, height = 1): void {
  if (parentLevel + height > MAX_LEVEL) throw invalid("body.parentId", TOO_DEEP);
}

/** A 409 when a folder or Test File other than `except` already has the name in the parent. */
export async function checkNameFree(db: Db, parent: Parent, name: string, except?: string): Promise<void> {
  const other = except === undefined ? {} : { id: { not: except } };
  const [folder, testFile] = await Promise.all([
    db.folder.findFirst({ where: { projectId: parent.projectId, parentId: parent.folderId, name, ...other } }),
    db.testFile.findFirst({ where: { projectId: parent.projectId, folderId: parent.folderId, name, ...other } }),
  ]);
  if (folder || testFile) throw taken(parent);
}

/** Runs a write, answering a unique-name failure, as when two requests race for one name, like checkNameFree. */
export async function uniqueIn<T>(parent: Parent, write: Promise<T>): Promise<T> {
  try {
    return await write;
  } catch (error) {
    if (isUniqueViolation(error)) throw taken(parent);
    throw error;
  }
}
