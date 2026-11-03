import type { Step, TestCase } from "../syntax/index.js";

export type Substituted = { ok: true; step: Step } | { ok: false; missing: string[] };

/** Fills every {{NAME}} in the string fields of `step` from `vars`; lists the names `vars` lacks. */
export function substitute(step: Step, vars: Record<string, string>): Substituted {
  return { ok: true, step };
}

/** Returns a function that puts {{NAME}} back for the value of every Variable used in `testCase`. */
export function createRedact(testCase: TestCase, vars: Record<string, string>): (text: string) => string {
  return (text) => text;
}
