// Runs the Element Locator with the real Jev on every fixture target and
// prints how many it located correctly, per method. Needs OPENROUTER_API_KEY
// (read from .env). Usage: pnpm jev:eval [page ...]
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createJevHarness } from "../src/jev/harness.ts";
import { createElementLocator, type LocateMethod, type LocateResult } from "../src/locator/element-locator.ts";
import { fixturePath, loadFixtureDriver } from "../test/support/fixture-driver.ts";
import { summarize, type EvalRun } from "./locator-eval.ts";

const BUDGET_USD = 0.25;
const PAGES = ["login", "list", "modal"];

interface GroundTruth {
  target: string;
  selector?: string;
  expected: string;
}

if (existsSync(".env")) process.loadEnvFile(".env");
const apiKey = process.env.OPENROUTER_API_KEY;
if (!apiKey) {
  console.error("OPENROUTER_API_KEY is not set (put it in .env).");
  process.exit(1);
}

let spent = 0;
const jev = createJevHarness({
  apiKey,
  onUsage: ({ cost }) => {
    spent += cost;
    if (spent > BUDGET_USD) throw new Error(`Stopped: spent $${spent.toFixed(4)}, over the $${BUDGET_USD} budget`);
  },
});

const modes: { mode: string; methods: LocateMethod[]; needsSelector?: boolean }[] = [
  { mode: "selector", methods: ["selector"], needsSelector: true },
  { mode: "visual", methods: ["visual"] },
  { mode: "dom", methods: ["dom"] },
  { mode: "chain", methods: ["selector", "visual", "dom"] },
];

function describeResult(result: LocateResult, expected: string): string {
  const trail = result.attempts
    .map((a) => `${a.method}:${a.outcome}${a.confidence === undefined ? "" : `@${a.confidence.toFixed(2)}`}`)
    .join(" → ");
  if (!result.found) return `not found     [${trail}]`;
  const verdict = result.element.id === expected ? "ok   " : `WRONG (got ${result.element.id} "${result.element.name}")`;
  return `${verdict} via ${result.method}  [${trail}]`;
}

const runs: EvalRun[] = [];
const pages = process.argv.length > 2 ? process.argv.slice(2) : PAGES;
for (const page of pages) {
  const driver = await loadFixtureDriver(page);
  const truth: GroundTruth[] = JSON.parse(await readFile(fixturePath(page, "ground-truth.json"), "utf8"));
  console.log(`\n# ${page}`);
  for (const { target, selector, expected } of truth) {
    console.log(`  "${target}"${selector ? ` (selector ${selector})` : ""} → ${expected}`);
    for (const { mode, methods, needsSelector } of modes) {
      if (needsSelector && !selector) continue;
      const locator = createElementLocator({ driver, jev, methods });
      const result = await locator.locate({ selector, target });
      runs.push({ mode, expected, result });
      console.log(`    ${mode.padEnd(8)} ${describeResult(result, expected)}`);
    }
  }
}

const summary = summarize(runs);
console.log("\n# Correctly located, per method");
for (const mode of ["selector", "visual", "dom"]) {
  const s = summary[mode];
  if (s) console.log(`  ${`${mode} alone`.padEnd(16)} ${s.correct}/${s.total}  (wrong ${s.wrong}, not found ${s.notFound})`);
}
const chain = summary.chain;
console.log(`  ${"full chain".padEnd(16)} ${chain.correct}/${chain.total}  (wrong ${chain.wrong}, not found ${chain.notFound})`);
for (const [method, m] of Object.entries(chain.byMethod)) {
  console.log(`    via ${method.padEnd(10)} ${m.correct}/${m.found} correct`);
}
console.log(`\nJev spend: $${spent.toFixed(5)}`);
