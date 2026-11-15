import { describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";
import { ENV_FILE, parseEnv } from "@/app/backend/src/env.js";

const required = {
  DATABASE_URL: "postgresql://jevwright:secret@localhost:5432/jevwright",
  JWT_SECRET: "x".repeat(32),
  OPENROUTER_API_KEY: "sk-or-test",
  CORS_ORIGIN: "http://localhost:3000",
  DEMO_APP_URL: "https://demo.example.com",
};

describe("parseEnv", () => {
  it("reads the required variables and fills in the defaults", () => {
    expect(parseEnv(required)).toEqual({
      ok: true,
      env: { ...required, RUNS_DIR: "./data/runs", RUN_CONCURRENCY: 1, PORT: 4000, HOST: "127.0.0.1" },
      runNetwork: "public",
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

  it("listens on 127.0.0.1 unless HOST says otherwise, so a local backend is not reachable from the network", () => {
    expect(parseEnv({ ...required, HOST: "0.0.0.0" })).toMatchObject({ ok: true, env: { HOST: "0.0.0.0" } });
    const empty = parseEnv({ ...required, HOST: "" });
    expect(!empty.ok && empty.problems.map((problem) => problem.split(":")[0])).toEqual(["HOST"]);
  });

  it("takes an optional ws:// BROWSER_ENDPOINT", () => {
    const unset = parseEnv(required);
    expect(unset.ok && unset.env.BROWSER_ENDPOINT).toBeUndefined();
    expect(parseEnv({ ...required, BROWSER_ENDPOINT: "ws://browser:3000/" })).toMatchObject({
      ok: true,
      env: { BROWSER_ENDPOINT: "ws://browser:3000/" },
    });
    const invalid = parseEnv({ ...required, BROWSER_ENDPOINT: "http://browser:3000/" });
    expect(!invalid.ok && invalid.problems.map((problem) => problem.split(":")[0])).toEqual(["BROWSER_ENDPOINT"]);
  });

  it("requires DEMO_APP_URL, the Quick Start project's BASE, outside dev mode, also when it is empty", () => {
    for (const value of [undefined, ""]) {
      const result = parseEnv({ ...required, DEMO_APP_URL: value });
      expect(!result.ok && result.problems.map((problem) => problem.split(":")[0])).toEqual(["DEMO_APP_URL"]);
    }
  });

  it("uses the local Demo App as DEMO_APP_URL in dev mode when it is unset or empty", () => {
    for (const value of [undefined, ""]) {
      expect(parseEnv({ ...required, DEMO_APP_URL: value }, { dev: true })).toMatchObject({
        ok: true,
        env: { DEMO_APP_URL: "http://127.0.0.1:8080" },
      });
    }
  });

  it("keeps a DEMO_APP_URL that is set, in dev mode too", () => {
    expect(parseEnv({ ...required, DEMO_APP_URL: "https://demo.example.com" }, { dev: true })).toMatchObject({
      ok: true,
      env: { DEMO_APP_URL: "https://demo.example.com" },
    });
  });

  it("refuses a DEMO_APP_URL that is not an http(s) URL", () => {
    for (const value of ["demo.example.com", "ftp://demo.example.com"]) {
      const invalid = parseEnv({ ...required, DEMO_APP_URL: value });
      expect(!invalid.ok && invalid.problems.map((problem) => problem.split(":")[0])).toEqual(["DEMO_APP_URL"]);
    }
  });

  it("lets dev mode's Runs reach any address, local pages included", () => {
    expect(parseEnv(required, { dev: true })).toMatchObject({ ok: true, runNetwork: "any" });
  });

  it.each(["127.0.0.1", "127.0.0.2", "::1", "localhost"])("allows dev mode on the loopback HOST %s", (host) => {
    expect(parseEnv({ ...required, HOST: host }, { dev: true })).toMatchObject({ ok: true, runNetwork: "any" });
  });

  it("refuses dev mode on a HOST other machines can reach, since its Runs could reach this machine", () => {
    const result = parseEnv({ ...required, HOST: "0.0.0.0" }, { dev: true });

    expect(result.ok).toBe(false);
    expect(!result.ok && result.problems).toEqual([expect.stringMatching(/^HOST: .*dev mode/)]);
  });

  it("keeps Runs on public addresses outside dev mode, whatever HOST is", () => {
    expect(parseEnv({ ...required, HOST: "127.0.0.1" })).toMatchObject({ ok: true, runNetwork: "public" });
    expect(parseEnv({ ...required, HOST: "0.0.0.0" })).toMatchObject({ ok: true, runNetwork: "public" });
  });

  it("reads the repository's .env, so the backend finds it from any working directory", () => {
    expect(fileURLToPath(ENV_FILE)).toBe(fileURLToPath(new URL("../../../../../.env", import.meta.url)));
  });
});
