import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// The fonts are self-hosted so `next build` never downloads them (design-system.md 3).
const frontend = fileURLToPath(new URL("../../../../app/frontend/", import.meta.url));
const app = join(frontend, "app");

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === "node_modules" || entry.name === ".next" ? [] : sources(path);
    return /\.(ts|tsx)$/.test(entry.name) ? [path] : [];
  });
}

describe("fonts", () => {
  it("no frontend source imports next/font/google, which fetches fonts at build time", () => {
    const offenders = sources(frontend).filter((file) => readFileSync(file, "utf8").includes("next/font/google"));
    expect(offenders).toEqual([]);
  });

  it("the layout loads every font file from app/fonts, which also holds the font license", () => {
    const layout = readFileSync(join(app, "layout.tsx"), "utf8");
    const files = [...layout.matchAll(/path: "\.\/(fonts\/[\w-]+\.woff2)"/g)].map((m) => m[1]!);
    expect(files).toHaveLength(6);
    for (const file of files) expect(existsSync(join(app, file)), file).toBe(true);
    expect(existsSync(join(app, "fonts", "LICENSE.txt"))).toBe(true);
  });
});
