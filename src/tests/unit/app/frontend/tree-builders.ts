import type { TreeFolder, TreeProject, TreeTestFile } from "@/app/frontend/lib/tree.js";

// Small builders for GET /tree answers in the frontend's unit tests.

const TIME = "2026-11-13T00:00:00.000Z";

type Contents = { folders?: TreeFolder[]; testFiles?: TreeTestFile[] };

export function project(id: string, name: string, contents: Contents = {}): TreeProject {
  return { id, name, createdAt: TIME, updatedAt: TIME, folders: [], testFiles: [], ...contents };
}

/** A folder; its own and its files' projectId and parentId are set by `project`'s caller through `inProject`. */
export function folder(id: string, name: string, contents: Contents = {}): TreeFolder {
  return {
    id,
    projectId: "",
    parentId: null,
    name,
    createdAt: TIME,
    updatedAt: TIME,
    folders: [],
    testFiles: [],
    ...contents,
  };
}

export function file(id: string, name: string, latestRun: TreeTestFile["latestRun"] = null): TreeTestFile {
  return { id, projectId: "", folderId: null, name, createdAt: TIME, updatedAt: TIME, latestRun };
}

/** A Project whose folders and Test Files carry the right projectId, parentId, and folderId at every level. */
export function inProject(id: string, name: string, contents: Contents = {}): TreeProject {
  const place = <T extends Contents>(node: T, parentId: string | null): T => ({
    ...node,
    folders: (node.folders ?? []).map((child) => ({ ...place(child, child.id), projectId: id, parentId })),
    testFiles: (node.testFiles ?? []).map((testFile) => ({ ...testFile, projectId: id, folderId: parentId })),
  });
  return project(id, name, place(contents, null));
}
