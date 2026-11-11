import { describe, expect, it } from "vitest";
import { parseEnv } from "@/app/backend/src/env.js";

const required = {
  DATABASE_URL: "postgresql://jevwright:secret@localhost:5432/jevwright",
  JWT_SECRET: "x".repeat(32),
  OPENROUTER_API_KEY: "sk-or-test",
  CORS_ORIGIN: "http://localhost:3000",
};

describe("parseEnv", () => {
  it("reads the required variables and fills in the defaults", () => {
    expect(parseEnv(required)).toEqual({
      ok: true,
      env: { ...required, RUNS_DIR: "./data/runs", RUN_CONCURRENCY: 1, PORT: 4000 },
    });
  });

  it("names every missing or invalid variable, never its value", () => {
    const result = parseEnv({ ...required, JWT_SECRET: "too-short", DATABASE_URL: undefined, RUN_CONCURRENCY: "9" });

    expect(result.ok).toBe(false);
    expect(!result.ok && result.problems.map((problem) => problem.split(":")[0]).sort()).toEqual([
      "DATABASE_URL",
      "JWT_SECRET",
      "RUN_CONCURRENCY",
    ]);
    expect(JSON.stringify(result)).not.toContain("too-short");
  });

  it("takes an optional ws:// BROWSER_ENDPOINT", () => {
    expect(parseEnv(required)).toMatchObject({ ok: true, env: { BROWSER_ENDPOINT: undefined } });
    expect(parseEnv({ ...required, BROWSER_ENDPOINT: "ws://browser:3000/" })).toMatchObject({
      ok: true,
      env: { BROWSER_ENDPOINT: "ws://browser:3000/" },
    });
    const invalid = parseEnv({ ...required, BROWSER_ENDPOINT: "http://browser:3000/" });
    expect(!invalid.ok && invalid.problems.map((problem) => problem.split(":")[0])).toEqual(["BROWSER_ENDPOINT"]);
  });
});
