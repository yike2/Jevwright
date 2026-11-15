import type { LaunchOptions } from "../browser/index.js";
import { cookieDomainProblem, type TestCase } from "../syntax/index.js";
import { invalidBaseUrl, missingVariables } from "./reasons.js";
import { substitute } from "./variables.js";

type State = Pick<LaunchOptions, "baseUrl" | "headers" | "cookies" | "localStorage" | "sessionStorage">;

export type LaunchState = { ok: true; value: State } | { ok: false; reason: string };

/**
 * Fills the Variables of the baseUrl, headers, cookies, and storage, and checks every cookie domain against the
 * filled-in baseUrl; returns the reason the Run cannot launch otherwise (executor.md 1.2).
 */
export function launchState(testCase: TestCase, vars: Record<string, string>): LaunchState {
  const { baseUrl, headers, cookies, localStorage, sessionStorage } = testCase;
  const filled = substitute({ baseUrl, headers, cookies, localStorage, sessionStorage }, vars);
  if (!filled.ok) return { ok: false, reason: missingVariables(filled.missing) };
  const state = filled.value;
  const hasState = [headers, cookies, localStorage, sessionStorage].some((field) => field !== undefined);
  if (state.baseUrl === undefined || !hasState) return { ok: true, value: state };
  if (!URL.canParse(state.baseUrl)) return { ok: false, reason: invalidBaseUrl(state.baseUrl) };
  for (const [name, cookie] of Object.entries(state.cookies ?? {})) {
    const problem = cookie.domain === undefined ? undefined : cookieDomainProblem(name, cookie.domain, state.baseUrl);
    if (problem) return { ok: false, reason: problem };
  }
  return { ok: true, value: state };
}
