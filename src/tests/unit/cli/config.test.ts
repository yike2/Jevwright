import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { loadEnvFile, readConfig } from "@/cli/config.js";

describe("readConfig", () => {
  it("returns apiKey and vars when OPENROUTER_API_KEY is set", () => {
    const env = {
      OPENROUTER_API_KEY: "key-123",
      FOO: "bar",
      BAZ: "qux",
    };

    expect(readConfig(env)).toEqual({
      ok: true,
      apiKey: "key-123",
      vars: {
        FOO: "bar",
        BAZ: "qux",
      },
    });
  });

  it("returns an error when OPENROUTER_API_KEY is missing", () => {
    const env = {
      FOO: "bar",
    };

    expect(readConfig(env)).toEqual({
      ok: false,
      error: "OPENROUTER_API_KEY is not set",
    });
  });

  it("returns an error when OPENROUTER_API_KEY is an empty string", () => {
    const env = {
      OPENROUTER_API_KEY: "",
      FOO: "bar",
    };

    expect(readConfig(env)).toEqual({
      ok: false,
      error: "OPENROUTER_API_KEY is not set",
    });
  });

  it("excludes OPENROUTER_API_KEY from vars", () => {
    const env = {
      OPENROUTER_API_KEY: "key-123",
      KEEP_ME: "yes",
    };

    expect(readConfig(env)).toEqual({
      ok: true,
      apiKey: "key-123",
      vars: {
        KEEP_ME: "yes",
      },
    });
  });

  it("excludes undefined values from vars", () => {
    const env: Readonly<Record<string, string | undefined>> = {
      OPENROUTER_API_KEY: "key-123",
      INCLUDED: "value",
      OMITTED: undefined,
    };

    expect(readConfig(env)).toEqual({
      ok: true,
      apiKey: "key-123",
      vars: {
        INCLUDED: "value",
      },
    });
  });
});

describe("loadEnvFile", () => {
  const uniqueVar = "JEVWRIGHT_CONFIG_TEST_LOAD_ENV_VAR";
  let tempDir: string | undefined;

  afterEach(async () => {
    delete process.env[uniqueVar];

    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
      tempDir = undefined;
    }
  });

  it("loads variables from .env when the file exists", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "jevwright-cli-config-"));
    await writeFile(join(tempDir, ".env"), `${uniqueVar}=loaded-value\n`, "utf8");

    delete process.env[uniqueVar];
    loadEnvFile(tempDir);

    expect(process.env[uniqueVar]).toBe("loaded-value");
  });

  it("does nothing when .env does not exist", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "jevwright-cli-config-"));

    expect(() => loadEnvFile(tempDir!)).not.toThrow();
  });
});
