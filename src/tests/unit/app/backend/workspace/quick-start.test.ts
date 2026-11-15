import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { analyze } from "@/core/syntax/index.js";
import { QUICK_START_NAME, quickStartProject } from "@/app/backend/src/workspace/quick-start.js";

const FIXTURES = new URL("../../../../e2e/fixtures/", import.meta.url);
const fixture = (path: string) => readFileSync(new URL(path, FIXTURES), "utf8");

// The Quick Start project's Modules and Test Files, and the fixture each file is made from (backend.md 1.10), written
// by hand.
const EXPECTED = [
  {
    module: "1 Passing tests",
    files: [
      ["sign-in-and-see-products.yaml", "pass/sign-in.yaml"],
      ["buy-a-backpack.yaml", "pass/checkout.yaml"],
      ["locked-out-user-sees-an-error.yaml", "pass/locked-out.yaml"],
    ],
  },
  {
    module: "2 Failing tests - see why they fail",
    files: [
      ["wrong-total-fails-at-the-total.yaml", "fail/wrong-total.yaml"],
      ["missing-button-fails.yaml", "fail/missing-element.yaml"],
      ["unexpected-alert-fails.yaml", "fail/unexpected-dialog.yaml"],
    ],
  },
  {
    module: "3 Invalid files - fix the errors",
    files: [
      ["seven-errors-at-once.yaml", "invalid/multiple-errors.yaml"],
      ["yaml-syntax-error.yaml", "invalid/yaml-syntax.yaml"],
    ],
  },
  {
    module: "4 Jev - find and check by description",
    files: [
      ["find-elements-by-description.yaml", "jev/target-sign-in.yaml"],
      ["fall-back-from-a-stale-selector.yaml", "jev/stale-selector.yaml"],
      ["judge-a-true-statement.yaml", "jev/statement-holds.yaml"],
      ["judge-a-false-statement.yaml", "jev/statement-fails.yaml"],
    ],
  },
] as const;
const DEMO_APP_URL = "https://demo.example.com";
// Every file opens with a three-line header in place of the fixture's one-line "# Expect:" comment.
const SHIFT = 2;

type Created = {
  name: string;
  modules: { create: { name: string; testFiles: { create: { name: string; source: string }[] } }[] };
  variables: { create: { name: string; value: string }[] };
};

const project = () => quickStartProject(DEMO_APP_URL) as unknown as Created;
const testFiles = () => project().modules.create.flatMap((module) => module.testFiles.create);
const seeded = (name: string) => testFiles().find((testFile) => testFile.name === name)!.source;
const lines = (source: string) => analyze(source).diagnostics.map((diagnostic) => diagnostic.line);

describe("quickStartProject", () => {
  it("is named Quick Start", () => {
    expect(QUICK_START_NAME).toBe("Quick Start");
    expect(project().name).toBe("Quick Start");
  });

  it("has numbered Modules whose names say what each teaches, with self-explanatory file names", () => {
    expect(
      project().modules.create.map((module) => ({
        module: module.name,
        files: module.testFiles.create.map((testFile) => testFile.name),
      })),
    ).toEqual(EXPECTED.map(({ module, files }) => ({ module, files: files.map(([name]) => name) })));
  });

  it("lists the Modules in learning order when sorted by name, as the tree shows them", () => {
    const names = project().modules.create.map((module) => module.name);

    expect([...names].sort()).toEqual(names);
  });

  it("names every Module and Test File by the naming rules", () => {
    for (const module of project().modules.create) expect(module.name.length).toBeLessThanOrEqual(100);
    for (const testFile of testFiles()) {
      expect(testFile.name).toMatch(/^[A-Za-z0-9._-]+\.yaml$/);
      expect(testFile.name.length).toBeLessThanOrEqual(100);
    }
  });

  it("opens every file with a header that says what it does, what to expect, and what to try", () => {
    for (const testFile of testFiles()) {
      const [what, expected, tryIt] = testFile.source.split("\n");
      expect(what, testFile.name).toMatch(/^# \S/);
      expect(expected, testFile.name).toMatch(/^# Expect: \S/);
      expect(tryIt, testFile.name).toMatch(/^# Try: \S/);
    }
  });

  it("keeps each fixture's body unchanged after the header, so the fixtures stay the single source", () => {
    for (const { files } of EXPECTED)
      for (const [name, path] of files) {
        const source = fixture(path);
        expect(source.split("\n")[0], path).toMatch(/^# Expect:/);
        expect(seeded(name).split("\n").slice(3).join("\n"), name).toBe(source.split("\n").slice(1).join("\n"));
      }
  });

  it("keeps passing, failing, and Jev files valid and invalid files invalid", () => {
    const [passing, failing, invalid, jev] = project().modules.create;

    for (const testFile of [...passing!.testFiles.create, ...failing!.testFiles.create, ...jev!.testFiles.create])
      expect(analyze(testFile.source).diagnostics, testFile.name).toEqual([]);
    for (const testFile of invalid!.testFiles.create)
      expect(analyze(testFile.source).diagnostics.length, testFile.name).toBeGreaterThan(0);
  });

  it("points the invalid files' diagnostics at their lines after the header", () => {
    expect(lines(seeded("seven-errors-at-once.yaml"))).toEqual([5, 8, 9, 10, 15, 17, 20]);
    expect(lines(seeded("yaml-syntax-error.yaml"))).toEqual([9]);
    for (const [name, path] of EXPECTED[2].files)
      expect(lines(seeded(name))).toEqual(lines(fixture(path)).map((line) => line + SHIFT));
  });

  it("sets BASE to the Demo App URL and SWAG_PASSWORD to the Demo App's password", () => {
    expect(project().variables.create).toEqual([
      { name: "BASE", value: DEMO_APP_URL },
      { name: "SWAG_PASSWORD", value: "secret_sauce" },
    ]);
  });
});
