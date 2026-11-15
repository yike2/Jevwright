import type { ImportEntry, ImportFile } from "./import.js";

// Reading what the user dropped from the computer, through DataTransferItem.webkitGetAsEntry(), which Chrome, Edge,
// Firefox, and Safari support. Only the parts of the browser's FileSystemEntry used here are typed.

/** A dropped file or folder, as FileSystemEntry has it. */
export type DroppedEntry = { name: string; isFile: boolean; isDirectory: boolean };

/** A dropped file, as FileSystemFileEntry has it. */
export type DroppedFileEntry = DroppedEntry & {
  file(success: (file: ImportFile) => void, failure?: (error: unknown) => void): void;
};

/** A dropped folder, as FileSystemDirectoryEntry has it. */
export type DroppedDirectoryEntry = DroppedEntry & {
  createReader(): {
    readEntries(success: (entries: DroppedEntry[]) => void, failure?: (error: unknown) => void): void;
  };
};

/**
 * The import entries of a drop: each dropped file, and each dropped folder with everything inside it, by path from
 * the drop. Inside a dropped folder, node_modules and hidden folders such as .git are skipped, as the CLI does.
 */
export async function readDroppedEntries(roots: readonly DroppedEntry[]): Promise<ImportEntry[]> {
  const entries: ImportEntry[] = [];
  const read = async (entry: DroppedEntry, path: string, isRoot: boolean): Promise<void> => {
    if (entry.isFile) {
      entries.push({ kind: "file", path, file: await fileOf(entry as DroppedFileEntry) });
      return;
    }
    if (!entry.isDirectory || (!isRoot && isSkippedFolder(entry.name))) return;
    entries.push({ kind: "folder", path });
    for (const child of await childrenOf(entry as DroppedDirectoryEntry))
      await read(child, `${path}/${child.name}`, false);
  };
  for (const root of roots) await read(root, root.name, true);
  return entries;
}

const isSkippedFolder = (name: string) => name === "node_modules" || name.startsWith(".");

const fileOf = (entry: DroppedFileEntry) => new Promise<ImportFile>((resolve, reject) => entry.file(resolve, reject));

// readEntries answers a folder's entries in batches, so it is called until it answers none.
async function childrenOf(entry: DroppedDirectoryEntry): Promise<DroppedEntry[]> {
  const reader = entry.createReader();
  const children: DroppedEntry[] = [];
  for (;;) {
    const batch = await new Promise<DroppedEntry[]>((resolve, reject) => reader.readEntries(resolve, reject));
    if (batch.length === 0) return children;
    children.push(...batch);
  }
}
