import type { Network } from "../browser/index.js";
import type { StepEvent } from "../executor/index.js";
import type { JevClient } from "../jev/index.js";
import type { Report, ReportStore } from "../report/index.js";
import type { Diagnostic } from "../syntax/index.js";

export type RunTestOptions = {
  headed: boolean;
  vars: Record<string, string>;
  jev: JevClient;
  store: ReportStore;
  onEvent?: (event: StepEvent) => void;
  screenshotEveryStep?: boolean; // Executor: a screenshot after every executed step, not only a failed one
  network?: Network; // Browser Adapter: "public" aborts requests to non-public addresses
  maxRunTimeoutMs?: number; // Executor: caps the TestCase's runTimeoutMs
};

export type RunTestResult = { kind: "invalid"; diagnostics: Diagnostic[] } | { kind: "completed"; report: Report };
