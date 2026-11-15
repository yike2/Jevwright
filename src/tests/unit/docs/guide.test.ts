import { existsSync, readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { analyze } from "@/core/syntax/index.js";
import { isAction } from "@/core/syntax/steps.js";
import {
  asTestFile,
  debugLines,
  documentedActions,
  documentedCodes,
  documentedRootFields,
  markdownFiles,
  yamlBlocks,
} from "./yaml-blocks.js";

const ROOT = new URL("../../../../", import.meta.url);
const SOURCE = fileURLToPath(new URL("docs/guide-src/", ROOT));
const DESIGN = readFileSync(new URL("docs/tech/syntax-analyzer.md", ROOT), "utf8");

const pages = existsSync(SOURCE) ? markdownFiles(SOURCE) : [];
const page = (path: string) => pages.find((p) => p.path === path)?.text ?? "";
const blocks = pages.flatMap((p) => yamlBlocks(p.path, p.text));

// The user guide cannot drift from core/syntax: every example is checked by the Syntax Analyzer (issue #119).
describe("user guide", () => {
  it("has the pages of the guide", () => {
    expect(pages.map((p) => p.path)).toEqual(
      expect.arrayContaining([
        "index.md",
        "guide/introduction.md",
        "guide/quick-start.md",
        "guide/workflow.md",
        "guide/workspace.md",
        "guide/agent-skill.md",
        "reference/test-file.md",
        "reference/actions.md",
        "reference/locating.md",
        "reference/assertions.md",
        "reference/diagnostics.md",
      ]),
    );
  });

  it("has YAML examples that the Syntax Analyzer accepts, unless marked invalid", () => {
    expect(blocks.length).toBeGreaterThan(20);
    for (const block of blocks) {
      const diagnostics = analyze(asTestFile(block.source)).diagnostics;
      expect(
        diagnostics.map((d) => d.code),
        `${block.page}:${block.line}`,
      ).toEqual(block.invalid ?? []);
    }
  });

  it("shows the real Debug console lines after every invalid example", () => {
    const invalid = blocks.filter((block) => block.invalid !== null);
    expect(invalid.length).toBeGreaterThan(0);
    for (const block of invalid)
      expect(block.debug, `${block.page}:${block.line}`).toBe(debugLines(asTestFile(block.source)));
  });

  it("documents every action with a heading and a valid example", () => {
    const actions = documentedActions(DESIGN);
    expect(actions).toHaveLength(15);
    const reference = page("reference/actions.md");
    const valid = yamlBlocks("reference/actions.md", reference).filter((block) => block.invalid === null);
    for (const action of actions) {
      expect(isAction(action), action).toBe(true);
      expect(reference, action).toContain(`### \`${action}\``);
      expect(
        valid.some((block) => analyze(asTestFile(block.source)).testCase?.steps.some((s) => s.action === action)),
        action,
      ).toBe(true);
    }
  });

  it("documents every top-level field of a test file", () => {
    const fields = documentedRootFields(DESIGN);
    expect(fields).toEqual(expect.arrayContaining(["name", "baseUrl", "cookies", "sessionStorage", "steps"]));
    for (const field of fields) expect(page("reference/test-file.md"), field).toContain(`\`${field}\``);
  });

  it("explains every diagnostic code with an example that produces it", () => {
    const codes = documentedCodes(DESIGN);
    expect(codes).toHaveLength(9);
    const reference = page("reference/diagnostics.md");
    const examples = yamlBlocks("reference/diagnostics.md", reference);
    for (const code of codes) {
      expect(reference, code).toContain(`## ${code}`);
      expect(
        examples.some((block) => block.invalid?.includes(code)),
        code,
      ).toBe(true);
    }
  });

  it("describes the web workspace only, with folders and no Modules", () => {
    for (const { path, text } of pages) {
      expect(text, path).not.toMatch(/\bCLI\b|jevwright (validate|run)|pnpm|npx|\.env\b|\bModules?\b/);
    }
  });

  it("names the Demo App, its users and the Quick Start files on the Quick start page", () => {
    const quickStart = page("guide/quick-start.md");
    for (const text of [
      "https://demo.94.72.126.118.sslip.io",
      "standard_user",
      "secret_sauce",
      "BASE",
      "sign-in-and-see-products.yaml",
      "find-elements-by-description.yaml",
      "judge-a-true-statement.yaml",
      "buy-a-backpack.yaml",
      "public",
    ])
      expect(quickStart, text).toContain(text);
  });

  it("installs the Agent Skill with one prompt that fetches every skill file from main", () => {
    const install = page("guide/agent-skill.md");
    const skill = new URL("skills/jevwright-test-files/", ROOT);
    const files = [
      "SKILL.md",
      "references/syntax.md",
      ...readdirSync(new URL("examples/", skill)).map((name) => `examples/${name}`),
    ];
    const raw = "https://raw.githubusercontent.com/yike2/Jevwright/main/skills/jevwright-test-files/";
    const prompt = /```text\n([\s\S]*?)\n```/.exec(install)?.[1] ?? "";

    for (const file of files) expect(prompt, file).toContain(`${raw}${file}`);
    for (const match of prompt.matchAll(/https:\/\/raw\.githubusercontent\.com\/yike2\/Jevwright\/main\/(\S+)/g))
      expect(existsSync(new URL(match[1]!, ROOT)), match[1]).toBe(true);
    expect(install).not.toMatch(/\.(claude|github|agents)\/skills/);
    expect(install).toContain("Debug console");
  });
});
