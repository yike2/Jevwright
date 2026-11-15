import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { analyze } from "@/core/syntax/index.js";
import { QUICK_START_NAME, quickStartProject } from "@/app/backend/src/workspace/quick-start.js";

const FIXTURES = new URL("../../../../e2e/fixtures/", import.meta.url);
const fixture = (path: string) => readFileSync(new URL(path, FIXTURES), "utf8");

// The Quick Start project's Modules and the fixtures each one holds (backend.md 1.10), written by hand.
const EXPECTED = [
  { module: "1 Passing", files: ["pass/sign-in.yaml", "pass/checkout.yaml", "pass/locked-out.yaml"] },
  { module: "2 Failing", files: ["fail/wrong-total.yaml", "fail/missing-element.yaml", "fail/unexpected-dialog.yaml"] },
  { module: "3 Invalid", files: ["invalid/multiple-errors.yaml", "invalid/yaml-syntax.yaml"] },
  {
    module: "4 Jev",
    files: [
      "jev/target-sign-in.yaml",
      "jev/stale-selector.yaml",
      "jev/statement-holds.yaml",
      "jev/statement-fails.yaml",
    ],
  },
];
const DEMO_APP_URL = "https://demo.example.com";

type Created = {
  name: string;
  modules: { create: { name: string; testFiles: { create: { name: string; source: string }[] } }[] };
  variables: { create: { name: string; value: string }[] };
};

const project = (demoAppUrl: string) => quickStartProject(demoAppUrl) as unknown as Created;
const testFiles = () => project(DEMO_APP_URL).modules.create.flatMap((module) => module.testFiles.create);

describe("quickStartProject", () => {
  it("is named Quick Start", () => {
    expect(QUICK_START_NAME).toBe("Quick Start");
    expect(project(DEMO_APP_URL).name).toBe("Quick Start");
  });

  it("has numbered Passing, Failing, Invalid, and Jev Modules with the fixtures of each, named as the files", () => {
    expect(
      project(DEMO_APP_URL).modules.create.map((module) => ({
        module: module.name,
        files: module.testFiles.create.map((testFile) => testFile.name),
      })),
    ).toEqual(EXPECTED.map(({ module, files }) => ({ module, files: files.map((path) => path.split("/").pop()) })));
  });

  it("takes each source from its fixture unchanged, so the fixtures stay the single source", () => {
    const sources = testFiles().map((testFile) => testFile.source);

    expect(sources).toEqual(EXPECTED.flatMap(({ files }) => files.map(fixture)));
  });

  it("names every Test File by the naming rule", () => {
    for (const testFile of testFiles()) expect(testFile.name).toMatch(/^[A-Za-z0-9._-]+\.yaml$/);
  });

  it("lists the Modules in learning order when sorted by name, as the tree shows them", () => {
    const names = project(DEMO_APP_URL).modules.create.map((module) => module.name);

    expect([...names].sort()).toEqual(names);
  });

  it("keeps passing, failing, and Jev files valid and invalid files invalid", () => {
    const [passing, failing, invalid, jev] = project(DEMO_APP_URL).modules.create;

    for (const testFile of [...passing!.testFiles.create, ...failing!.testFiles.create, ...jev!.testFiles.create])
      expect(analyze(testFile.source).diagnostics, testFile.name).toEqual([]);
    for (const testFile of invalid!.testFiles.create)
      expect(analyze(testFile.source).diagnostics.length, testFile.name).toBeGreaterThan(0);
  });

  it("sets BASE to the Demo App URL and SWAG_PASSWORD to the Demo App's password", () => {
    expect(project(DEMO_APP_URL).variables.create).toEqual([
      { name: "BASE", value: DEMO_APP_URL },
      { name: "SWAG_PASSWORD", value: "secret_sauce" },
    ]);
  });
});
