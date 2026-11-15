import type { components } from "./api-schema.js";
import type { Parent, TreeResponse } from "./api.js";

export type { Parent };

// The workspace tree of GET /tree: Projects, folders nested in them, and Test Files at any level (frontend.md 1.6).

export type TreeProject = TreeResponse["items"][number];
export type TreeFolder = components["schemas"]["TreeFolder"];
export type TreeTestFile = TreeProject["testFiles"][number];

/** A row of the tree that can be moved. */
export type Movable = { kind: "folder" | "testFile"; id: string };

/** A place a Movable can go, with its path from the Project down, e.g. "Shop / checkout". */
export type Destination = Parent & { label: string };

/** The deepest a folder can be, counting the Project as level 1 (backend.md 1.3). */
export const MAX_LEVEL = 4;

/** Every Test File in the tree, at any level, Project by Project, each level's files before its folders'. */
export function allTestFiles(tree: readonly TreeProject[]): TreeTestFile[] {
  void tree;
  return [];
}

/** Whether a Project (level 1) or folder at `level` can hold a new folder. */
export function canAddFolder(level: number): boolean {
  void level;
  return false;
}

/** The parent a folder or Test File sits in, or undefined when the tree has no such row. */
export function parentOf(tree: readonly TreeProject[], item: Movable): Parent | undefined {
  void tree;
  void item;
  return undefined;
}

/** The level of a parent: 1 for a Project, 2 for a folder directly in it, and so on. */
export function levelOf(tree: readonly TreeProject[], parent: Parent): number {
  void tree;
  void parent;
  return 0;
}

/** The id of the folder named `name` directly in `parent`, if there is one. */
export function childFolderId(tree: readonly TreeProject[], parent: Parent, name: string): string | undefined {
  void tree;
  void parent;
  void name;
  return undefined;
}

/**
 * The places "Move to…" offers an item: every Project and folder in tree order, without the item's own parent, and
 * for a folder without the folder itself and the folders inside it.
 */
export function moveDestinations(tree: readonly TreeProject[], item: Movable): Destination[] {
  void tree;
  void item;
  return [];
}
