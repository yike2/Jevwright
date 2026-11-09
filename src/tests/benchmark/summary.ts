import type { LocateMethod } from "@/core/executor/index.js";
import type { Report } from "@/core/report/index.js";
import type { Step, TestCase } from "@/core/syntax/index.js";

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
  if (!file.startsWith("assert/fails/")) return report.status === "passed";
  // A fails/ file is right only when Jev rejected its last step, not when an earlier step broke.
  const last = report.steps.at(-1);
  return last?.status === "failed" && last.index === testCase.steps.length - 1;
}

/** Sums up the runs of the suite into the metrics of benchmark.md 1.6. */
export function summarize(runs: readonly SuiteRun[]): Summary {
  const outcomes = new Map(runs.map((run) => [run, outcome(run)]));
  const rateOf = (some: readonly SuiteRun[]) => rate(some.map((run) => outcomes.get(run) ?? "wrong"));
  const inFolder = (folder: string) => runs.filter((run) => run.file.startsWith(`${folder}/`));

  const passRates = Object.fromEntries(LOCATING_FOLDERS.map((folder) => [folder, rateOf(inFolder(folder))])) as Record<
    LocatingFolder,
    Rate
  >;

  const groups: Summary["groups"] = [];
  for (const folder of ["selector", "target", "both"] as const) {
    const byGroup = new Map<string, SuiteRun[]>();
    for (const run of inFolder(folder)) {
      const group = FLOW_GROUPS[flowName(run.file)] ?? "Unknown";
      byGroup.set(group, [...(byGroup.get(group) ?? []), run]);
    }
    for (const [group, some] of byGroup) groups.push({ folder, group, ...rateOf(some) });
  }

  const tags: Summary["tags"] = {};
  for (const tag of new Set(runs.flatMap((run) => run.tags))) {
    tags[tag] = rateOf(runs.filter((run) => run.tags.includes(tag)));
  }

  const timed = runs.flatMap(jevSteps);
  const byKind = (kind: JevStepKind) => latency(timed.filter((step) => step.kind === kind).map((step) => step.ms));

  return {
    passRates,
    groups,
    judging: {
      holds: rateOf(inFolder("assert/holds")),
      fails: rateOf(inFolder("assert/fails")),
      all: rateOf(inFolder("assert")),
    },
    tags,
    latency: {
      all: latency(timed.map((step) => step.ms)),
      byKind: { visual: byKind("visual"), dom: byKind("dom"), judged: byKind("judged") },
      prdTargetMs: PRD_JEV_STEP_MS,
    },
    cases: runs.map((run) => ({ file: run.file, tags: run.tags, outcome: outcomes.get(run) ?? "wrong" })),
    failures: runs.flatMap((run) => failure(run, outcomes.get(run) ?? "wrong")),
  };
}

function outcome({ file, testCase, tries }: SuiteRun): Outcome {
  const [first, retry] = tries.map((report) => isRight(file, report, testCase));
  if (first) return "stable";
  return retry ? "flaky" : "wrong";
}

const flowName = (file: string) => file.slice(file.lastIndexOf("/") + 1).replace(/\.yaml$/, "");

function rate(outcomes: readonly Outcome[]): Rate {
  const passed = outcomes.filter((outcome) => outcome !== "wrong").length;
  const flaky = outcomes.filter((outcome) => outcome === "flaky").length;
  return { passed, flaky, total: outcomes.length, rate: outcomes.length === 0 ? 0 : passed / outcomes.length };
}

function latency(ms: readonly number[]): Latency {
  if (ms.length === 0) return { steps: 0, averageMs: 0, slowestMs: 0 };
  return { steps: ms.length, averageMs: ms.reduce((sum, n) => sum + n, 0) / ms.length, slowestMs: Math.max(...ms) };
}

function jevSteps({ testCase, tries }: SuiteRun): { kind: JevStepKind; ms: number }[] {
  return tries.flatMap((report) =>
    report.steps.flatMap((step) => {
      if (step.status === "pending") return [];
      const kind = jevKind(testCase.steps[step.index], step.locateMethod);
      return kind ? [{ kind, ms: step.durationMs }] : [];
    }),
  );
}

function jevKind(step: Step | undefined, locateMethod: LocateMethod | undefined): JevStepKind | undefined {
  if (locateMethod === "visual" || locateMethod === "dom") return locateMethod;
  if (step?.action === "assert" && !("check" in step)) return "judged";
  if (step?.action === "waitFor" && "condition" in step) return "judged";
  return undefined;
}

// Why the first try was not right: its failed step, its Run error, or a fails/ file that passed.
function failure({ file, tries }: SuiteRun, outcome: Outcome): Summary["failures"] {
  if (outcome === "stable") return [];
  const [first] = tries;
  const failed = first.steps.find((step) => step.status === "failed");
  if (failed?.status === "failed") {
    return [{ file, outcome, line: failed.line, action: failed.action, reason: failed.reason }];
  }
  if (first.error) return [{ file, outcome, reason: `${first.error.kind}: ${first.error.message}` }];
  if (first.status === "passed")
    return [{ file, outcome, reason: "Expected the last step to fail, but the file passed" }];
  return [{ file, outcome, reason: "Failed without a failed step" }];
}
