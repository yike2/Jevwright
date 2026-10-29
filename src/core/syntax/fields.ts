import { isAlias, isScalar, type Document, type LineCounter, type Node, type Scalar, type YAMLMap } from "yaml";
import type { Diagnostic } from "./types.js";

// Largest delay Node timers and Playwright accept; anything above fires after 1 ms.
const MAX_TIMER_MS = 2147483647;

export function lineOf(lineCounter: LineCounter, node: Node): number {
  return lineCounter.linePos(node.range?.[0] ?? 0).line;
}

const keyName = (key: unknown) => String(isScalar(key) ? key.value : key);

// Plain numbers and booleans read as their source text, so `key: 1` is "1" and `030` stays "030".
function text({ value, source }: Scalar): string | undefined {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return source ?? String(value);
  return undefined;
}

// Reads typed fields from a YAML object. Missing required fields are reported at
// `owner` (the key of the enclosing object), bad values at the value itself.
export class FieldReader {
  private readonly read = new Set<string>();

  constructor(
    private readonly map: YAMLMap,
    private readonly owner: Node,
    private readonly lineCounter: LineCounter,
    private readonly diagnostics: Diagnostic[],
    private readonly doc: Document,
  ) {}

  // A reader for a nested object that shares this reader's document and diagnostics.
  child(map: YAMLMap, owner: Node): FieldReader {
    return new FieldReader(map, owner, this.lineCounter, this.diagnostics, this.doc);
  }

  line(node: Node): number {
    return lineOf(this.lineCounter, node);
  }

  // Follows an alias (`*name`) to its anchored node; other nodes are returned as is.
  resolve(node: unknown): unknown {
    return isAlias(node) ? node.resolve(this.doc) : node;
  }

  has(key: string): boolean {
    this.read.add(key);
    return this.map.has(key);
  }

  string(key: string, required = false, allowEmpty = false): string | undefined {
    const read = (s: Scalar) => {
      const value = text(s);
      return value !== undefined && (allowEmpty || value !== "") ? value : undefined;
    };
    return this.value(key, required, read, allowEmpty ? "a string" : "a non-empty string");
  }

  positiveInt(key: string, required = false): number | undefined {
    const read = ({ value }: Scalar) =>
      typeof value === "number" && Number.isSafeInteger(value) && value > 0 && value <= MAX_TIMER_MS
        ? value
        : undefined;
    return this.value(key, required, read, `a positive integer up to ${MAX_TIMER_MS}`);
  }

  oneOf<T extends string>(key: string, values: readonly T[], required = false): T | undefined {
    const read = (s: Scalar) => values.find((v) => v === s.value);
    return this.value(key, required, read, `one of ${values.join(", ")}`);
  }

  // Reports E004 for every field no read method asked for.
  reportUnknown(): void {
    for (const { key } of this.map.items) {
      const name = keyName(key);
      if (!this.read.has(name)) this.report("E004", `Unknown field "${name}"`, key as Node);
    }
  }

  report(code: string, message: string, node: Node = this.owner): void {
    this.diagnostics.push({ code, message, line: this.line(node) });
  }

  // Reports E007 at the value of `key`.
  invalid(key: string, message: string): void {
    this.report("E007", message, this.map.get(key, true) as Node);
  }

  private value<T>(key: string, required: boolean, read: (s: Scalar) => T | undefined, expected: string) {
    if (!this.has(key)) {
      if (required) this.report("E003", `Missing required field "${key}"`);
      return undefined;
    }
    const node = this.resolve(this.map.get(key, true));
    const value = isScalar(node) ? read(node) : undefined;
    if (value === undefined) this.invalid(key, `"${key}" must be ${expected}`);
    return value;
  }
}
