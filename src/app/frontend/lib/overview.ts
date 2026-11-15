import type { TreeResponse } from "./api.js";
import type { TreeFolder, TreeTestFile } from "./tree.js";

/** The Test Files directly in one folder, or in the Project itself, with the folder's path in the Project. */
export type OverviewGroup = { id: string; path: string; testFiles: TreeTestFile[] };

/** A Project of the files overview with its groups. */
export type OverviewProject = { id: string; name: string; groups: OverviewGroup[] };

/**
 * The files overview's groups: per Project, its own Test Files (path "") and then each folder's, in tree order, with
 * paths like "auth/session"; only groups with Test Files, and only Projects with groups.
 */
export function overviewGroups(tree: TreeResponse): OverviewProject[] {
  return tree.items
    .map((project) => {
      const groups: OverviewGroup[] = [];
      const walk = (id: string, node: { folders: TreeFolder[]; testFiles: TreeTestFile[] }, path: string[]) => {
        if (node.testFiles.length > 0) groups.push({ id, path: path.join("/"), testFiles: [...node.testFiles] });
        for (const folder of node.folders) walk(folder.id, folder, [...path, folder.name]);
      };
      walk(project.id, project, []);
      return { id: project.id, name: project.name, groups };
    })
    .filter((project) => project.groups.length > 0);
}
