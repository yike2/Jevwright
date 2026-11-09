import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { execute, type ExecuteResult } from "@/core/executor/index.js";
import { analyze } from "@/core/syntax/index.js";
import { serveFixtures } from "../browser/server.js";

const FIXTURES = fileURLToPath(new URL("./fixtures/", import.meta.url));

let server: Awaited<ReturnType<typeof serveFixtures>>;
beforeAll(async () => (server = await serveFixtures(FIXTURES)));
afterAll(() => server.stop());

const signIn = (welcome: string) => `
name: "Sign in"
baseUrl: "{{BASE}}"
timeoutMs: 1000
steps:
  - open:
      url: "/sign-in.html"
  - input:
      selector: "#email"
      value: "{{EMAIL}}"
  - click:
      selector: "#go"
      dialog:
        accept: true
        message: "Signed in"
  - waitFor:
      selector: "#welcome"
  - assert:
      selector: "#welcome"
      text: "${welcome}"
  - click:
      selector: "#help"
  - switchTab:
      url: "**/help.html"
  - assert:
      url: "**/help.html"
`;

// Analyzes `yaml` and executes it headless against the fixture server.
async function run(yaml: string): Promise<ExecuteResult> {
  const { testCase, diagnostics } = analyze(yaml);
  if (!testCase) throw new Error(`Invalid test: ${JSON.stringify(diagnostics)}`);
  const jev = {
    bbox: async () => {
      throw new Error("Jev should not be called yet");
    },
    choice: async () => {
      throw new Error("Jev should not be called yet");
    },
    noul: async () => {
      throw new Error("Jev should not be called yet");
    },
  };
  return execute(testCase, {
    headed: false,
    vars: { BASE: server.baseUrl, EMAIL: "student@x.com" },
    onEvent: () => {},
    jev,
  });
}

describe("execute", () => {
  it("passes a TestCase with actions, a dialog, waitFor, assert, and switchTab", async () => {
    const { steps, trace } = await run(signIn("Welcome student@x.com"));

    expect(steps.map(({ status }) => status)).toEqual(Array(8).fill("passed"));
    expect(steps[2]).toMatchObject({
      locateMethod: "selector",
      dialogs: [{ type: "alert", message: "Signed in", answer: "accepted", expected: true }],
    });
    expect(trace.length).toBeGreaterThan(0);
  });

  it("fails an assert on a Variable with the value redacted, a screenshot, and the rest pending", async () => {
    const { steps } = await run(signIn("Goodbye {{EMAIL}}"));

    expect(steps.map(({ status }) => status)).toEqual([
      ...Array(4).fill("passed"),
      "failed",
      ...Array(3).fill("pending"),
    ]);
    const failed = steps[4]!;
    if (failed.status !== "failed") throw new Error("Step 5 did not fail");
    expect(failed.reason).toContain('did not contain "Goodbye {{EMAIL}}"');
    expect(failed.reason).toContain('it was "Welcome {{EMAIL}}"');
    expect(failed.reason).not.toContain("student@x.com");
    expect(failed.screenshot?.subarray(0, 4)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  });
});
