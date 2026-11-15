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

const positions = (diagnostics: Diagnostic[]) => diagnostics.map(({ code, line }) => ({ code, line }));

describe("analyze", () => {
  it.each(load("valid"))("parses valid/$file into the expected TestCase", ({ source, expected }) => {
    const { testCase, diagnostics } = analyze(source);

    expect(diagnostics).toEqual([]);
    expect(testCase).toEqual(expected);
  });

  it.each(load("invalid"))("rejects invalid/$file with the expected diagnostics", ({ source, expected }) => {
    expect(() => analyze(source)).not.toThrow();
    const { testCase, diagnostics } = analyze(source);

    expect(testCase).toBeUndefined();
    expect(positions(diagnostics)).toEqual(expected);
  });

  it("blames the key, not the parameters, for a non-scalar action key", () => {
    const { diagnostics } = analyze("name: a\nsteps:\n  - ? [a]\n    : {}\n");

    expect(diagnostics).toEqual([{ code: "E006", line: 3, message: expect.stringMatching(/key/) }]);
    expect(diagnostics[0].message).not.toMatch(/parameters/);
  });

  describe("browser state messages", () => {
    const messages = (source: string) => analyze(source).diagnostics.map(({ code, message }) => ({ code, message }));

    it("names the baseUrl whose host a cookie domain must match", () => {
      expect(
        messages(
          'name: a\nbaseUrl: "https://shop.example.com"\ncookies:\n  s: { value: "x", domain: "other.com" }\nsteps:\n  - reload: {}\n',
        ),
      ).toEqual([
        {
          code: "E007",
          message:
            'Cookie "s" is for "other.com", which is not the host of the baseUrl "https://shop.example.com" or a parent of it',
        },
      ]);
    });

    it("says why cookies and storage need a baseUrl", () => {
      expect(messages('name: a\nlocalStorage:\n  k: "v"\nsteps:\n  - reload: {}\n')).toEqual([
        { code: "E008", message: '"localStorage" needs a "baseUrl": it is set for the baseUrl\'s origin' },
      ]);
    });

    it("says what a header or cookie name may hold", () => {
      expect(
        messages(
          'name: a\nbaseUrl: "https://example.com"\nheaders:\n  "X Tenant": "acme"\ncookies:\n  "": "x"\nsteps:\n  - reload: {}\n',
        ),
      ).toEqual([
        {
          code: "E009",
          message: 'Header name "X Tenant" is not valid: use letters, digits, and - _ . ! # $ % & \' * + ^ ` | ~',
        },
        { code: "E009", message: "Cookie names must not be empty" },
      ]);
    });

    it("says that sameSite None needs secure", () => {
      expect(
        messages(
          'name: a\nbaseUrl: "https://example.com"\ncookies:\n  s: { value: "x", sameSite: "None" }\nsteps:\n  - reload: {}\n',
        ),
      ).toEqual([{ code: "E008", message: '"sameSite: None" needs "secure: true"' }]);
    });
  });
});
