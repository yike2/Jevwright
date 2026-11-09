import type { Report } from "@/core/report/index.js";
import type { TestCase } from "@/core/syntax/index.js";

export const LOCATING_FOLDERS = ["selector", "target", "both", "atomic"] as const;
export type LocatingFolder = (typeof LOCATING_FOLDERS)[number];

export const FLOW_GROUPS: Record<string, string> = {
  "sign-in": "Shopping",
  "locked-out": "Shopping",
  "sort-products": "Shopping",
  "cart-add-remove": "Shopping",
  checkout: "Shopping",
  "checkout-errors": "Shopping",
  "product-detail": "Shopping",
  "menu-logout": "Shopping",
  "lazy-load": "Dynamic pages",
  spinner: "Dynamic pages",
  slider: "Dynamic pages",
  dialogs: "Extra pages",
  "new-tab": "Extra pages",
  "hover-menu": "Extra pages",
  "file-menu": "Extra pages",
  "problem-user-cart": "Other users",
  "visual-user-checkout": "Other users",
  "visual-user-menu-logout": "Other users",
};

export const PRD_JEV_STEP_MS = 3000;

/** One suite file's run: its path under `suite/`, its Tags, the TestCase it ran, and the Report of each try. */
export type SuiteRun = { file: string; tags: string[]; testCase: TestCase; tries: Report[] };

export type Outcome = "stable" | "flaky" | "wrong";
export type Rate = { passed: number; flaky: number; total: number; rate: number }; // passed counts flaky too
export type JevStepKind = "visual" | "dom" | "judged";
export type Latency = { steps: number; averageMs: number; slowestMs: number };

export type Summary = {
  passRates: Record<LocatingFolder, Rate>;
  groups: ({ folder: LocatingFolder; group: string } & Rate)[];
  judging: { holds: Rate; fails: Rate; all: Rate };
  tags: Record<string, Rate>;
  latency: { all: Latency; byKind: Record<JevStepKind, Latency>; prdTargetMs: number };
  cases: { file: string; tags: string[]; outcome: Outcome }[];
  failures: { file: string; outcome: Exclude<Outcome, "stable">; line?: number; action?: string; reason: string }[];
};

/** Whether one try of a suite file did what it should: passed, or for `assert/fails/`, failed at its last step. */
export function isRight(file: string, report: Report, testCase: TestCase): boolean {
  void file;
  void report;
  void testCase;
  return false;
}

/** Sums up the runs of the suite into the metrics of benchmark.md 1.6. */
export function summarize(runs: readonly SuiteRun[]): Summary {
  void runs;
  const none = { passed: 0, flaky: 0, total: 0, rate: 0 };
  const latency = { steps: 0, averageMs: 0, slowestMs: 0 };
  return {
    passRates: { selector: none, target: none, both: none, atomic: none },
    groups: [],
    judging: { holds: none, fails: none, all: none },
    tags: {},
    latency: { all: latency, byKind: { visual: latency, dom: latency, judged: latency }, prdTargetMs: 0 },
    cases: [],
    failures: [],
  };
}
