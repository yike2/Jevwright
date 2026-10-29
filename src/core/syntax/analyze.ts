import {
  isMap,
  isScalar,
  isSeq,
  LineCounter,
  parseDocument,
  type Document,
  type Node,
  type YAMLError,
} from "yaml";
import { FieldReader, lineOf } from "./fields.js";
import { parseAction } from "./steps.js";
import type { AnalyzeResult, Diagnostic, Step } from "./types.js";

const DEFAULT_TIMEOUT_MS = 15000;

const parserDiagnostic = (error: YAMLError): Diagnostic => ({
  code: "E001",
  message: error.message.replace(/ at line \d+, column \d+[\s\S]*/, ""),
  line: error.linePos?.[0].line ?? 1,
});

export function analyze(source: string): AnalyzeResult {
  const lineCounter = new LineCounter();
  const doc = parseDocument(source, { lineCounter });
  if (doc.errors.length > 0) return { diagnostics: doc.errors.map(parserDiagnostic) };

  const root = doc.contents;
  if (!isMap(root)) {
    const line = root ? lineOf(lineCounter, root) : 1;
    return { diagnostics: [{ code: "E002", message: "The root must be an object", line }] };
  }

  // Warnings, such as an unresolved tag, leave a usable tree, so validation goes on.
  const diagnostics: Diagnostic[] = doc.warnings.map(parserDiagnostic);
  const fields = new FieldReader(root, root, lineCounter, diagnostics, doc);

  const name = fields.string("name", true);
  const description = fields.string("description");
  const baseUrl = fields.string("baseUrl");
  const timeoutMs = fields.positiveInt("timeoutMs") ?? DEFAULT_TIMEOUT_MS;

  const steps: Step[] = [];
  if (!fields.has("steps")) {
    fields.report("E003", 'Missing required field "steps"');
  } else {
    const stepsNode = root.get("steps", true) as Node;
    const list = fields.resolve(stepsNode);
    if (!isSeq(list) || list.items.length === 0) {
      fields.report("E002", '"steps" must be a non-empty array', stepsNode);
    } else {
      for (const item of list.items as Node[]) {
        const step = parseStep(item, fields, fields.has("baseUrl"), lineCounter, diagnostics, doc);
        if (step) steps.push(step);
      }
    }
  }
  fields.reportUnknown();

  diagnostics.sort((a, b) => a.line - b.line);
  if (diagnostics.length > 0) return { diagnostics };
  return { testCase: { name: name!, description, baseUrl, timeoutMs, steps }, diagnostics };
}

// Checks that a step is an object with exactly one action whose parameters are an object.
function parseStep(
  item: Node,
  root: FieldReader,
  hasBaseUrl: boolean,
  lineCounter: LineCounter,
  diagnostics: Diagnostic[],
  doc: Document,
) {
  const step = root.resolve(item);
  if (!isMap(step)) {
    root.report("E006", "Step must be an object with exactly one action", item);
    return undefined;
  }
  if (step.items.length !== 1) {
    const found = step.items.map(({ key }) => `"${isScalar(key) ? key.value : key}"`).join(" and ");
    root.report("E006", `Step must contain exactly one action, found ${found || "none"}`, item);
    return undefined;
  }
  const [pair] = step.items;
  const key = root.resolve(pair.key);
  const params = root.resolve(pair.value);
  if (!isScalar(key)) {
    root.report("E006", "The action key must be a name, not a list or object", item);
    return undefined;
  }
  if (!isMap(params)) {
    root.report("E006", "Action parameters must be an object, use {} for none", item);
    return undefined;
  }
  const fields = new FieldReader(params, pair.key as Node, lineCounter, diagnostics, doc);
  const body = parseAction(String(key.value), fields, hasBaseUrl);
  return body && { line: lineOf(lineCounter, item), ...body };
}
