import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { envDirsFor, readConfig, readEnvFile, varsFor } from "@/cli/config.js";

const tempDirs: string[] = [];

async function makeTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "jevwright-cli-config-"));
  tempDirs.push(dir);
  return dir;
}

/** Writes `.env` files at the given directories under `cwd`, e.g. { "": "A=1", "suite/login": "A=2" }. */
async function writeEnvFiles(cwd: string, files: Record<string, string>): Promise<void> {
  for (const [dir, text] of Object.entries(files)) {
    await mkdir(join(cwd, dir), { recursive: true });
    await writeFile(join(cwd, dir, ".env"), text);
  }
}

afterEach(async () => {
  await Promise.allSettled(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("readEnvFile", () => {
  it("parses the .env in a directory", async () => {
    const cwd = await makeTempDir();
    await writeEnvFiles(cwd, { "": 'BASE=https://shop.example\n# a comment\nQUOTED="a b"\n' });

    expect(readEnvFile(cwd)).toEqual({ BASE: "https://shop.example", QUOTED: "a b" });
  });

  it("answers no variables when the directory has no .env", async () => {
    expect(readEnvFile(await makeTempDir())).toEqual({});
  });

  it("does not load the variables into process.env", async () => {
    const cwd = await makeTempDir();
    await writeEnvFiles(cwd, { "": "JEVWRIGHT_CONFIG_TEST_NOT_LOADED=yes\n" });

    readEnvFile(cwd);

    expect(process.env.JEVWRIGHT_CONFIG_TEST_NOT_LOADED).toBeUndefined();
  });
});

describe("envDirsFor", () => {
  it("lists the working directory, then each directory down to the file's own", () => {
    expect(envDirsFor("/work", "suite/login/admin.yaml")).toEqual(["/work", "/work/suite", "/work/suite/login"]);
  });

  it("lists only the working directory for a file directly in it", () => {
    expect(envDirsFor("/work", "smoke.yaml")).toEqual(["/work"]);
  });
});

describe("varsFor", () => {
  it("reads a single .env in the working directory, as for every file", async () => {
    const cwd = await makeTempDir();
    await writeEnvFiles(cwd, { "": "BASE=https://shop.example\n" });

    expect(varsFor(cwd, "suite/login.yaml", {})).toEqual({ BASE: "https://shop.example" });
  });

  it("merges every .env from the working directory down to the file's directory", async () => {
    const cwd = await makeTempDir();
    await writeEnvFiles(cwd, { "": "BASE=https://shop.example\n", suite: "USER=ada\n", "suite/login": "ROLE=admin\n" });

    expect(varsFor(cwd, "suite/login/admin.yaml", {})).toEqual({
      BASE: "https://shop.example",
      USER: "ada",
      ROLE: "admin",
    });
  });

  it("lets a nearer .env win over one further up", async () => {
    const cwd = await makeTempDir();
    await writeEnvFiles(cwd, { "": "BASE=https://top.example\n", suite: "BASE=https://suite.example\n" });

    expect(varsFor(cwd, "suite/login.yaml", {})).toEqual({ BASE: "https://suite.example" });
  });

  it("gives each file only the .env files on its own way down", async () => {
    const cwd = await makeTempDir();
    await writeEnvFiles(cwd, { cart: "BASE=https://cart.example\n", blog: "BASE=https://blog.example\n" });

    expect(varsFor(cwd, "cart/add.yaml", {})).toEqual({ BASE: "https://cart.example" });
    expect(varsFor(cwd, "blog/post.yaml", {})).toEqual({ BASE: "https://blog.example" });
    expect(varsFor(cwd, "smoke.yaml", {})).toEqual({});
  });

  it("lets a variable already in the shell win over every .env", async () => {
    const cwd = await makeTempDir();
    await writeEnvFiles(cwd, { "": "BASE=https://top.example\n", suite: "BASE=https://suite.example\n" });

    expect(varsFor(cwd, "suite/login.yaml", { BASE: "https://shell.example" })).toEqual({
      BASE: "https://shell.example",
    });
  });

  it("passes the shell's variables, without unset ones", () => {
    expect(varsFor("/no/such/dir", "a.yaml", { FOO: "bar", UNSET: undefined })).toEqual({ FOO: "bar" });
  });

  it("never reads a .env above the working directory", async () => {
    const parent = await makeTempDir();
    await writeEnvFiles(parent, { "": "ABOVE=yes\n" });
    await mkdir(join(parent, "work"));

    expect(varsFor(join(parent, "work"), "a.yaml", {})).toEqual({});
  });

  it("never passes OPENROUTER_API_KEY as a test variable, from the shell or a .env", async () => {
    const cwd = await makeTempDir();
    await writeEnvFiles(cwd, { suite: "OPENROUTER_API_KEY=from-file\nKEEP=yes\n" });

    expect(varsFor(cwd, "suite/a.yaml", { OPENROUTER_API_KEY: "from-shell" })).toEqual({ KEEP: "yes" });
  });
});

describe("readConfig", () => {
  it("takes OPENROUTER_API_KEY from the shell first", async () => {
    const cwd = await makeTempDir();
    await writeEnvFiles(cwd, { "": "OPENROUTER_API_KEY=from-file\n" });

    expect(readConfig(cwd, { OPENROUTER_API_KEY: "from-shell" })).toEqual({ ok: true, apiKey: "from-shell" });
  });

  it("takes OPENROUTER_API_KEY from the working directory's .env when the shell has none", async () => {
    const cwd = await makeTempDir();
    await writeEnvFiles(cwd, { "": "OPENROUTER_API_KEY=from-file\n" });

    expect(readConfig(cwd, {})).toEqual({ ok: true, apiKey: "from-file" });
  });

  it("returns an error when OPENROUTER_API_KEY is missing, also from a .env below the working directory", async () => {
    const cwd = await makeTempDir();
    await writeEnvFiles(cwd, { suite: "OPENROUTER_API_KEY=too-deep\n" });

    expect(readConfig(cwd, { FOO: "bar" })).toEqual({ ok: false, error: "OPENROUTER_API_KEY is not set" });
  });

  it("returns an error when OPENROUTER_API_KEY is an empty string", async () => {
    const cwd = await makeTempDir();

    expect(readConfig(cwd, { OPENROUTER_API_KEY: "" })).toEqual({
      ok: false,
      error: "OPENROUTER_API_KEY is not set",
    });
  });
});
