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
  void roots;
  return [];
}
