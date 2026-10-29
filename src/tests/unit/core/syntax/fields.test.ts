import { describe, expect, it } from "vitest";
import { LineCounter, parseDocument, type Pair, type Scalar, type YAMLMap } from "yaml";
import { FieldReader } from "@/core/syntax/fields.js";
import type { Diagnostic } from "@/core/syntax/types.js";

// Wraps the parameters of the single action in `source`; the action key is the owner.
function readerFor(source: string) {
  const lineCounter = new LineCounter();
  const doc = parseDocument(source, { lineCounter });
  const action = (doc.contents as YAMLMap).items[0] as Pair<Scalar, YAMLMap>;
  const diagnostics: Diagnostic[] = [];
  const reader = new FieldReader(action.value!, action.key, lineCounter, diagnostics, doc);
  return { reader, diagnostics };
}

const positions = (diagnostics: Diagnostic[]) =>
  diagnostics.map(({ code, line }) => ({ code, line }));

describe("FieldReader", () => {
  describe("string", () => {
    it("reads a string field", () => {
      const { reader, diagnostics } = readerFor('input:\n  value: "hello"\n');

      expect(reader.string("value", true)).toBe("hello");
      expect(diagnostics).toEqual([]);
    });

    it("returns undefined for a missing optional field", () => {
      const { reader, diagnostics } = readerFor('input:\n  value: "hello"\n');

      expect(reader.string("selector")).toBeUndefined();
      expect(diagnostics).toEqual([]);
    });

    it("reports E003 at the owner key for a missing required field", () => {
      const { reader, diagnostics } = readerFor('input:\n  selector: "#email"\n');

      expect(reader.string("value", true)).toBeUndefined();
      expect(positions(diagnostics)).toEqual([{ code: "E003", line: 1 }]);
    });

    it("reports E007 at the value for a non-scalar", () => {
      const { reader, diagnostics } = readerFor("input:\n  value: [42]\n");

      expect(reader.string("value", true)).toBeUndefined();
      expect(positions(diagnostics)).toEqual([{ code: "E007", line: 2 }]);
    });

    it.each([
      ["1", "1"],
      ["030", "030"],
      ["true", "true"],
    ])("reads the plain scalar %s as its source text", (source, expected) => {
      const { reader, diagnostics } = readerFor(`press:\n  key: ${source}\n`);

      expect(reader.string("key", true)).toBe(expected);
      expect(diagnostics).toEqual([]);
    });

    it("resolves an alias to its anchored value", () => {
      const { reader, diagnostics } = readerFor('input:\n  selector: &s "#email"\n  target: *s\n');

      expect(reader.string("target")).toBe("#email");
      expect(diagnostics).toEqual([]);
    });

    it("reports E007 at the value for an empty string", () => {
      const { reader, diagnostics } = readerFor('click:\n  selector: ""\n');

      expect(reader.string("selector")).toBeUndefined();
      expect(positions(diagnostics)).toEqual([{ code: "E007", line: 2 }]);
    });

    it("reads an empty string when allowEmpty is set", () => {
      const { reader, diagnostics } = readerFor('input:\n  value: ""\n');

      expect(reader.string("value", true, true)).toBe("");
      expect(diagnostics).toEqual([]);
    });
  });

  describe("positiveInt", () => {
    it("reads a positive integer", () => {
      const { reader, diagnostics } = readerFor("sleep:\n  ms: 250\n");

      expect(reader.positiveInt("ms", true)).toBe(250);
      expect(diagnostics).toEqual([]);
    });

    it("reads the largest timer delay, 2147483647", () => {
      const { reader, diagnostics } = readerFor("sleep:\n  ms: 2147483647\n");

      expect(reader.positiveInt("ms", true)).toBe(2147483647);
      expect(diagnostics).toEqual([]);
    });

    it.each(["0", "-5", "1.5", '"250"', "2147483648", "3000000000", "1e300"])("reports E007 at the value for %s", (value) => {
      const { reader, diagnostics } = readerFor(`sleep:\n  ms: ${value}\n`);

      expect(reader.positiveInt("ms", true)).toBeUndefined();
      expect(positions(diagnostics)).toEqual([{ code: "E007", line: 2 }]);
    });
  });

  describe("oneOf", () => {
    const directions = ["up", "down", "left", "right"] as const;

    it("reads an allowed value", () => {
      const { reader, diagnostics } = readerFor("scroll:\n  direction: down\n");

      expect(reader.oneOf("direction", directions, true)).toBe("down");
      expect(diagnostics).toEqual([]);
    });

    it("reports E007 at the value for a value outside the set", () => {
      const { reader, diagnostics } = readerFor("scroll:\n  direction: sideways\n");

      expect(reader.oneOf("direction", directions, true)).toBeUndefined();
      expect(positions(diagnostics)).toEqual([{ code: "E007", line: 2 }]);
    });
  });

  describe("reportUnknown", () => {
    it("reports E004 at the key of each field that was never read", () => {
      const { reader, diagnostics } = readerFor('click:\n  selector: "#submit"\n  force: true\n');

      reader.string("selector");
      reader.string("target");
      reader.reportUnknown();

      expect(positions(diagnostics)).toEqual([{ code: "E004", line: 3 }]);
    });
  });
});
