import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { analyze } from "@/core/syntax/index.js";
import { QUICK_START_NAME, quickStartProject } from "@/app/backend/src/workspace/quick-start.js";

const FIXTURES = new URL("../../../../e2e/fixtures/", import.meta.url);
const fixture = (path: string) => readFileSync(new URL(path, FIXTURES), "utf8");

// The Quick Start project's folders and Test Files, and the fixture each file is made from (backend.md 1.10), written
// by hand.
const EXPECTED = [
  {
    folder: "1 Passing tests",
    files: [
      ["sign-in-and-see-products.yaml", "pass/sign-in.yaml"],
      ["buy-a-backpack.yaml", "pass/checkout.yaml"],
      ["locked-out-user-sees-an-error.yaml", "pass/locked-out.yaml"],
    ],
  },
  {
    folder: "2 Failing tests - see why they fail",
    files: [
      ["wrong-total-fails-at-the-total.yaml", "fail/wrong-total.yaml"],
      ["missing-button-fails.yaml", "fail/missing-element.yaml"],
      ["unexpected-alert-fails.yaml", "fail/unexpected-dialog.yaml"],
    ],
  },
  {
    folder: "3 Invalid files - fix the errors",
    files: [
      ["seven-errors-at-once.yaml", "invalid/multiple-errors.yaml"],
      ["yaml-syntax-error.yaml", "invalid/yaml-syntax.yaml"],
    ],
  },
  {
    folder: "4 Jev - find and check by description",
    files: [
      ["find-and-check-with-jev.yaml", "jev/find-and-check.yaml"],
      ["find-elements-by-description.yaml", "jev/target-add-to-cart.yaml"],
      ["fall-back-from-a-stale-selector.yaml", "jev/stale-selector.yaml"],
      ["judge-a-true-statement.yaml", "jev/statement-holds.yaml"],
      ["judge-a-false-statement.yaml", "jev/statement-fails.yaml"],
    ],
  },
] as const;
// The files whose point is the sign-in page: the one that signs in through it, the refused sign-in, and Jev finding
// the Login button. Every other file that needs a signed-in user starts with the Demo App's session cookie (#121).
const USES_SIGN_IN_PAGE = [
  "sign-in-and-see-products.yaml",
  "locked-out-user-sees-an-error.yaml",
  "fall-back-from-a-stale-selector.yaml",
];
const STARTS_SIGNED_IN = [
  "buy-a-backpack.yaml",
  "wrong-total-fails-at-the-total.yaml",
  "find-and-check-with-jev.yaml",
  "find-elements-by-description.yaml",
  "judge-a-true-statement.yaml",
  "judge-a-false-statement.yaml",
];
const DEMO_APP_URL = "https://demo.example.com";
// Every file opens with a three-line header in place of the fixture's one-line "# Expect:" comment.
const SHIFT = 2;

type Created = {
  id: string;
  name: string;
  folders: {
    create: { name: string; testFiles: { create: { name: string; source: string; projectId: string }[] } }[];
  };
  variables: { create: { name: string; value: string }[] };
};

const project = () => quickStartProject(DEMO_APP_URL) as unknown as Created;
const testFiles = () => project().folders.create.flatMap((folder) => folder.testFiles.create);
const seeded = (name: string) => testFiles().find((testFile) => testFile.name === name)!.source;
const lines = (source: string) => analyze(source).diagnostics.map((diagnostic) => diagnostic.line);

describe("quickStartProject", () => {
  it("is named Quick Start", () => {
    expect(QUICK_START_NAME).toBe("Quick Start");
    expect(project().name).toBe("Quick Start");
  });

  it("has numbered folders whose names say what each teaches, with self-explanatory file names", () => {
    expect(
      project().folders.create.map((folder) => ({
        folder: folder.name,
        files: folder.testFiles.create.map((testFile) => testFile.name),
      })),
    ).toEqual(EXPECTED.map(({ folder, files }) => ({ folder, files: files.map(([name]) => name) })));
  });

  it("puts every Test File in the Project it creates, whose id it sets", () => {
    const created = project();

    expect(created.id).toMatch(/^[0-9a-f-]{36}$/);
    for (const folder of created.folders.create)
      for (const testFile of folder.testFiles.create) expect(testFile.projectId, testFile.name).toBe(created.id);
  });

  it("gives every Quick Start project its own id", () => {
    expect(project().id).not.toBe(project().id);
  });

  it("lists the folders in learning order when sorted by name, as the tree shows them", () => {
    const names = project().folders.create.map((folder) => folder.name);

    expect([...names].sort()).toEqual(names);
  });

  it("names every folder and Test File by the naming rules", () => {
    for (const folder of project().folders.create) expect(folder.name.length).toBeLessThanOrEqual(100);
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
    const [passing, failing, invalid, jev] = project().folders.create;

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

  it("starts the files that need a signed-in user on the product list, with the session cookie explained at the top", () => {
    for (const name of STARTS_SIGNED_IN) {
      const source = seeded(name);
      expect(source.split("\n")[3], name).toMatch(/^# .*session-username.* cookie/);
      expect(source, name).toContain('\ncookies:\n  session-username: "standard_user"\n');
      expect(source, name).toContain('\nsteps:\n  - open:\n      url: "/inventory.html"\n');
      expect(source, name).not.toContain("{{SWAG_PASSWORD}}");
    }
  });

  it("signs in through the sign-in page only in the files whose point is that page, and in exactly one successfully", () => {
    const typesPassword = testFiles().filter((testFile) => testFile.source.includes("{{SWAG_PASSWORD}}"));
    const reachesProducts = typesPassword.filter((testFile) => testFile.source.includes('url: "**/inventory.html"'));

    expect(typesPassword.map((testFile) => testFile.name).sort()).toEqual([...USES_SIGN_IN_PAGE].sort());
    expect(reachesProducts.map((testFile) => testFile.name)).toEqual([
      "sign-in-and-see-products.yaml",
      "fall-back-from-a-stale-selector.yaml",
    ]);
    for (const testFile of typesPassword) expect(testFile.source, testFile.name).not.toContain("cookies:");
  });

  it("sets BASE to the Demo App URL and SWAG_PASSWORD to the Demo App's password", () => {
    expect(project().variables.create).toEqual([
      { name: "BASE", value: DEMO_APP_URL },
      { name: "SWAG_PASSWORD", value: "secret_sauce" },
    ]);
  });
});
