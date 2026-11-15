// The folder tree of one Project, from its folders' rows (backend.md 1.3). The Project is level 1, a folder directly
// in it level 2, and a folder can be at most level MAX_LEVEL.

export const MAX_LEVEL = 4;

/** The fields of a folder row the tree needs. */
export type FolderRow = { id: string; parentId: string | null; name: string };

const byId = (folders: readonly FolderRow[]) => new Map(folders.map((folder) => [folder.id, folder]));

// The folder and the folders above it, from the folder up to the one directly in the Project.
function chainOf(folders: readonly FolderRow[], folderId: string): FolderRow[] {
  const index = byId(folders);
  const chain: FolderRow[] = [];
  for (let folder = index.get(folderId); folder; folder = folder.parentId ? index.get(folder.parentId) : undefined)
    chain.push(folder);
  return chain;
}

/** The level of a folder: 2 directly in its Project, one more for each folder above it. */
export function levelOf(folders: readonly FolderRow[], folderId: string): number {
  return 1 + chainOf(folders, folderId).length;
}

/** How many levels a folder spans with its subfolders: 1 for a folder without subfolders. */
export function heightOf(folders: readonly FolderRow[], folderId: string): number {
  const children = folders.filter((folder) => folder.parentId === folderId);
  return 1 + Math.max(0, ...children.map((child) => heightOf(folders, child.id)));
}

/** Whether `folderId` is `ancestorId` itself or a folder somewhere inside it. */
export function isWithin(folders: readonly FolderRow[], folderId: string, ancestorId: string): boolean {
  return chainOf(folders, folderId).some((folder) => folder.id === ancestorId);
}

/** The ids of a folder and of every folder inside it. */
export function subtreeIds(folders: readonly FolderRow[], folderId: string): string[] {
  return folders.filter((folder) => isWithin(folders, folder.id, folderId)).map((folder) => folder.id);
}

/** A Test File's path in its Project, e.g. `checkout/wrong-total.yaml`; `folderId` null is the Project itself. */
export function pathOf(folders: readonly FolderRow[], folderId: string | null, fileName: string): string {
  const names = folderId === null ? [] : chainOf(folders, folderId).map((folder) => folder.name);
  return [...names.reverse(), fileName].join("/");
}

/** A folder with its subfolders and Test Files, each list in the order given. */
export type Nested<F, T> = F & { folders: Nested<F, T>[]; testFiles: T[] };

/** Nests a Project's folders and Test Files: the answer is what sits directly in the Project. */
export function nest<F extends FolderRow, T extends { folderId: string | null }>(
  folders: readonly F[],
  testFiles: readonly T[],
): { folders: Nested<F, T>[]; testFiles: T[] } {
  const contents = (parentId: string | null) => ({
    folders: folders
      .filter((folder) => folder.parentId === parentId)
      .map((folder): Nested<F, T> => ({ ...folder, ...contents(folder.id) })),
    testFiles: testFiles.filter((testFile) => testFile.folderId === parentId),
  });
  return contents(null);
}
