import type { Run } from "./api.js";

// Content of the landing page (frontend.md 1.14), kept out of the page so unit tests can check every claim against
// the code it describes.

export type Report = NonNullable<Run["report"]>;
export type ReplayRun = { file: string; assets: string; report: Report };
export type Stat = { value: string; label: string };
export type QuickStartModule = { name: string; teaches: string };

/** The actions of the test file syntax (syntax-analyzer.md 1.2). */
export const ACTIONS: string[] = [];

/** The locate methods a report records for an element step. */
export const LOCATE_METHODS: string[] = [];

/** Real `jevwright validate` output for the Quick Start file seven-errors-at-once.yaml. */
export const VALIDATE_RECEIPT = "";

/** Real `jevwright run` output for the sign-in file. */
export const RUN_RECEIPT = "";

/** Real Run reports, replayed on the page, with their screenshots under public/. */
export const REPLAY_RUNS: ReplayRun[] = [];

/** The stat strip below the replay; every number is backed by the code or the shipped Run. */
export const STATS: Stat[] = [];

/** The Quick Start project's Modules, as the backend creates them, and what each teaches. */
export const QUICK_START_MODULES: QuickStartModule[] = [];
export type Feature = { title: string; description: string };

/** A short test file shown on the landing page; a unit test runs it through the Syntax Analyzer. */
export const SAMPLE_TEST = `name: "Sign in"
baseUrl: "{{BASE}}"
steps:
  - open:
      url: "/"
  - input:
      selector: '[data-test="username"]'
      value: "standard_user"
  - input:
      target: "Password field in the login form"
      value: "{{SWAG_PASSWORD}}"
  - click:
      selector: '[data-test="login-button"]'
  - assert:
      selector: '[data-test="title"]'
      text: "Products"
      statement: "The page lists products with prices"
`;

/** The feature sections of the landing page, in order. */
export const FEATURES: Feature[] = [
  {
    title: "Plain YAML steps",
    description:
      "Write a test as a list of steps: open, click, input, assert. The editor checks every line and lists every problem with its line number before you run.",
  },
  {
    title: "Jev locating",
    description:
      "Give a selector, a plain-language target, or both. Playwright tries the selector first; Jev, a small and fast model, steps in only to find an element or judge a statement.",
  },
  {
    title: "Live runs",
    description:
      "Runs execute on the server in a real Chromium. Watch each step start and finish as it happens, with a screenshot of every step.",
  },
  {
    title: "History and reports",
    description:
      "Every Run keeps its source, status, duration, step results and screenshots. Download the JSON report or the Playwright trace for any Run.",
  },
  {
    title: "CLI and API",
    description:
      "Validate and run the same files from the jevwright command line in CI, or drive everything through the REST API and its OpenAPI document.",
  },
];
