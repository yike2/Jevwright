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

type Contents = { folders: TreeFolder[]; testFiles: TreeTestFile[] };

/** Every folder in the tree with its Project, its parent, its level, and its path from the Project down. */
type FolderPlace = { folder: TreeFolder; parent: Parent; level: number; path: string[] };

function folderPlaces(tree: readonly TreeProject[]): FolderPlace[] {
  const places: FolderPlace[] = [];
  const walk = (projectId: string, node: Contents, parentId: string | null, level: number, path: string[]) => {
    for (const folder of node.folders) {
      const folderPath = [...path, folder.name];
      places.push({ folder, parent: { projectId, folderId: parentId }, level: level + 1, path: folderPath });
      walk(projectId, folder, folder.id, level + 1, folderPath);
    }
  };
  for (const project of tree) walk(project.id, project, null, 1, [project.name]);
  return places;
}

function testFilesIn(node: Contents): TreeTestFile[] {
  return [...node.testFiles, ...node.folders.flatMap(testFilesIn)];
}

/** Every Test File in the tree, at any level, Project by Project, each level's files before its folders'. */
export function allTestFiles(tree: readonly TreeProject[]): TreeTestFile[] {
  return tree.flatMap(testFilesIn);
}

/** Whether a Project (level 1) or folder at `level` can hold a new folder. */
export function canAddFolder(level: number): boolean {
  return level < MAX_LEVEL;
}

/** The parent a folder or Test File sits in, or undefined when the tree has no such row. */
export function parentOf(tree: readonly TreeProject[], item: Movable): Parent | undefined {
  if (item.kind === "folder") return folderPlaces(tree).find((place) => place.folder.id === item.id)?.parent;
  const testFile = allTestFiles(tree).find((candidate) => candidate.id === item.id);
  return testFile ? { projectId: testFile.projectId, folderId: testFile.folderId } : undefined;
}

/** The level of a parent: 1 for a Project, 2 for a folder directly in it, and so on. */
export function levelOf(tree: readonly TreeProject[], parent: Parent): number {
  if (parent.folderId === null) return 1;
  return folderPlaces(tree).find((place) => place.folder.id === parent.folderId)?.level ?? 1;
}

/** The id of the folder named `name` directly in `parent`, if there is one. */
export function childFolderId(tree: readonly TreeProject[], parent: Parent, name: string): string | undefined {
  return folderPlaces(tree).find(
    (place) =>
      place.parent.projectId === parent.projectId &&
      place.parent.folderId === parent.folderId &&
      place.folder.name === name,
  )?.folder.id;
}

const isInside = (place: FolderPlace, folderId: string, places: FolderPlace[]): boolean => {
  for (let current: FolderPlace | undefined = place; current;) {
    if (current.folder.id === folderId) return true;
    const parentId: string | null = current.parent.folderId;
    current = parentId === null ? undefined : places.find((candidate) => candidate.folder.id === parentId);
  }
  return false;
};

/**
 * The places "Move to…" offers an item: every Project and folder in tree order, without the item's own parent, and
 * for a folder without the folder itself and the folders inside it.
 */
export function moveDestinations(tree: readonly TreeProject[], item: Movable): Destination[] {
  const current = parentOf(tree, item);
  const places = folderPlaces(tree);
  const destinations: Destination[] = tree.flatMap((project) => [
    { projectId: project.id, folderId: null, label: project.name },
    ...places
      .filter((place) => place.parent.projectId === project.id)
      .filter((place) => item.kind !== "folder" || !isInside(place, item.id, places))
      .map((place) => ({ projectId: project.id, folderId: place.folder.id, label: place.path.join(" / ") })),
  ]);
  return destinations.filter(
    (destination) => destination.projectId !== current?.projectId || destination.folderId !== current.folderId,
  );
}
