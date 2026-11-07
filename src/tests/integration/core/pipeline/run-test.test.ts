import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runTest } from "@/core/pipeline/index.js";
import type { ReportBundle, ReportStore } from "@/core/report/index.js";
import { serveFixtures } from "../browser/server.js";
import { throwingJev } from "../../../unit/core/executor/fake-adapter.js";

const FIXTURES = fileURLToPath(new URL("./fixtures/", import.meta.url));

let server: Awaited<ReturnType<typeof serveFixtures>>;
beforeAll(async () => (server = await serveFixtures(FIXTURES)));
afterAll(() => server.stop());

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
const ZIP_SIGNATURE = Buffer.from("PK");

describe("runTest", () => {
    it("saves a failed report when a selector-only click fails", async () => {
        let saveCalls = 0;

        class InMemoryReportStore implements ReportStore {
            bundles: ReportBundle[] = [];

            async save(bundle: ReportBundle): Promise<void> {
                saveCalls += 1;
                this.bundles.push(bundle);
            }
        }

        const store = new InMemoryReportStore();
        const result = await runTest(
            {
                file: "missing-button.yaml",
                source: `
name: "Missing button"
timeoutMs: 500
steps:
  - open:
      url: "${server.baseUrl}/missing-button.html"
  - click:
      selector: "#go"
`,
            },
            {
                headed: false,
                vars: {},
                jev: throwingJev,
                store,
            },
        );

        expect(result.kind).toBe("completed");
        expect(saveCalls).toBe(1);
        expect(store.bundles).toHaveLength(1);

        const saved = store.bundles[0]!.report;
        expect(saved.status).toBe("failed");

        const failedStep = saved.steps.find((step) => step.status === "failed");
        expect(failedStep).toBeDefined();
        expect(typeof failedStep?.reason).toBe("string");
        expect((failedStep?.reason ?? "").trim().length).toBeGreaterThan(0);

        const screenshotFile = store.bundles[0]!.files.find((file) => file.path.endsWith(".png"));
        expect(screenshotFile).toBeDefined();
        expect(screenshotFile!.data.subarray(0, 4)).toEqual(PNG_SIGNATURE);

        const traceFile = store.bundles[0]!.files.find((file) => file.path === "trace.zip");
        expect(traceFile).toBeDefined();
        expect(traceFile!.data.length).toBeGreaterThan(0);
        expect(traceFile!.data.subarray(0, 2)).toEqual(ZIP_SIGNATURE);
    });
});
