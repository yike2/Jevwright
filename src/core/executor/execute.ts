import { launchBrowser } from "../browser/index.js";
import type { TestCase } from "../syntax/index.js";
import type { ExecuteOptions, ExecuteResult } from "./types.js";

/** Runs `testCase` on its own browser, stopping at the first failed step; returns every Step result and the trace. */
export async function execute(
  testCase: TestCase,
  options: ExecuteOptions,
  launch: typeof launchBrowser = launchBrowser,
): Promise<ExecuteResult> {
  return { steps: [], trace: Buffer.alloc(0) };
}
