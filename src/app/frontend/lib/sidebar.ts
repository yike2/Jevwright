import type { paths } from "./api-schema.js";

export type LatestRun =
  paths["/tree"]["get"]["responses"][200]["content"]["application/json"]["items"][number]["modules"][number]["testFiles"][number]["latestRun"];

export type RunDot = "none" | "active" | "passed" | "failed";
export type DeleteTargetKind = "project" | "module" | "testFile";
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

export function toTestFileName(input: string): string {
  const trimmed = input.trim();
  if (trimmed.length === 0) {
    return "";
  }

  if (trimmed.includes(".")) {
    return trimmed;
  }

  return `${trimmed}.yaml`;
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
    return `Delete project "${name}" and all its modules, test files and variables? Run history is kept.`;
  }

  if (kind === "module") {
    return `Delete module "${name}" and all its test files? Run history is kept.`;
  }

  return `Delete test file "${name}"? Run history is kept.`;
}

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

  if (target.kind === "module") {
    const moduleItem = tree.items.flatMap((project) => project.modules).find((module) => module.id === target.id);
    if (!moduleItem) {
      return false;
    }

    return moduleItem.testFiles.some((testFile) => testFile.id === testFileId);
  }

  const projectItem = tree.items.find((project) => project.id === target.id);
  if (!projectItem) {
    return false;
  }

  return projectItem.modules.some((module) => module.testFiles.some((testFile) => testFile.id === testFileId));
}
