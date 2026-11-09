import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { execute } from "@/core/executor/index.js";
import { analyze, type Step, type TestCase } from "@/core/syntax/index.js";
import { throwingJev } from "../unit/core/executor/fake-adapter.js";
import { serveDemoApp } from "./server.js";

const SUITE = fileURLToPath(new URL("./suite/", import.meta.url));
const files = readdirSync(SUITE, { recursive: true, encoding: "utf8" })
  .filter((file) => file.endsWith(".yaml"))
  .sort();
const flows = (folder: string) =>
  files.filter((file) => file.startsWith(`${folder}/`)).map((file) => file.slice(folder.length + 1));
const read = (file: string) => readFileSync(SUITE + file, "utf8");

function testCase(file: string): TestCase {
  const { testCase, diagnostics } = analyze(read(file));
  if (!testCase) throw new Error(`${file}: ${JSON.stringify(diagnostics)}`);
  return testCase;
}

const ELEMENT_ACTIONS: readonly Step["action"][] = ["click", "doubleClick", "rightClick", "hover", "input"];

// The TestCase without line numbers and without how its element actions find their elements, which differ by folder.
const withoutLocating = ({ steps, ...rest }: TestCase) => ({
  ...rest,
  steps: steps.map((step) => {
    const dropped = ELEMENT_ACTIONS.includes(step.action) ? ["line", "selector", "target"] : ["line"];
    return Object.fromEntries(Object.entries(step).filter(([key]) => !dropped.includes(key)));
  }),
});

describe("the benchmark suite", () => {
  it.each(files)("%s has no diagnostics", (file) => {
    expect(analyze(read(file)).diagnostics).toEqual([]);
  });

  it("has every Flow of selector/ in target/ and both/", () => {
    expect(flows("selector").length).toBeGreaterThan(0);
    expect(flows("both")).toEqual(flows("selector"));
    expect(flows("target")).toEqual(expect.arrayContaining(flows("selector")));
  });

  it.each(flows("selector"))("%s has the same steps in every folder apart from locating", (flow) => {
    const expected = withoutLocating(testCase(`selector/${flow}`));

    expect(withoutLocating(testCase(`target/${flow}`))).toEqual(expected);
    expect(withoutLocating(testCase(`both/${flow}`))).toEqual(expected);
  });

  it.each(flows("both"))("both/%s has one to three stale selectors", (flow) => {
    const stale = read(`both/${flow}`).match(/^\s+selector: .+ # stale$/gm) ?? [];

    expect(stale.length).toBeGreaterThanOrEqual(1);
    expect(stale.length).toBeLessThanOrEqual(3);
  });

  describe("selector/ against the Demo App", () => {
    let app: Awaited<ReturnType<typeof serveDemoApp>>;
    beforeAll(async () => (app = await serveDemoApp()));
    afterAll(() => app.stop());

    it.each(flows("selector"))(
      "%s passes by selector only",
      async (flow) => {
        const vars = { BASE: app.baseUrl, SWAG_PASSWORD: "secret_sauce" };

        const { steps } = await execute(testCase(`selector/${flow}`), {
          headed: false,
          vars,
          onEvent: () => {},
          jev: throwingJev,
        });

        expect(steps.flatMap((step) => ("reason" in step ? [step.reason] : []))).toEqual([]);
        expect(steps.every((step) => step.status === "passed")).toBe(true);
      },
      60_000,
    );
  });
});
