import type { Run } from "./api.js";
import signInReport from "./landing-runs/sign-in-and-see-products.json";
import staleSelectorReport from "./landing-runs/fall-back-from-a-stale-selector.json";

// Content of the landing page (frontend.md 1.14), kept out of the page so unit tests can check every claim against
// the code it describes.

export type Report = NonNullable<Run["report"]>;
export type ReplayRun = { file: string; note: string; assets: string; report: Report };
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

/** The command in the hero and the closing call to action (cli.md 3.1). */
export const COMMAND = "pnpm jevwright run tests/sign-in.yaml";

/** Real `jevwright validate` output for the Quick Start file seven-errors-at-once.yaml. */
export const VALIDATE_RECEIPT = `$ pnpm jevwright validate tests/seven-errors-at-once.yaml
✖ tests/seven-errors-at-once.yaml:5 — Error: "timeoutMs" must be a positive integer up to 2147483647
✖ tests/seven-errors-at-once.yaml:8 — Error: "url" is relative, so the test needs a "baseUrl"
✖ tests/seven-errors-at-once.yaml:9 — Error: Unknown action "aiAct"
✖ tests/seven-errors-at-once.yaml:10 — Error: Step must contain exactly one action, found "click" and "input"
✖ tests/seven-errors-at-once.yaml:15 — Error: Missing required field "value"
✖ tests/seven-errors-at-once.yaml:17 — Error: Needs at least one of "selector" and "target"
✖ tests/seven-errors-at-once.yaml:20 — Error: Unknown field "colour"
Validation FAILED (7 errors).`;

/** Real `jevwright run` output for the Quick Start file sign-in-and-see-products.yaml. */
export const RUN_RECEIPT = `$ pnpm jevwright run tests/sign-in-and-see-products.yaml
▶ tests/sign-in-and-see-products.yaml
  ✔ line 8   open      207ms
  ✔ line 10  input     102ms   [selector]
  ✔ line 13  input     63ms    [selector]
  ✔ line 16  click     132ms   [selector]
  ✔ line 18  waitFor   4ms
  ✔ line 20  assert    65ms
✔ PASSED (6/6 passed) in 0.89s → jevwright-reports/2026-11-15T01-50-11.848Z/tests/sign-in-and-see-products`;

/** Real Run reports of two Quick Start files on the server, replayed on the page, with their screenshots. */
export const REPLAY_RUNS: ReplayRun[] = [
  {
    file: "sign-in-and-see-products.yaml",
    note: "Every element has a selector that matches, so Playwright does all the work and Jev is never called.",
    assets: "/landing/runs/sign-in-and-see-products",
    report: signInReport as Report,
  },
  {
    file: "fall-back-from-a-stale-selector.yaml",
    note: "The Login button's selector is out of date. The step also describes the button, so Jev finds it.",
    assets: "/landing/runs/fall-back-from-a-stale-selector",
    report: staleSelectorReport as Report,
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
