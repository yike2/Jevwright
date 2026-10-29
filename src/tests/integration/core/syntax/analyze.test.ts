import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { analyze, type Diagnostic } from "@/core/syntax/index.js";

const fixtures = fileURLToPath(new URL("./fixtures/", import.meta.url));

// Each fixture `<name>.yaml` sits next to `<name>.json` holding the expected result.
function load(dir: "valid" | "invalid") {
  return readdirSync(join(fixtures, dir))
    .filter((file) => file.endsWith(".yaml"))
    .map((file) => {
      const path = join(fixtures, dir, file);
      return {
        file,
        source: readFileSync(path, "utf8"),
        expected: JSON.parse(readFileSync(path.replace(/\.yaml$/, ".json"), "utf8")),
      };
    });
}

const positions = (diagnostics: Diagnostic[]) =>
  diagnostics.map(({ code, line }) => ({ code, line }));

describe("analyze", () => {
  it.each(load("valid"))("parses valid/$file into the expected TestCase", ({ source, expected }) => {
    const { testCase, diagnostics } = analyze(source);

    expect(diagnostics).toEqual([]);
    expect(testCase).toEqual(expected);
  });

  it.each(load("invalid"))("rejects invalid/$file with the expected diagnostics", ({ source, expected }) => {
    const { testCase, diagnostics } = analyze(source);

    expect(testCase).toBeUndefined();
    expect(positions(diagnostics)).toEqual(expected);
  });
});
