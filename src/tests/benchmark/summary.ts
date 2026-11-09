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

/** One suite file's run: its path under `suite/`, its Report, and the TestCase it ran. */
export type SuiteRun = { file: string; report: Report; testCase: TestCase };

export type Rate = { passed: number; total: number; rate: number };
export type JevStepKind = "visual" | "dom" | "judged";
export type Latency = { steps: number; averageMs: number; slowestMs: number };

export type Summary = {
  passRates: Record<LocatingFolder, Rate>;
  groups: { folder: LocatingFolder; group: string; passed: number; total: number; rate: number }[];
  judging: { holds: Rate; fails: Rate; all: Rate };
  latency: { all: Latency; byKind: Record<JevStepKind, Latency>; prdTargetMs: number };
  failures: { file: string; line?: number; action?: string; reason: string }[];
};

/** Sums up the runs of the suite into the metrics of benchmark.md 1.6. */
export function summarize(runs: readonly SuiteRun[]): Summary {
  const inFolder = (folder: string) => runs.filter((run) => run.file.startsWith(`${folder}/`));
  const passRates = Object.fromEntries(
    LOCATING_FOLDERS.map((folder) => [folder, rate(inFolder(folder).map(passedRun))]),
  ) as Record<LocatingFolder, Rate>;

  const groups: Summary["groups"] = [];
  for (const folder of ["selector", "target", "both"] as const) {
    const byGroup = new Map<string, boolean[]>();
    for (const run of inFolder(folder)) {
      const group = FLOW_GROUPS[flowName(run.file)] ?? "Unknown";
      byGroup.set(group, [...(byGroup.get(group) ?? []), passedRun(run)]);
    }
    for (const [group, outcomes] of byGroup) groups.push({ folder, group, ...rate(outcomes) });
  }

  const holds = inFolder("assert/holds").map(passedRun);
  const fails = inFolder("assert/fails").map(failedAtLastStep);

  const timed = runs.flatMap(jevSteps);
  const byKind = (kind: JevStepKind) => latency(timed.filter((step) => step.kind === kind).map((step) => step.ms));

  return {
    passRates,
    groups,
    judging: { holds: rate(holds), fails: rate(fails), all: rate([...holds, ...fails]) },
    latency: {
      all: latency(timed.map((step) => step.ms)),
      byKind: { visual: byKind("visual"), dom: byKind("dom"), judged: byKind("judged") },
      prdTargetMs: PRD_JEV_STEP_MS,
    },
    failures: runs.flatMap(failure),
  };
}

const passedRun = (run: SuiteRun) => run.report.status === "passed";

// A fails/ file is judged right only when Jev rejected its last step, not when an earlier step broke.
function failedAtLastStep(run: SuiteRun): boolean {
  const last = run.report.steps.at(-1);
  return last?.status === "failed" && last.index === run.testCase.steps.length - 1;
}

const flowName = (file: string) => file.slice(file.lastIndexOf("/") + 1).replace(/\.yaml$/, "");

function rate(outcomes: readonly boolean[]): Rate {
  const passed = outcomes.filter(Boolean).length;
  return { passed, total: outcomes.length, rate: outcomes.length === 0 ? 0 : passed / outcomes.length };
}

function latency(ms: readonly number[]): Latency {
  if (ms.length === 0) return { steps: 0, averageMs: 0, slowestMs: 0 };
  return { steps: ms.length, averageMs: ms.reduce((sum, n) => sum + n, 0) / ms.length, slowestMs: Math.max(...ms) };
}

function jevSteps(run: SuiteRun): { kind: JevStepKind; ms: number }[] {
  return run.report.steps.flatMap((step) => {
    if (step.status === "pending") return [];
    const kind = jevKind(run.testCase.steps[step.index], step.locateMethod);
    return kind ? [{ kind, ms: step.durationMs }] : [];
  });
}

function jevKind(step: Step | undefined, locateMethod: LocateMethod | undefined): JevStepKind | undefined {
  if (locateMethod === "visual" || locateMethod === "dom") return locateMethod;
  if (step?.action === "assert" && !("check" in step)) return "judged";
  if (step?.action === "waitFor" && "condition" in step) return "judged";
  return undefined;
}

function failure(run: SuiteRun): Summary["failures"] {
  const failed = run.report.steps.find((step) => step.status === "failed");
  if (run.file.startsWith("assert/fails/")) {
    if (failedAtLastStep(run)) return [];
    if (!failed) return [{ file: run.file, reason: "Expected the last step to fail, but the file passed" }];
  } else if (passedRun(run)) {
    return [];
  }
  if (failed?.status === "failed")
    return [{ file: run.file, line: failed.line, action: failed.action, reason: failed.reason }];
  const error = run.report.error;
  return [{ file: run.file, reason: error ? `${error.kind}: ${error.message}` : "Failed without a failed step" }];
}
