import type { FieldReader } from "./fields.js";
import type { StepBody } from "./types.js";

type Parse = (fields: FieldReader) => object;

function locate(fields: FieldReader) {
  if (!fields.has("selector") && !fields.has("target")) {
    fields.report("E008", 'Needs at least one of "selector" and "target"');
  }
  return { selector: fields.string("selector"), target: fields.string("target") };
}

const parsers: Record<string, Parse> = {
  open: (f) => ({ url: f.string("url", true) }),
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
  waitFor: (f) => {
    if (["condition", "selector", "url"].filter((key) => f.has(key)).length !== 1) {
      f.report("E008", 'Needs exactly one of "condition", "selector" and "url"');
    }
    return { condition: f.string("condition"), selector: f.string("selector"), url: f.string("url") };
  },
  assert: (f) => {
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
      url: f.string("url"),
    };
  },
};

// Parses the parameters of one action. The result is only a valid StepBody when
// no diagnostics were recorded.
export function parseAction(action: string, fields: FieldReader): StepBody | undefined {
  const parse = Object.hasOwn(parsers, action) ? parsers[action] : undefined;
  if (!parse) {
    fields.report("E005", `Unknown action "${action}"`);
    return undefined;
  }
  const body = { action, ...parse(fields) } as StepBody;
  fields.reportUnknown();
  return body;
}
