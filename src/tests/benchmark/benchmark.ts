import { readdir, readFile, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { runCli } from "@/cli/run-cli.js";
import type { Report } from "@/core/report/index.js";
import { analyze } from "@/core/syntax/index.js";
import { serveDemoApp } from "./server.js";
import { readTags } from "./tags.js";
import {
  isRight,
  LOCATING_FOLDERS,
  summarize,
  type Latency,
  type Rate,
  type SuiteRun,
  type Summary,
} from "./summary.js";

const SUITE = "src/tests/benchmark/suite";
const RESULTS = "benchmark-results";
const FOLDERS = [...LOCATING_FOLDERS, "assert"];

// `pnpm benchmark [folder...]` runs the given suite folders, or all of them, from the repo root.
const folders = process.argv.slice(2).length > 0 ? process.argv.slice(2) : FOLDERS;
const unknown = folders.filter((folder) => !FOLDERS.includes(folder));
if (unknown.length > 0) {
  console.error(`Unknown suite folder: ${unknown.join(", ")}. Folders: ${FOLDERS.join(", ")}`);
  process.exit(2);
}

const startedAt = new Date();
const stamp = startedAt.toISOString().replaceAll(":", "-");
const outDir = join(RESULTS, stamp);
const io = {
  cwd: process.cwd(),
  stdout: (text: string) => process.stdout.write(text),
  stderr: (text: string) => process.stderr.write(text),
};
const app = await serveDemoApp();
process.env.BASE = app.baseUrl;
let runs: SuiteRun[];
try {
  for (const folder of folders) await runCli(["run", `${SUITE}/${folder}`, "--out-dir", join(outDir, "first")], io);
  runs = await readRuns(join(outDir, "first"));
  // A file that was not right gets one more try, so the summary can tell a flaky file from a wrong one.
  const retry = runs.filter(({ file, tries, testCase }) => !isRight(file, tries[0], testCase));
  if (retry.length > 0) {
    console.log(`\nRetrying ${retry.length} files`);
    await runCli(["run", ...retry.map(({ file }) => `${SUITE}/${file}`), "--out-dir", join(outDir, "retry")], io);
    const retried = new Map((await readRuns(join(outDir, "retry"))).map((run) => [run.file, run.tries[0]]));
    runs = runs.map((run) => {
      const second = retried.get(run.file);
      return second ? { ...run, tries: [...run.tries, second] } : run;
    });
  }
} finally {
  await app.stop();
}

const summary = summarize(runs);
const file = join(RESULTS, `${stamp}.json`);
await writeFile(file, `${JSON.stringify({ startedAt: startedAt.toISOString(), folders, summary }, null, 2)}\n`);
console.log(`\n${format(summary)}\n\nSummary → ${file}`);

// Reads every report.json the CLI wrote under `dir`, with the TestCase and Tags of its suite file.
async function readRuns(dir: string): Promise<SuiteRun[]> {
  const files = (await readdir(dir, { recursive: true })).filter((path) => path.endsWith("report.json"));
  const runs: SuiteRun[] = [];
  for (const path of files.sort()) {
    const report = JSON.parse(await readFile(join(dir, path), "utf8")) as Report;
    const source = await readFile(report.file, "utf8");
    const { testCase } = analyze(source);
    if (!testCase) throw new Error(`${report.file} no longer analyzes`);
    runs.push({ file: relative(SUITE, report.file), tags: readTags(source), testCase, tries: [report] });
  }
  return runs;
}

function format(summary: Summary): string {
  const pct = ({ passed, flaky, total, rate }: Rate) =>
    `${passed}/${total} (${(rate * 100).toFixed(0)}%)${flaky > 0 ? `, ${flaky} flaky` : ""}`;
  const ms = ({ steps, averageMs, slowestMs }: Latency) =>
    steps === 0
      ? "no steps"
      : `${steps} steps, average ${(averageMs / 1000).toFixed(2)}s, slowest ${(slowestMs / 1000).toFixed(2)}s`;
  const lines = [
    "Pass rate",
    ...LOCATING_FOLDERS.map((folder) => `  ${folder.padEnd(10)} ${pct(summary.passRates[folder])}`),
    "Flow groups",
    ...summary.groups.map(({ folder, group, ...rate }) => `  ${folder.padEnd(10)} ${group.padEnd(14)} ${pct(rate)}`),
    "Judging accuracy",
    `  holds/     ${pct(summary.judging.holds)}`,
    `  fails/     ${pct(summary.judging.fails)}`,
    `  all        ${pct(summary.judging.all)}`,
    "Tags",
    ...Object.entries(summary.tags)
      .sort(([, a], [, b]) => a.rate - b.rate)
      .map(([tag, rate]) => `  ${tag.padEnd(15)} ${pct(rate)}`),
    `Jev step latency (PRD target ${summary.latency.prdTargetMs / 1000}s average)`,
    `  all        ${ms(summary.latency.all)}`,
    ...(["visual", "dom", "judged"] as const).map((kind) => `  ${kind.padEnd(10)} ${ms(summary.latency.byKind[kind])}`),
    `Not stable (${summary.failures.length})`,
    ...summary.failures.map(
      ({ file, outcome, line, action, reason }) =>
        `  [${outcome}] ${file}${line ? `:${line} ${action}` : ""} — ${reason.replaceAll("\n", "\n      ")}`,
    ),
  ];
  return lines.join("\n");
}
