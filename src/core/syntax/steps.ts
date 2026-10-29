import type { FieldReader } from "./fields.js";
import type { StepBody } from "./types.js";

type Parse = (fields: FieldReader, hasBaseUrl: boolean) => object;

// A URL with a scheme, or one starting with a {{VARIABLE}} filled in at execution time.
const isAbsoluteUrl = (url: string) => /^([a-z][a-z\d+.-]*:|\{\{)/i.test(url);

function readUrl(fields: FieldReader, hasBaseUrl: boolean, required = false) {
  const url = fields.string("url", required);
  if (url !== undefined && !hasBaseUrl && !isAbsoluteUrl(url)) {
    fields.invalid("url", `"url" is relative, so the test needs a "baseUrl"`);
  }
  return url;
}

function locate(fields: FieldReader) {
  if (!fields.has("selector") && !fields.has("target")) {
    fields.report("E008", 'Needs at least one of "selector" and "target"');
  }
  return { selector: fields.string("selector"), target: fields.string("target") };
}

const parsers: Record<string, Parse> = {
  open: (f, hasBaseUrl) => ({ url: readUrl(f, hasBaseUrl, true) }),
  back: () => ({}),
  forward: () => ({}),
  reload: () => ({}),
  press: (f) => ({ key: f.string("key", true) }),
  scroll: (f) => ({
    direction: f.oneOf("direction", ["up", "down", "left", "right"], true),
    distance: f.positiveInt("distance", true),
  }),
  sleep: (f) => ({ ms: f.positiveInt("ms", true) }),
  click: locate,
  doubleClick: locate,
  rightClick: locate,
  hover: locate,
  input: (f) => ({ value: f.string("value", true, true), ...locate(f) }),
  waitFor: (f, hasBaseUrl) => {
    if (["condition", "selector", "url"].filter((key) => f.has(key)).length !== 1) {
      f.report("E008", 'Needs exactly one of "condition", "selector" and "url"');
    }
    return { condition: f.string("condition"), selector: f.string("selector"), url: readUrl(f, hasBaseUrl) };
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
      statement: f.string("statement"),
      selector: f.string("selector"),
      text: f.string("text"),
      url: readUrl(f, hasBaseUrl),
    };
  },
};

// Parses the parameters of one action. The result is only a valid StepBody when
// no diagnostics were recorded.
export function parseAction(action: string, fields: FieldReader, hasBaseUrl: boolean): StepBody | undefined {
  const parse = Object.hasOwn(parsers, action) ? parsers[action] : undefined;
  if (!parse) {
    fields.report("E005", `Unknown action "${action}"`);
    return undefined;
  }
  const body = { action, ...parse(fields, hasBaseUrl) } as StepBody;
  fields.reportUnknown();
  return body;
}
