import type { FieldReader } from "./fields.js";
import type { Locate, StepBody } from "./types.js";

type Parse = (fields: FieldReader, hasBaseUrl: boolean) => StepBody | undefined;

// A URL with a scheme, or one starting with a {{VARIABLE}} filled in at execution time.
const isAbsoluteUrl = (url: string) => /^([a-z][a-z\d+.-]*:|\{\{)/i.test(url);

function readUrl(fields: FieldReader, hasBaseUrl: boolean, required = false) {
  const url = fields.string("url", required);
  if (url !== undefined && !hasBaseUrl && !isAbsoluteUrl(url)) {
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
const parsers: Record<string, Parse> = {
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
    const url = readUrl(f, hasBaseUrl);
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
      url: readUrl(f, hasBaseUrl),
    };
  },
};

// Parses the parameters of one action. Returns undefined when the action is unknown
// or a required field is missing or invalid.
export function parseAction(action: string, fields: FieldReader, hasBaseUrl: boolean): StepBody | undefined {
  const parse = Object.hasOwn(parsers, action) ? parsers[action] : undefined;
  if (!parse) {
    fields.report("E005", `Unknown action "${action}"`);
    return undefined;
  }
  const body = parse(fields, hasBaseUrl);
  fields.reportUnknown();
  return body;
}
