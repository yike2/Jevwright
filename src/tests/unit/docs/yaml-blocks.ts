import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { analyze } from "@/core/syntax/index.js";

/**
 * A ```yaml block of a Markdown page. A block is a whole test file, or a list of steps when its first line that is not
 * a comment starts with "- ". `<!-- invalid: E005, E007 -->` on the line before it says the block must fail with
 * exactly those codes, in order; such a block is followed by a ```text block with the Debug console's lines for it.
 */
export type YamlBlock = { page: string; line: number; source: string; invalid: string[] | null; debug: string | null };

const FENCE = /^```(\S*)/;

/** Every ```yaml block of `markdown`, with its marker and the ```text block after an invalid one. */
export function yamlBlocks(page: string, markdown: string): YamlBlock[] {
  const lines = markdown.split("\n");
  const blocks: YamlBlock[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    const lang = FENCE.exec(lines[i]!)?.[1];
    if (lang === undefined || lang === "") continue;
    const end = lines.findIndex((line, j) => j > i && line.startsWith("```"));
    if (end === -1) throw new Error(`${page}:${i + 1}: unclosed code block`);
    if (lang.startsWith("yaml")) {
      const marker = /<!--\s*invalid:\s*([^>]*?)\s*-->/.exec(lines[i - 1] ?? "")?.[1];
      const invalid = marker === undefined ? null : marker.split(/\s*,\s*/);
      blocks.push({
        page,
        line: i + 1,
        source: lines.slice(i + 1, end).join("\n") + "\n",
        invalid,
        debug: invalid === null ? null : textBlockAfter(lines, end + 1),
      });
    }
    i = end;
  }
  return blocks;
}

function textBlockAfter(lines: string[], from: number): string | null {
  let i = from;
  while (i < lines.length && lines[i]!.trim() === "") i += 1;
  if (!lines[i]?.startsWith("```text")) return null;
  const end = lines.findIndex((line, j) => j > i && line.startsWith("```"));
  return lines.slice(i + 1, end).join("\n");
}

/** The block as a test file: a list of steps goes under a name, a baseUrl and `steps:`. */
export function asTestFile(source: string): string {
  const first = source.split("\n").find((line) => line.trim() !== "" && !line.trimStart().startsWith("#"));
  if (!first?.startsWith("- ")) return source;
  const steps = source
    .split("\n")
    .map((line) => (line === "" ? line : `  ${line}`))
    .join("\n");
  return `name: "Example"\nbaseUrl: "https://example.com"\nsteps:\n${steps}`;
}

/** The Debug console's lines for a source, as the workspace shows them: "Line <line>: <message>". */
export function debugLines(source: string): string {
  return analyze(source)
    .diagnostics.map((d) => `Line ${d.line}: ${d.message}`)
    .join("\n");
}

/** Every Markdown file under `dir`, by its path relative to `dir`, skipping dot folders such as .vitepress. */
export function markdownFiles(dir: string): { path: string; text: string }[] {
  const found: { path: string; text: string }[] = [];
  const walk = (folder: string) => {
    for (const entry of readdirSync(folder, { withFileTypes: true })) {
      if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
      const full = join(folder, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(".md")) found.push({ path: relative(dir, full), text: readFileSync(full, "utf8") });
    }
  };
  walk(dir);
  return found.sort((a, b) => a.path.localeCompare(b.path));
}

/** The actions of the syntax, from the first column of the Action Fields table of syntax-analyzer.md 1.5. */
export function documentedActions(designDoc: string): string[] {
  const section = designDoc.slice(designDoc.indexOf("### 1.5 Action Fields"), designDoc.indexOf("### 1.6"));
  return section
    .split("\n")
    .filter((line) => /^\|\s*`/.test(line))
    .flatMap((line) => [...line.split("|")[1]!.matchAll(/`([A-Za-z]+)`/g)].map((match) => match[1]!));
}

/** The error codes of syntax-analyzer.md 3.3. */
export function documentedCodes(designDoc: string): string[] {
  return [...designDoc.matchAll(/^\|\s*`(E\d{3})`/gm)].map((match) => match[1]!);
}

/** The top-level fields of syntax-analyzer.md 1.3. */
export function documentedRootFields(designDoc: string): string[] {
  const section = designDoc.slice(designDoc.indexOf("### 1.3 File Structure"), designDoc.indexOf("### 1.4"));
  return [...section.matchAll(/^\|\s*`([A-Za-z]+)`/gm)].map((match) => match[1]!);
}
