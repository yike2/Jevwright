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

export function statusTitle(_status: ReturnType<typeof statusOf>): string {
  throw new Error("Not implemented");
}

export function confirmDeleteText(_kind: DeleteTargetKind, _name: string): string {
  throw new Error("Not implemented");
}

export function deletesTestFile(
  _tree: paths["/tree"]["get"]["responses"][200]["content"]["application/json"],
  _target: DeleteTarget,
  _testFileId: string | null,
): boolean {
  throw new Error("Not implemented");
}
