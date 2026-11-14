import type { paths } from "./api-schema.js";

export type LatestRun =
  paths["/tree"]["get"]["responses"][200]["content"]["application/json"]["items"][number]["modules"][number]["testFiles"][number]["latestRun"];

export type RunDot = "none" | "active" | "passed" | "failed";

export function statusOf(_latestRun: LatestRun): RunDot {
  throw new Error("Not implemented");
}

export function toTestFileName(_input: string): string {
  throw new Error("Not implemented");
}

export function initials(_email: string): string {
  throw new Error("Not implemented");
}

export function starterSource(_name: string): string {
  throw new Error("Not implemented");
}
