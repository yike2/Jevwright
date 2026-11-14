import type { TreeResponse } from "./api.js";

export function overviewGroups(tree: TreeResponse): TreeResponse["items"] {
  return tree.items
    .map((project) => {
      const modules = project.modules
        .filter((module) => module.testFiles.length > 0)
        .map((module) => ({
          ...module,
          testFiles: [...module.testFiles],
        }));

      return {
        ...project,
        modules,
      };
    })
    .filter((project) => project.modules.length > 0);
}
