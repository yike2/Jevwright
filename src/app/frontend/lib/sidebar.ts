import type { paths } from "./api-schema.js";

/** The Quick Start project's name, as the backend creates it (backend.md 1.10). */
export const QUICK_START = "Quick Start";

export type LatestRun =
  paths["/tree"]["get"]["responses"][200]["content"]["application/json"]["items"][number]["testFiles"][number]["latestRun"];

export type RunDot = "none" | "active" | "passed" | "failed";
export type DeleteTargetKind = "project" | "folder" | "testFile";
export type DeleteTarget = {
  kind: DeleteTargetKind;
  id: string;
};

export function statusOf(latestRun: LatestRun): RunDot {
  if (latestRun === null) {
    return "none";
  }

  if (latestRun.status === "queued" || latestRun.status === "running") {
    return "active";
  }

  if (latestRun.status === "passed") {
    return "passed";
  }

  return "failed";
}

/** The Test File name for what was typed before the fixed `.yaml`; a pasted `x.yaml` does not get a second one. */
export function toTestFileName(input: string): string {
  const baseName = testFileBaseName(input.trim());
  return baseName.length === 0 ? "" : `${baseName}.yaml`;
}

/** The name a Test File's Rename input shows, before the fixed `.yaml`. */
export function testFileBaseName(name: string): string {
  return name.endsWith(".yaml") ? name.slice(0, -".yaml".length) : name;
}

/** The Test File name for an uploaded file: its name with `.yaml` in place of a `.yaml` or `.yml` extension. */
export function uploadedTestFileName(fileName: string): string {
  return toTestFileName(fileName.replace(/\.ya?ml$/i, ""));
}

export function initials(email: string): string {
  const local = email.split("@")[0] ?? "";
  return local.slice(0, 2).toUpperCase();
}

export function starterSource(name: string): string {
  const baseName = name.endsWith(".yaml") ? name.slice(0, -5) : name;

  return `name: ${JSON.stringify(baseName)}\nsteps:\n  - open:\n      url: "https://example.com"\n`;
}

export function statusTitle(status: ReturnType<typeof statusOf>): string {
  if (status === "none") {
    return "Never run";
  }

  if (status === "active") {
    return "Running";
  }

  if (status === "passed") {
    return "Passed";
  }

  return "Failed";
}

export function confirmDeleteText(kind: DeleteTargetKind, name: string): string {
  if (kind === "project") {
    return `Delete project "${name}" and all its folders, test files and variables? Run history is kept.`;
  }

  if (kind === "folder") {
    return `Delete folder "${name}" and every folder and test file in it? Run history is kept.`;
  }

  return `Delete test file "${name}"? Run history is kept.`;
}

type Contents = { id: string; folders: Contents[]; testFiles: { id: string }[] };

// The Project or folder with `id`, searched at any depth.
function findNode(nodes: readonly Contents[], id: string): Contents | undefined {
  for (const node of nodes) {
    const found = node.id === id ? node : findNode(node.folders, id);
    if (found) return found;
  }
  return undefined;
}

const holds = (node: Contents, testFileId: string): boolean =>
  node.testFiles.some((testFile) => testFile.id === testFileId) ||
  node.folders.some((folder) => holds(folder, testFileId));

export function deletesTestFile(
  tree: paths["/tree"]["get"]["responses"][200]["content"]["application/json"],
  target: DeleteTarget,
  testFileId: string | null,
): boolean {
  if (testFileId === null) {
    return false;
  }

  if (target.kind === "testFile") {
    return target.id === testFileId;
  }

  const node =
    target.kind === "project"
      ? tree.items.find((project) => project.id === target.id)
      : findNode(tree.items, target.id);
  return node !== undefined && holds(node, testFileId);
}

/** Whether the workspace has a Project named Quick Start, so "Add the Quick Start project" is not offered. */
export function hasQuickStart(tree: readonly { name: string }[]): boolean {
  return tree.some((project) => project.name === QUICK_START);
}
