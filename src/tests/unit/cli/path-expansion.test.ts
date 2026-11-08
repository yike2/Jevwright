import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { expandPaths } from "@/cli/path-expansion.js";

const tempDirs: string[] = [];

async function makeTempDir(): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), "jevwright-path-expansion-"));
    tempDirs.push(dir);
    return dir;
}

afterEach(async () => {
    await Promise.allSettled(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("expandPaths", () => {
    it("returns the relative .yaml files for a valid nested directory", async () => {
        const cwd = await makeTempDir();
        await mkdir(join(cwd, "nested", "sub"), { recursive: true });
        await writeFile(join(cwd, "nested", "alpha.yaml"), "alpha");
        await writeFile(join(cwd, "nested", "sub", "beta.yaml"), "beta");

        await expect(expandPaths(["nested"], cwd)).resolves.toEqual({
            ok: true,
            files: ["nested/alpha.yaml", "nested/sub/beta.yaml"],
        });
    });

    it("accepts a direct file path whatever its extension", async () => {
        const cwd = await makeTempDir();
        await writeFile(join(cwd, "config.yml"), "---");

        await expect(expandPaths(["config.yml"], cwd)).resolves.toEqual({
            ok: true,
            files: ["config.yml"],
        });
    });

    it("expands a glob to the matching files", async () => {
        const cwd = await makeTempDir();
        await mkdir(join(cwd, "nested"), { recursive: true });
        await writeFile(join(cwd, "one.yaml"), "one");
        await writeFile(join(cwd, "nested", "two.yaml"), "two");
        await writeFile(join(cwd, "nested", "three.txt"), "three");

        await expect(expandPaths(["*.yaml", "nested/*.yaml"], cwd)).resolves.toEqual({
            ok: true,
            files: ["nested/two.yaml", "one.yaml"],
        });
    });

    it("ignores .yml and .txt files when scanning a directory", async () => {
        const cwd = await makeTempDir();
        await mkdir(join(cwd, "nested"), { recursive: true });
        await writeFile(join(cwd, "nested", "alpha.yaml"), "alpha");
        await writeFile(join(cwd, "nested", "beta.yml"), "beta");
        await writeFile(join(cwd, "nested", "gamma.txt"), "gamma");

        await expect(expandPaths(["nested"], cwd)).resolves.toEqual({
            ok: true,
            files: ["nested/alpha.yaml"],
        });
    });

    it("ignores directory matches returned by a glob and keeps only files", async () => {
        const cwd = await makeTempDir();
        await mkdir(join(cwd, "nested"), { recursive: true });
        await writeFile(join(cwd, "one.yaml"), "one");
        await writeFile(join(cwd, "nested", "two.yaml"), "two");

        await expect(expandPaths(["**"], cwd)).resolves.toEqual({
            ok: true,
            files: ["nested/two.yaml", "one.yaml"],
        });
    });

    it("deduplicates a file reached directly and through its directory", async () => {
        const cwd = await makeTempDir();
        await mkdir(join(cwd, "nested"), { recursive: true });
        await writeFile(join(cwd, "nested", "dup.yaml"), "dup");

        await expect(expandPaths(["nested", "nested/dup.yaml"], cwd)).resolves.toEqual({
            ok: true,
            files: ["nested/dup.yaml"],
        });
    });

    it("sorts the final file list, not creation order", async () => {
        const cwd = await makeTempDir();
        await mkdir(join(cwd, "zeta"), { recursive: true });
        await writeFile(join(cwd, "zeta", "b.yaml"), "b");
        await writeFile(join(cwd, "alpha.yaml"), "alpha");
        await writeFile(join(cwd, "zeta", "a.yaml"), "a");

        await expect(expandPaths(["."], cwd)).resolves.toEqual({
            ok: true,
            files: ["alpha.yaml", "zeta/a.yaml", "zeta/b.yaml"],
        });
    });

    it("accepts an absolute file path inside cwd and returns it relative to cwd", async () => {
        const cwd = await makeTempDir();
        const absolute = join(cwd, "nested", "path.yaml");
        await mkdir(join(cwd, "nested"), { recursive: true });
        await writeFile(absolute, "path");

        await expect(expandPaths([absolute], cwd)).resolves.toEqual({
            ok: true,
            files: ["nested/path.yaml"],
        });
    });

    it("returns a usage error when a direct file path does not exist", async () => {
        const cwd = await makeTempDir();

        await expect(expandPaths(["missing.yaml"], cwd)).resolves.toEqual({
            ok: false,
            error: "File not found: missing.yaml",
        });
    });

    it("returns a usage error when a directory contains no .yaml files", async () => {
        const cwd = await makeTempDir();
        await mkdir(join(cwd, "empty"), { recursive: true });
        await writeFile(join(cwd, "empty", "notes.txt"), "notes");

        await expect(expandPaths(["empty"], cwd)).resolves.toEqual({
            ok: false,
            error: "No .yaml files found in empty",
        });
    });

    it("returns a usage error when a glob matches nothing", async () => {
        const cwd = await makeTempDir();
        await writeFile(join(cwd, "one.txt"), "one");

        await expect(expandPaths(["*.yaml"], cwd)).resolves.toEqual({
            ok: false,
            error: "No files match *.yaml",
        });
    });

    it("returns a usage error when a glob or directory reaches outside the working directory", async () => {
        const parent = await makeTempDir();
        const cwd = join(parent, "workspace");
        await mkdir(cwd, { recursive: true });
        const outside = join(parent, "outside.yaml");
        await writeFile(outside, "outside");

        await expect(expandPaths(["../*.yaml"], cwd)).resolves.toEqual({
            ok: false,
            error: "File is outside the working directory: ../*.yaml",
        });

        await expect(expandPaths([".."], cwd)).resolves.toEqual({
            ok: false,
            error: "File is outside the working directory: ..",
        });
    });

    it("returns a usage error when a file is outside the working directory", async () => {
        const parent = await makeTempDir();
        const cwd = join(parent, "workspace");
        await mkdir(cwd, { recursive: true });
        const outside = join(parent, "outside.yaml");
        await writeFile(outside, "outside");

        await expect(expandPaths([outside], cwd)).resolves.toEqual({
            ok: false,
            error: `File is outside the working directory: ${outside}`,
        });
    });
});
