// The Element Locator finds the element a step should act on: by selector
// first, then visual locate, then DOM locate.
import type { JevHarness } from "../jev/harness.ts";
import type { BrowserDriver, ElementSnapshot } from "./browser-driver.ts";

export type LocateMethod = "selector" | "visual" | "dom";

export interface LocateRequest {
  selector?: string;
  /** Natural-language description of the element. */
  target?: string;
}

export type AttemptOutcome =
  | "matched"
  | "no-match"
  | "ambiguous"
  | "not-visible"
  | "low-confidence"
  /** Jev's box landed on no interactive element. */
  | "missed";

/** What one locate method did. */
export interface Attempt {
  method: LocateMethod;
  outcome: AttemptOutcome;
  /** Jev's confidence, for the methods that ask Jev. */
  confidence?: number;
}

export type LocateResult =
  | { found: true; method: LocateMethod; element: ElementSnapshot; confidence: number; attempts: Attempt[] }
  | { found: false; attempts: Attempt[] };

export interface ElementLocatorOptions {
  driver: BrowserDriver;
  jev: JevHarness;
  /** Jev answers below this confidence are not trusted. Default 0.5. */
  minConfidence?: number;
  /** Which methods to try, always in selector → visual → DOM order. Default all. */
  methods?: LocateMethod[];
}

interface MethodResult {
  attempt: Attempt;
  element?: ElementSnapshot;
}

/** How DOM locate presents an element to Jev, e.g. `button "Remove" in tr: Bob ...`. */
function describe(e: ElementSnapshot): string {
  const state = "disabled" in e.attributes ? " (disabled)" : "";
  const context = e.context ? ` in ${e.context}` : "";
  return `${e.role ?? e.tag} "${e.name}"${state}${context}`;
}

const ALL_METHODS: LocateMethod[] = ["selector", "visual", "dom"];

export function createElementLocator({
  driver,
  jev,
  minConfidence = 0.5,
  methods: enabled = ALL_METHODS,
}: ElementLocatorOptions) {
  async function bySelector(selector: string): Promise<MethodResult> {
    const matches = await driver.query(selector);
    if (matches.length === 1) return { attempt: { method: "selector", outcome: "matched" }, element: matches[0] };
    return { attempt: { method: "selector", outcome: matches.length === 0 ? "no-match" : "ambiguous" } };
  }

  async function visual(target: string): Promise<MethodResult> {
    const shot = await driver.screenshot();
    const { box, confidence, visible } = await jev.locateBox({ image: shot.png, target });
    const attempt = (outcome: AttemptOutcome): Attempt => ({ method: "visual", outcome, confidence });
    if (visible < minConfidence) return { attempt: attempt("not-visible") };
    if (confidence < minConfidence) return { attempt: attempt("low-confidence") };
    const x = ((box.left + box.right) / 2) * shot.width;
    const y = ((box.top + box.bottom) / 2) * shot.height;
    const element = await driver.elementAt(x, y);
    if (!element) return { attempt: attempt("missed") };
    return { attempt: attempt("matched"), element };
  }

  async function dom(target: string): Promise<MethodResult> {
    const elements = (await driver.interactiveElements()).filter((e) => !e.obscured);
    const choice = await jev.chooseElement({
      target,
      candidates: elements.map((e) => ({ id: e.id, description: describe(e) })),
    });
    const attempt = (outcome: AttemptOutcome): Attempt => ({ method: "dom", outcome, confidence: choice.confidence });
    const chosen = elements.find((e) => e.id === choice.id);
    if (!chosen) return { attempt: attempt("no-match") };
    if (choice.confidence < minConfidence) return { attempt: attempt("low-confidence") };
    return { attempt: attempt("matched"), element: chosen };
  }

  return {
    async locate({ selector, target }: LocateRequest): Promise<LocateResult> {
      const methods: (() => Promise<MethodResult>)[] = [];
      const on = (m: LocateMethod) => enabled.includes(m);
      if (selector && on("selector")) methods.push(() => bySelector(selector));
      if (target && on("visual")) methods.push(() => visual(target));
      if (target && on("dom")) methods.push(() => dom(target));

      const attempts: Attempt[] = [];
      for (const run of methods) {
        const { attempt, element } = await run();
        attempts.push(attempt);
        if (element) {
          return { found: true, method: attempt.method, element, confidence: attempt.confidence ?? 1, attempts };
        }
      }
      return { found: false, attempts };
    },
  };
}
