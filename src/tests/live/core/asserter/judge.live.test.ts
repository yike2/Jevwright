import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { BrowserAdapter } from "@/core/browser/index.js";
import { judge } from "@/core/asserter/index.js";
import { createJevClient } from "@/core/jev/index.js";

// vitest.live.config.ts includes "src/tests/live/**/*.live.test.ts", so this file is picked up by pnpm test:live.
// fetch.ts allows at most 3 attempts per noul request at 5s each, plus up to 2 retry delays of 2s each,
// so a single noul call can take roughly 3 * 5s + 2 * 2s ≈ 19s; judge() can issue two noul asks, so
// a full judgment is ~38s. A 60_000ms per-test timeout leaves headroom for the Harness retries.
type ScenarioStatement = {
    statement: string;
    holds: boolean;
};

type ScenarioExpected = {
    scenario: string;
    statements: ScenarioStatement[];
};

type ScenarioFixture = {
    name: string;
    screenshot: Buffer;
    expected: ScenarioExpected;
};

const testDir = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.join(testDir, "../../../integration/core/locator/fixtures");

function loadScenarios(): ScenarioFixture[] {
    const entries = readdirSync(fixturesDir)
        .map((name) => path.join(fixturesDir, name))
        .filter((entryPath) => statSync(entryPath).isDirectory())
        .sort((a, b) => a.localeCompare(b));

    return entries.map((entryPath) => {
        const name = path.basename(entryPath);
        const expected = JSON.parse(readFileSync(path.join(entryPath, "expected.json"), "utf8")) as ScenarioExpected;
        const screenshot = readFileSync(path.join(entryPath, "screenshot.png"));

        return {
            name,
            screenshot,
            expected,
        };
    });
}

const scenarios = loadScenarios();

describe.skipIf(!process.env.OPENROUTER_API_KEY)("asserter judge live", () => {
    const client = createJevClient({
        apiKey: process.env.OPENROUTER_API_KEY as string,
        fetch: globalThis.fetch,
    });

    for (const scenario of scenarios) {
        for (const statement of scenario.expected.statements) {
            it(`${scenario.name}: ${statement.statement}`, async () => {
                const adapter: Pick<BrowserAdapter, "screenshot"> = {
                    screenshot: async () => ({
                        ok: true,
                        data: scenario.screenshot,
                    }),
                };

                const result = await judge(statement.statement, adapter, client);
                const probabilityValue = result.ok ? result.probability : result.probability ?? "missing";
                const expectedHolds = statement.holds;

                expect(
                    result.ok,
                    `${scenario.name}: ${statement.statement} returned probability=${probabilityValue}; expected holds=${expectedHolds}`,
                ).toBe(expectedHolds);
            }, 60_000);
        }
    }
});
