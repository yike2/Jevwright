import { mkdtemp, readFile, readdir, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { runCli, type CliIo } from "@/cli/run-cli.js";
import { serveFixtures } from "../core/browser/server.js";

const FIXTURES = fileURLToPath(new URL("./fixtures/", import.meta.url));

function createIo(cwd: string): { io: CliIo; stdout: () => string; stderr: () => string } {
  let stdoutText = "";
  let stderrText = "";

  const io: CliIo = {
    cwd,
    stdout: (text) => {
      stdoutText += text;
    },
    stderr: (text) => {
      stderrText += text;
    },
  };

  return {
    io,
    stdout: () => stdoutText,
    stderr: () => stderrText,
  };
}

describe("cli run", () => {
  let originalOpenRouterApiKey: string | undefined;

  beforeEach(() => {
    originalOpenRouterApiKey = process.env.OPENROUTER_API_KEY;
  });

  afterEach(() => {
    if (originalOpenRouterApiKey === undefined) {
      delete process.env.OPENROUTER_API_KEY;
    } else {
      process.env.OPENROUTER_API_KEY = originalOpenRouterApiKey;
    }
  });

  it("returns 0 and writes report.json and trace.zip for a passing file", async () => {
    const cwd = await realpath(await mkdtemp(join(tmpdir(), "jevwright-cli-")));
    const server = await serveFixtures(FIXTURES);

    try {
      process.env.OPENROUTER_API_KEY = "fake-key";

      const outDir = join(cwd, "reports");
      const source = [
        'name: "Passing file"',
        `baseUrl: "${server.baseUrl}"`,
        "steps:",
        "  - open:",
        '      url: "/page.html"',
        "  - click:",
        '      selector: "#go"',
        "",
      ].join("\n");
      await writeFile(join(cwd, "passing.yaml"), source);

      const { io, stdout, stderr } = createIo(cwd);
      const exitCode = await runCli(["run", "passing.yaml", "--out-dir", outDir], io);

      expect(exitCode).toBe(0);
      expect(stderr()).toBe("");
      expect(stdout().split("\n")[0]).toBe("▶ passing.yaml");

      const timestampDirs = await readdir(outDir);
      expect(timestampDirs).toHaveLength(1);
      expect(timestampDirs[0]).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.\d{3}Z$/);

      const reportDir = join(outDir, timestampDirs[0], "passing");
      const report = JSON.parse(await readFile(join(reportDir, "report.json"), "utf8"));
      expect(report.status).toBe("passed");

      const traceData = await readFile(join(reportDir, "trace.zip"));
      expect(traceData.subarray(0, 2)).toEqual(Buffer.from("PK"));
    } finally {
      await server.stop();
      await rm(cwd, { recursive: true, force: true });
    }
  });

  it("returns 1 and writes a failed step screenshot", async () => {
    const cwd = await realpath(await mkdtemp(join(tmpdir(), "jevwright-cli-")));
    const server = await serveFixtures(FIXTURES);

    try {
      process.env.OPENROUTER_API_KEY = "fake-key";

      const outDir = join(cwd, "reports");
      const source = [
        'name: "Failing file"',
        `baseUrl: "${server.baseUrl}"`,
        "timeoutMs: 500",
        "steps:",
        "  - open:",
        '      url: "/page.html"',
        "  - click:",
        '      selector: "#missing"',
        "",
      ].join("\n");
      await writeFile(join(cwd, "failing.yaml"), source);

      const { io, stdout, stderr } = createIo(cwd);
      const exitCode = await runCli(["run", "failing.yaml", "--out-dir", outDir], io);

      expect(exitCode).toBe(1);
      expect(stderr()).toBe("");
      expect(stdout().split("\n")[0]).toBe("▶ failing.yaml");

      const timestampDirs = await readdir(outDir);
      expect(timestampDirs).toHaveLength(1);
      expect(timestampDirs[0]).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.\d{3}Z$/);

      const reportDir = join(outDir, timestampDirs[0], "failing");
      const report = JSON.parse(await readFile(join(reportDir, "report.json"), "utf8"));
      expect(report.status).toBe("failed");
      expect(report.summary).toEqual({ total: 2, passed: 1, failed: 1, pending: 0 });
      expect(report.steps[1].screenshot).toBe("screenshots/step-1.png");

      const screenshotData = await readFile(join(reportDir, report.steps[1].screenshot));
      expect(screenshotData.subarray(0, 4)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47]));

      const traceData = await readFile(join(reportDir, "trace.zip"));
      expect(traceData.subarray(0, 2)).toEqual(Buffer.from("PK"));
    } finally {
      await server.stop();
      await rm(cwd, { recursive: true, force: true });
    }
  });

  it("returns 2 for an invalid file", async () => {
    const cwd = await realpath(await mkdtemp(join(tmpdir(), "jevwright-cli-")));

    try {
      process.env.OPENROUTER_API_KEY = "fake-key";

      const outDir = join(cwd, "reports");
      const source = ['name: "Broken file"', "steps:", "  - aiAct:", '      foo: "bar"', ""].join("\n");
      await writeFile(join(cwd, "invalid.yaml"), source);

      const { io, stdout, stderr } = createIo(cwd);
      const exitCode = await runCli(["run", "invalid.yaml", "--out-dir", outDir], io);

      expect(exitCode).toBe(2);
      expect(stdout()).toBe('▶ invalid.yaml\n✖ invalid.yaml:3 — Error: Unknown action "aiAct"\n');
      expect(stderr()).toBe("");
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  it("returns 2 when OPENROUTER_API_KEY is missing", async () => {
    const cwd = await realpath(await mkdtemp(join(tmpdir(), "jevwright-cli-")));

    try {
      delete process.env.OPENROUTER_API_KEY;

      const outDir = join(cwd, "reports");
      const source = ['name: "Passing file"', "steps:", "  - open:", '      url: "https://example.com"', ""].join("\n");
      await writeFile(join(cwd, "passing.yaml"), source);

      const { io, stdout, stderr } = createIo(cwd);
      const exitCode = await runCli(["run", "passing.yaml", "--out-dir", outDir], io);

      expect(exitCode).toBe(2);
      expect(stdout()).toBe("");
      expect(stderr()).toBe("OPENROUTER_API_KEY is not set\n");
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });
});
