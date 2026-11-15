import { existsSync, readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { analyze } from "@/core/syntax/index.js";
import { asTestFile, documentedActions, markdownFiles, yamlBlocks } from "./yaml-blocks.js";

const ROOT = new URL("../../../../", import.meta.url);
const SKILL_DIR = new URL("skills/jevwright-test-files/", ROOT);
const EXAMPLES = new URL("examples/", SKILL_DIR);
const DESIGN = readFileSync(new URL("docs/tech/syntax-analyzer.md", ROOT), "utf8");

const read = (url: URL) => (existsSync(url) ? readFileSync(url, "utf8") : "");
const skill = read(new URL("SKILL.md", SKILL_DIR));
const docs = existsSync(SKILL_DIR) ? markdownFiles(fileURLToPath(SKILL_DIR)) : [];
const allText = docs.map((doc) => doc.text).join("\n");
const examples = existsSync(EXAMPLES) ? readdirSync(EXAMPLES).filter((name) => name.endsWith(".yaml")) : [];

// The Agent Skill teaches other people's agents our syntax, so it is checked like the user guide (issue #119).
describe("Agent Skill jevwright-test-files", () => {
  it("opens with Agent Skills front matter: its folder's name and a description", () => {
    const match = /^---\n([\s\S]*?)\n---\n/.exec(skill);
    expect(match).not.toBeNull();
    const front = parse(match![1]!) as Record<string, unknown>;
    expect(front.name).toBe("jevwright-test-files");
    expect(typeof front.description).toBe("string");
    expect((front.description as string).length).toBeGreaterThan(50);
    expect((front.description as string).length).toBeLessThanOrEqual(1024);
  });

  it("ships example files that the Syntax Analyzer accepts, each linked from the skill", () => {
    expect(examples.length).toBeGreaterThanOrEqual(4);
    for (const name of examples) {
      const result = analyze(readFileSync(new URL(name, EXAMPLES), "utf8"));
      expect(result.diagnostics, name).toEqual([]);
      expect(allText, name).toContain(`examples/${name}`);
    }
  });

  it("uses browser state to skip a sign-in page in an example", () => {
    const sources = examples.map((name) => analyze(readFileSync(new URL(name, EXAMPLES), "utf8")).testCase!);
    expect(sources.some((testCase) => testCase.cookies !== undefined)).toBe(true);
    expect(sources.some((testCase) => testCase.headers !== undefined || testCase.localStorage !== undefined)).toBe(
      true,
    );
  });

  it("has YAML blocks that the Syntax Analyzer accepts, unless marked invalid", () => {
    const blocks = docs.flatMap((doc) => yamlBlocks(doc.path, doc.text));
    expect(blocks.length).toBeGreaterThan(5);
    for (const block of blocks)
      expect(
        analyze(asTestFile(block.source)).diagnostics.map((d) => d.code),
        `${block.page}:${block.line}`,
      ).toEqual(block.invalid ?? []);
  });

  it("covers every action, every top-level browser state field, and the refused planning keys", () => {
    for (const action of documentedActions(DESIGN)) expect(allText, action).toContain(`\`${action}\``);
    for (const field of ["headers", "cookies", "localStorage", "sessionStorage", "statement", "target", "{{"])
      expect(allText, field).toContain(field);
    expect(allText).toContain("`aiAct`");
    expect(allText).toContain("Debug console");
  });

  it("links the guide and the main branch sources, and every link points at a real file", () => {
    const repoLinks = [
      ...allText.matchAll(/https:\/\/github\.com\/yike2\/Jevwright\/(?:blob|tree)\/main\/([^\s)#]+)/g),
    ];
    const paths = repoLinks.map((match) => match[1]!);
    expect(paths).toEqual(
      expect.arrayContaining([
        "docs/tech/syntax-analyzer.md",
        "src/core/syntax",
        "src/tests/integration/core/syntax/fixtures/valid",
        "src/tests/integration/core/syntax/fixtures/invalid",
      ]),
    );
    for (const path of paths) expect(existsSync(new URL(path, ROOT)), path).toBe(true);

    const guideLinks = [...allText.matchAll(/https:\/\/yike2\.github\.io\/Jevwright\/guide\/([^\s)#]*)/g)];
    const pages = guideLinks.map((match) => match[1]!);
    expect(pages).toEqual(expect.arrayContaining(["reference/actions.html", "guide/workflow.html"]));
    for (const page of pages)
      expect(existsSync(new URL(`docs/guide-src/${page.replace(/\.html$/, ".md") || "index.md"}`, ROOT)), page).toBe(
        true,
      );
  });

  it("describes the web workspace only", () => {
    expect(allText).not.toMatch(/\bCLI\b|jevwright (validate|run)|pnpm|npx|\.env\b|\bModules?\b/);
  });
});
