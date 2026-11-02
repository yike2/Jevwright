import type { FieldReader } from "./fields.js";
import type { Locate, StepBody } from "./types.js";

type Action = StepBody["action"];
type Parse = (fields: FieldReader, hasBaseUrl: boolean) => StepBody | undefined;

/**
 * True for a URL with `scheme://`, or one starting with a {{VARIABLE}} filled in at execution time.
 * Requiring `//` keeps `localhost:3000` from reading as the scheme `localhost:`.
 */
export const isAbsoluteUrl = (url: string) => /^([a-z][a-z\d+.-]*:\/\/|\{\{)/i.test(url);

// `pattern` marks a Playwright URL check, where a glob with `*` matches without a baseUrl.
function readUrl(fields: FieldReader, hasBaseUrl: boolean, required = false, pattern = false) {
  const url = fields.string("url", required);
  if (url !== undefined && !hasBaseUrl && !isAbsoluteUrl(url) && !(pattern && url.includes("*"))) {
    fields.invalid("url", `"url" is relative, so the test needs a "baseUrl"`);
  }
  return url;
}

// Returns undefined when neither "selector" nor "target" holds a valid value.
function locate(fields: FieldReader): Locate | undefined {
  if (!fields.has("selector") && !fields.has("target")) {
    fields.report("E008", 'Needs at least one of "selector" and "target"');
  }
  const selector = fields.string("selector");
  const target = fields.string("target");
  return selector === undefined && target === undefined ? undefined : { selector, target };
}

const element =
  (action: "click" | "doubleClick" | "rightClick" | "hover"): Parse =>
  (f) => {
    const locator = locate(f);
    return locator && { action, ...locator };
  };

// Every field is read before a parser returns, so reportUnknown sees them all.
const parsers = {
  open: (f, hasBaseUrl) => {
    const url = readUrl(f, hasBaseUrl, true);
    return url === undefined ? undefined : { action: "open", url };
  },
  back: () => ({ action: "back" }),
  forward: () => ({ action: "forward" }),
  reload: () => ({ action: "reload" }),
  press: (f) => {
    const key = f.string("key", true);
    return key === undefined ? undefined : { action: "press", key };
  },
  scroll: (f) => {
    const direction = f.oneOf("direction", ["up", "down", "left", "right"], true);
    const distance = f.positiveInt("distance", true);
    return direction === undefined || distance === undefined ? undefined : { action: "scroll", direction, distance };
  },
  sleep: (f) => {
    const ms = f.positiveInt("ms", true);
    return ms === undefined ? undefined : { action: "sleep", ms };
  },
  click: element("click"),
  doubleClick: element("doubleClick"),
  rightClick: element("rightClick"),
  hover: element("hover"),
  input: (f) => {
    const value = f.string("value", true, true);
    const locator = locate(f);
    return value === undefined || !locator ? undefined : { action: "input", value, ...locator };
  },
  waitFor: (f, hasBaseUrl) => {
    if (["condition", "selector", "url"].filter((key) => f.has(key)).length !== 1) {
      f.report("E008", 'Needs exactly one of "condition", "selector" and "url"');
    }
    const condition = f.string("condition");
    const selector = f.string("selector");
    const url = readUrl(f, hasBaseUrl, false, true);
    return { action: "waitFor", condition, selector, url };
  },
  assert: (f, hasBaseUrl) => {
    const selector = f.has("selector");
    const url = f.has("url");
    if (selector && url) {
      f.report("E008", 'Use either "selector" or "url" as the check, not both');
    } else if (f.has("text") && !selector) {
      f.report("E008", '"text" needs "selector"');
    } else if (!selector && !url && !f.has("statement")) {
      f.report("E008", 'Needs "statement" or a check: "selector" (optionally with "text") or "url"');
    }
    return {
      action: "assert",
      statement: f.string("statement"),
      selector: f.string("selector"),
      text: f.string("text"),
      url: readUrl(f, hasBaseUrl, false, true),
    };
  },
} satisfies Record<Action, Parse>;

/** True when `name` is a supported action. */
export const isAction = (name: string): name is Action => Object.hasOwn(parsers, name);

/** Parses the parameters of one action; returns undefined when a field is missing or invalid. */
export function parseAction(action: Action, fields: FieldReader, hasBaseUrl: boolean): StepBody | undefined {
  const body = parsers[action](fields, hasBaseUrl);
  fields.reportUnknown();
  return body;
}
