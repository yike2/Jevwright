import type { Step, TestCase } from "../syntax/index.js";

export type Substituted = { ok: true; step: Step } | { ok: false; missing: string[] };

const VARIABLE = /\{\{([A-Z_][A-Z0-9_]*)\}\}/g;

// Every string field of a step is user text that may hold a Variable; `action` never does.
function mapStrings(value: unknown, map: (text: string) => string): unknown {
  if (typeof value === "string") return map(value);
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).map(([key, field]) => [key, mapStrings(field, map)]));
}

/** Fills every {{NAME}} in the string fields of `step` from `vars`; lists the names `vars` lacks. */
export function substitute(step: Step, vars: Record<string, string>): Substituted {
  const missing: string[] = [];
  const filled = mapStrings(step, (text) =>
    text.replace(VARIABLE, (variable, name: string) => {
      if (Object.hasOwn(vars, name)) return vars[name]!;
      if (!missing.includes(name)) missing.push(name);
      return variable;
    }),
  ) as Step;
  return missing.length > 0 ? { ok: false, missing } : { ok: true, step: filled };
}

/** Returns a function that puts {{NAME}} back for the value of every Variable used in `testCase`. */
export function createRedact(testCase: TestCase, vars: Record<string, string>): (text: string) => string {
  const names = new Map<string, string>(); // value → {{NAME}}
  for (const step of testCase.steps) {
    mapStrings(step, (text) => {
      for (const [variable, name] of text.matchAll(VARIABLE)) {
        const value = vars[name!];
        if (value) names.set(value, variable);
      }
      return text;
    });
  }
  if (names.size === 0) return (text) => text;
  // One pass with the longest value first, so a value inside another or inside a {{NAME}} is never replaced.
  const values = [...names.keys()].sort((a, b) => b.length - a.length);
  const pattern = new RegExp(values.map((value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"), "g");
  return (text) => text.replace(pattern, (value) => names.get(value)!);
}
