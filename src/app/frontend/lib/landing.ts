import type { Run } from "./api.js";
import signInReport from "./landing-runs/sign-in-and-see-products.json";
import staleSelectorReport from "./landing-runs/fall-back-from-a-stale-selector.json";

// Content of the landing page (frontend.md 1.14), kept out of the page so unit tests can check every claim against
// the code it describes.

export type Report = NonNullable<Run["report"]>;
export type ReplayRun = { file: string; note: string; assets: string; report: Report; judged: number[] };
export type ReplayStep = Report["steps"][number];
export type ReplayBadge = "AI locate" | "AI assert";
export type Choice = { when: string; write: string; why: string; yaml: string };
export type Fix = { problem: string; playwright: string; jevwright: string; note: string };
export type QuickStartFile = { feature: string; file: string; folder: string };
export type Stat = { value: string; label: string };
export type QuickStartFolder = { name: string; teaches: string };

/** The actions of the test file syntax (syntax-analyzer.md 1.2). */
export const ACTIONS: string[] = [
  "open",
  "back",
  "forward",
  "reload",
  "press",
  "scroll",
  "sleep",
  "switchTab",
  "click",
  "doubleClick",
  "rightClick",
  "hover",
  "input",
  "waitFor",
  "assert",
];

/** The locate methods a report records for an element step. */
export const LOCATE_METHODS: string[] = ["selector", "visual", "dom"];

/** The Demo App every Quick Start file tests, as the Quick Start project's BASE Variable. */
export const DEMO_APP_URL = "https://demo.94.72.126.118.sslip.io";

/** The Debug console for the Quick Start file seven-errors-at-once.yaml: its summary, then each problem and its code. */
export const DEBUG_RECEIPT = `7 problems
Line 5: "timeoutMs" must be a positive integer up to 2147483647  E007
Line 8: "url" is relative, so the test needs a "baseUrl"  E007
Line 9: Unknown action "aiAct"  E005
Line 10: Step must contain exactly one action, found "click" and "input"  E006
Line 15: Missing required field "value"  E003
Line 17: Needs at least one of "selector" and "target"  E008
Line 20: Unknown field "colour"  E004`;

/**
 * Real Run reports of two Quick Start files on the server, replayed on the page with their screenshots, the one that
 * called Jev first. `judged` lists the steps whose statement or condition Jev judged, which a report does not record.
 */
export const REPLAY_RUNS: ReplayRun[] = [
  {
    file: "fall-back-from-a-stale-selector.yaml",
    note: "The Login button's selector is out of date. The step also describes the button, so Jev finds it; every other step is plain Playwright.",
    assets: "/landing/runs/fall-back-from-a-stale-selector",
    report: staleSelectorReport as Report,
    judged: [],
  },
  {
    file: "sign-in-and-see-products.yaml",
    note: "Every element has a selector that matches, so Playwright does all the work and Jev is never called.",
    assets: "/landing/runs/sign-in-and-see-products",
    report: signInReport as Report,
    judged: [],
  },
];

/** The stat strip below the replay; every number is backed by the code or the shipped Run. */
export const STATS: Stat[] = [
  { value: String(ACTIONS.length), label: "actions in the test syntax" },
  { value: String(LOCATE_METHODS.length), label: "locate methods, recorded per step" },
  { value: "0", label: "test files rewritten or self-healed" },
  { value: `${(signInReport.durationMs / 1000).toFixed(1)} s`, label: "for the sign-in Run above, 6 steps" },
];

/** The Quick Start project's folders, as the backend creates them, and what each teaches. */
export const QUICK_START_FOLDERS: QuickStartFolder[] = [
  { name: "1 Passing tests", teaches: "Steps, selectors, and what a passed Run looks like." },
  { name: "2 Failing tests - see why they fail", teaches: "How a failed step reports its reason and screenshot." },
  { name: "3 Invalid files - fix the errors", teaches: "How validation lists every problem with its line." },
  {
    name: "4 Jev - find and check by description",
    teaches: "Plain-language targets, a stale-selector fallback, and statements Jev judges.",
  },
];

/** The Output console at the end of the sign-in Run: its result, then one line per step. */
export const OUTPUT_RECEIPT = [
  `Passed  ${signInReport.summary.passed}/${signInReport.summary.total} passed`,
  ...signInReport.steps.map((step) => `Step ${step.index + 1}  ${step.action}  line ${step.line}  Passed`),
].join("\n");

/** "Which should I write?": when to use each choice, with a short YAML snippet. */
export const CHOICES: Choice[] = [
  {
    when: "A stable selector exists",
    write: "selector",
    why: "Fast, free and deterministic; Jev is never called.",
    yaml: `- click:
    selector: '[data-test="login-button"]'`,
  },
  {
    when: "No reliable selector, or the UI changes often",
    write: "target",
    why: "Jev finds the element from your words.",
    yaml: `- click:
    target: "Green Login button below the password field"`,
  },
  {
    when: "You want speed and resilience",
    write: "selector + target",
    why: "The selector goes first; Jev only when it matches nothing.",
    yaml: `- click:
    selector: "#login-btn"
    target: "Green Login button below the password field"`,
  },
  {
    when: "Exact text, URL or visibility",
    write: "assert with selector, text or url",
    why: "A Playwright check, fast and repeatable.",
    yaml: `- assert:
    selector: '[data-test="title"]'
    text: "Products"`,
  },
  {
    when: "Meaning or layout in words",
    write: "assert with statement",
    why: "Jev judges the statement from a screenshot.",
    yaml: `- assert:
    statement: "The cart lists two items, each with a price"`,
  },
];

/** "What does it fix?": each scenario as Playwright code and as a Jevwright step. */
export const FIXES: Fix[] = [
  {
    problem: "A redesign renames classes and ids",
    playwright: `await page.locator("#login-btn").click();
// Fails until someone edits the selector.`,
    jevwright: `- click:
    selector: "#login-btn"
    target: "Green Login button below the password field"`,
    note: "The stale selector falls back to its target. The report shows which method worked; the file stays as written.",
  },
  {
    problem: "Elements without stable test ids",
    playwright: `await page.locator(
  "div.cart-widget > div:nth-child(2) > span.icon",
).click();`,
    jevwright: `- click:
    target: "Shopping cart icon at the top right of the page"`,
    note: "Describe the element in words, and Jev finds it on the page.",
  },
  {
    problem: "Checks that are hard to write as a selector",
    playwright: `const items = page.locator(".cart_item");
await expect(items).toHaveCount(2);
await expect(items.nth(0).locator(".price")).toBeVisible();
await expect(items.nth(1).locator(".price")).toBeVisible();`,
    jevwright: `- assert:
    statement: "The cart lists two items, each with a price"`,
    note: "Write the check as a statement, and Jev judges it from a screenshot.",
  },
  {
    problem: "Tests written by an agent or a newcomer",
    playwright: `await page.getByRole("button", { name: "Log in" }).clik();
// TypeError: clik is not a function, mid-run.`,
    jevwright: `- click:
    target: "Log in button"`,
    note: "Every problem is listed with its line before anything runs, and planning keys such as aiAct are refused.",
  },
];

/** Which Quick Start file shows which feature, in the folder the backend creates it in. */
export const QUICK_START_FILES: QuickStartFile[] = [
  { feature: "Selectors only", file: "sign-in-and-see-products.yaml", folder: "1 Passing tests" },
  { feature: "Skipping the sign-in with a cookie", file: "buy-a-backpack.yaml", folder: "1 Passing tests" },
  {
    feature: "Jev finding elements from descriptions",
    file: "find-elements-by-description.yaml",
    folder: "4 Jev - find and check by description",
  },
  {
    feature: "Jev saving a stale selector",
    file: "fall-back-from-a-stale-selector.yaml",
    folder: "4 Jev - find and check by description",
  },
  {
    feature: "Jev judging a statement",
    file: "judge-a-true-statement.yaml",
    folder: "4 Jev - find and check by description",
  },
  {
    feature: "A failing Run and its reason",
    file: "wrong-total-fails-at-the-total.yaml",
    folder: "2 Failing tests - see why they fail",
  },
];

/** The badge of a replayed step Jev worked on: AI locate for Visual or DOM Locate, AI assert for a judged statement. */
export function replayBadge(run: ReplayRun, step: ReplayStep): ReplayBadge | null {
  const method = "locateMethod" in step ? step.locateMethod : undefined;
  if (method === "visual" || method === "dom") return "AI locate";
  return run.judged.includes(step.index) ? "AI assert" : null;
}
