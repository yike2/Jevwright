import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { runCli } from "@/cli/run-cli.js";
import type { Report } from "@/core/report/index.js";
import { analyze } from "@/core/syntax/index.js";
import { serveDemoApp } from "./server.js";
import { LOCATING_FOLDERS, summarize, type Latency, type Rate, type SuiteRun, type Summary } from "./summary.js";

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
const app = await serveDemoApp();
process.env.BASE = app.baseUrl;
try {
  for (const folder of folders) {
    await runCli(["run", `${SUITE}/${folder}`, "--out-dir", outDir], {
      cwd: process.cwd(),
      stdout: (text) => process.stdout.write(text),
      stderr: (text) => process.stderr.write(text),
    });
  }
} finally {
  await app.stop();
}

const summary = summarize(await readRuns(outDir));
await mkdir(RESULTS, { recursive: true });
const file = join(RESULTS, `${stamp}.json`);
await writeFile(file, `${JSON.stringify({ startedAt: startedAt.toISOString(), folders, summary }, null, 2)}\n`);
console.log(`\n${format(summary)}\n\nSummary → ${file}`);

// Reads every report.json the CLI wrote under `dir`, with the TestCase of its suite file.
async function readRuns(dir: string): Promise<SuiteRun[]> {
  const files = (await readdir(dir, { recursive: true })).filter((path) => path.endsWith("report.json"));
  const runs: SuiteRun[] = [];
  for (const path of files.sort()) {
    const report = JSON.parse(await readFile(join(dir, path), "utf8")) as Report;
    const { testCase } = analyze(await readFile(report.file, "utf8"));
    if (!testCase) throw new Error(`${report.file} no longer analyzes`);
    runs.push({ file: relative(SUITE, report.file), report, testCase });
  }
  return runs;
}

function format(summary: Summary): string {
  const pct = ({ passed, total, rate }: Rate) => `${passed}/${total} (${(rate * 100).toFixed(0)}%)`;
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
    `Jev step latency (PRD target ${summary.latency.prdTargetMs / 1000}s average)`,
    `  all        ${ms(summary.latency.all)}`,
    ...(["visual", "dom", "judged"] as const).map((kind) => `  ${kind.padEnd(10)} ${ms(summary.latency.byKind[kind])}`),
    `Failures (${summary.failures.length})`,
    ...summary.failures.map(
      ({ file, line, action, reason }) => `  ${file}${line ? `:${line} ${action}` : ""} — ${reason}`,
    ),
  ];
  return lines.join("\n");
}
