import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { execute } from "@/core/executor/index.js";
import { buildReport } from "@/core/report/index.js";
import { analyze } from "@/core/syntax/index.js";
import { serveFixtures } from "../browser/server.js";

const FIXTURES = fileURLToPath(new URL("./fixtures/", import.meta.url));

let server: Awaited<ReturnType<typeof serveFixtures>>;
beforeAll(async () => (server = await serveFixtures(FIXTURES)));
afterAll(() => server.stop());

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
const ZIP_SIGNATURE = Buffer.from("PK");

describe("buildReport", () => {
  it("bundles a failed Run of the Executor with a PNG screenshot and a zip trace", async () => {
    const { testCase } = analyze(`
name: "Missing button"
timeoutMs: 500
steps:
  - open:
      url: "${server.baseUrl}/missing-button.html"
  - click:
      selector: "#go"
`);
    const startedAt = new Date();
    const { steps, trace } = await execute(testCase!, { headed: false, vars: {}, onEvent: () => {} });

    const { report, files } = buildReport({ file: "missing-button.yaml", testCase: testCase!, startedAt, durationMs: 1, steps, trace });

    expect(report).toMatchObject({ status: "failed", trace: "trace.zip", summary: { passed: 1, failed: 1 } });
    expect(report.steps[1]).toMatchObject({ screenshot: "screenshots/step-1.png" });
    expect(files.map(({ path }) => path)).toEqual(["trace.zip", "screenshots/step-1.png"]);
    expect(files[0]!.data.subarray(0, 2)).toEqual(ZIP_SIGNATURE);
    expect(files[1]!.data.subarray(0, 4)).toEqual(PNG_SIGNATURE);
  });
});
