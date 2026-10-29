import { isScalar, type LineCounter, type Node, type YAMLMap } from "yaml";
import type { Diagnostic } from "./types.js";

export function lineOf(lineCounter: LineCounter, node: Node): number {
  return lineCounter.linePos(node.range?.[0] ?? 0).line;
}

const keyName = (key: unknown) => String(isScalar(key) ? key.value : key);

// Reads typed fields from a YAML object. Missing required fields are reported at
// `owner` (the key of the enclosing object), bad values at the value itself.
export class FieldReader {
  private readonly read = new Set<string>();

  constructor(
    private readonly map: YAMLMap,
    private readonly owner: Node,
    private readonly lineCounter: LineCounter,
    private readonly diagnostics: Diagnostic[],
  ) {}

  has(key: string): boolean {
    this.read.add(key);
    return this.map.has(key);
  }

  string(key: string, required = false): string | undefined {
    return this.value(key, required, (v) => typeof v === "string", "a string");
  }

  positiveInt(key: string, required = false): number | undefined {
    const isPositiveInt = (v: unknown) => typeof v === "number" && Number.isInteger(v) && v > 0;
    return this.value(key, required, isPositiveInt, "a positive integer");
  }

  oneOf<T extends string>(key: string, values: readonly T[], required = false): T | undefined {
    const isAllowed = (v: unknown) => values.includes(v as T);
    return this.value(key, required, isAllowed, `one of ${values.join(", ")}`);
  }

  // Reports E004 for every field no read method asked for.
  reportUnknown(): void {
    for (const { key } of this.map.items) {
      const name = keyName(key);
      if (!this.read.has(name)) this.report("E004", `Unknown field "${name}"`, key as Node);
    }
  }

  report(code: string, message: string, node: Node = this.owner): void {
    this.diagnostics.push({ code, message, line: lineOf(this.lineCounter, node) });
  }

  private value<T>(key: string, required: boolean, valid: (v: unknown) => boolean, expected: string) {
    if (!this.has(key)) {
      if (required) this.report("E003", `Missing required field "${key}"`);
      return undefined;
    }
    const node = this.map.get(key, true) as Node;
    const value = isScalar(node) ? node.value : undefined;
    if (valid(value)) return value as T;
    this.report("E007", `"${key}" must be ${expected}`, node);
    return undefined;
  }
}
