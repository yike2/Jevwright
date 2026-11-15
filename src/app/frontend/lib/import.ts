import type { Parent } from "./tree.js";

// Importing .yaml files and folders dropped from the computer or picked with "Upload files…" (frontend.md 1.6).

/** A dropped or picked file: what the import reads of the browser's File. */
export type ImportFile = { size: number; text(): Promise<string> };

/** A folder or file to import, by its path below the Project or folder it is dropped on, e.g. "checkout/pay.yaml". */
export type ImportEntry = { kind: "folder"; path: string } | { kind: "file"; path: string; file: ImportFile };

/** What could not be imported, by its path ("checkout/" for a folder), and why. */
export type Skipped = { path: string; reason: string };

export type ImportResult = { imported: string[]; skipped: Skipped[] };

/** The requests and tree lookups an import makes; the sidebar passes the API client and the tree. */
export type ImportDeps = {
  createFolder(parent: Parent, name: string): Promise<{ id: string }>;
  createTestFile(parent: Parent, name: string, source: string): Promise<{ testFile: { id: string } }>;
  existingFolder(parent: Parent, name: string): string | undefined;
};

export const NOT_YAML = "Only .yaml and .yml files can be imported.";

/**
 * Imports the entries into `target`, at `level` (1 for a Project): folders are created or reused by name, and each
 * file becomes a Test File named like an upload, saved with its diagnostics. Nothing is overwritten: an entry that
 * breaks a rule is skipped with the reason, and so is everything inside a folder that is skipped.
 */
export async function importEntries(
  target: Parent & { level: number },
  entries: readonly ImportEntry[],
  deps: ImportDeps,
): Promise<ImportResult> {
  void target;
  void entries;
  void deps;
  return { imported: [], skipped: [] };
}

/** One sentence for the import's live region: how many Test Files came in and how many entries were skipped. */
export function importSummary(result: ImportResult): string {
  void result;
  return "";
}
