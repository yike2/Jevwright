import { errorText } from "./format-error.js";
import { testFileBaseName, uploadedTestFileName } from "./sidebar.js";
import { MAX_LEVEL, type Parent } from "./tree.js";
import { MAX_SOURCE_CHARS, nameProblem, SOURCE_TOO_LONG, sourceProblem, testFileNameProblem } from "./validation.js";

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
export const TOO_DEEP = "Folders can be at most 4 levels deep, counting the project.";

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
  const result: ImportResult = { imported: [], skipped: [] };
  // Each folder path of the drop, "" for the target itself: the folder it became, or null once it was skipped.
  const folders = new Map<string, Parent | null>([["", target]]);

  const skip = (path: string, reason: string): void => {
    result.skipped.push({ path, reason });
  };

  const folderFor = async (segments: string[]): Promise<Parent | null> => {
    const path = segments.join("/");
    const known = folders.get(path);
    if (known !== undefined) return known;
    const parent = await folderFor(segments.slice(0, -1));
    const name = segments.at(-1) ?? "";
    let folder: Parent | null = null;
    if (parent !== null) {
      // Only the first folder that fails is listed; what is inside it goes with it.
      const problem = target.level + segments.length > MAX_LEVEL ? TOO_DEEP : nameProblem(name);
      if (problem !== null) {
        skip(`${path}/`, problem);
      } else {
        folder = await placeFolder(parent, name, path);
      }
    }
    folders.set(path, folder);
    return folder;
  };

  const placeFolder = async (parent: Parent, name: string, path: string): Promise<Parent | null> => {
    const existing = deps.existingFolder(parent, name);
    if (existing !== undefined) return { projectId: parent.projectId, folderId: existing };
    try {
      return { projectId: parent.projectId, folderId: (await deps.createFolder(parent, name)).id };
    } catch (error) {
      skip(`${path}/`, errorText(error));
      return null;
    }
  };

  for (const entry of entries) {
    const segments = entry.path.split("/").filter((segment) => segment.length > 0);
    if (entry.kind === "folder") {
      await folderFor(segments);
      continue;
    }
    const parent = await folderFor(segments.slice(0, -1));
    if (parent === null) continue;
    await importFile(parent, entry.path, segments.at(-1) ?? "", entry.file);
  }
  return result;

  async function importFile(parent: Parent, path: string, fileName: string, file: ImportFile): Promise<void> {
    if (!/\.ya?ml$/i.test(fileName)) return skip(path, NOT_YAML);
    const name = uploadedTestFileName(fileName);
    const nameError = testFileNameProblem(testFileBaseName(name));
    if (nameError !== null) return skip(path, nameError);
    // UTF-8 takes at most 3 bytes per UTF-16 unit, so a file over 3 bytes per allowed unit is too long unread.
    if (file.size > 3 * MAX_SOURCE_CHARS) return skip(path, SOURCE_TOO_LONG);
    const source = await file.text();
    const sourceError = sourceProblem(source);
    if (sourceError !== null) return skip(path, sourceError);
    try {
      result.imported.push((await deps.createTestFile(parent, name, source)).testFile.id);
    } catch (error) {
      skip(path, errorText(error));
    }
  }
}

/** One sentence for the import's live region: how many Test Files came in and how many entries were skipped. */
export function importSummary(result: ImportResult): string {
  const count = result.imported.length;
  const imported = `Imported ${count === 0 ? "no test files" : count === 1 ? "1 test file" : `${count} test files`}.`;
  return result.skipped.length === 0 ? imported : `${imported} ${result.skipped.length} skipped:`;
}
