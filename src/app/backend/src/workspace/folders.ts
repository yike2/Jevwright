// The folder tree of one Project, from its folders' rows (backend.md 1.3). The Project is level 1, a folder directly
// in it level 2, and a folder can be at most level MAX_LEVEL.

export const MAX_LEVEL = 4;

/** The fields of a folder row the tree needs. */
export type FolderRow = { id: string; parentId: string | null; name: string };

/** The level of a folder: 2 directly in its Project, one more for each folder above it. */
export function levelOf(folders: readonly FolderRow[], folderId: string): number {
  void folders;
  void folderId;
  return 0;
}

/** How many levels a folder spans with its subfolders: 1 for a folder without subfolders. */
export function heightOf(folders: readonly FolderRow[], folderId: string): number {
  void folders;
  void folderId;
  return 0;
}

/** Whether `folderId` is `ancestorId` itself or a folder somewhere inside it. */
export function isWithin(folders: readonly FolderRow[], folderId: string, ancestorId: string): boolean {
  void folders;
  void folderId;
  void ancestorId;
  return false;
}

/** The ids of a folder and of every folder inside it. */
export function subtreeIds(folders: readonly FolderRow[], folderId: string): string[] {
  void folders;
  void folderId;
  return [];
}

/** A Test File's path in its Project, e.g. `checkout/wrong-total.yaml`; `folderId` null is the Project itself. */
export function pathOf(folders: readonly FolderRow[], folderId: string | null, fileName: string): string {
  void folders;
  void folderId;
  return fileName;
}

/** A folder with its subfolders and Test Files, each list in the order given. */
export type Nested<F, T> = F & { folders: Nested<F, T>[]; testFiles: T[] };

/** Nests a Project's folders and Test Files: the answer is what sits directly in the Project. */
export function nest<F extends FolderRow, T extends { folderId: string | null }>(
  folders: readonly F[],
  testFiles: readonly T[],
): { folders: Nested<F, T>[]; testFiles: T[] } {
  void folders;
  void testFiles;
  return { folders: [], testFiles: [] };
}
