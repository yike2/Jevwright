import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { BrowserAdapter, BoundingBox, PageSnapshot, ReadResult } from "@/core/browser/index.js";
import { selectCandidates } from "@/core/locator/dom.js";
import { LocateError, locate } from "@/core/locator/index.js";
import type { LocateRequest } from "@/core/locator/index.js";
import type { JevClient } from "@/core/jev/index.js";

type ExpectedTarget = {
    target: string;
    present: boolean;
    elementId: number | null;
    bbox: BoundingBox | null;
};

type ScenarioExpected = {
    scenario: string;
    targets: ExpectedTarget[];
};

type ScenarioFixture = {
    name: string;
    snapshot: PageSnapshot;
    screenshot: Buffer;
    expected: ScenarioExpected;
};

type ChoiceResult = ReadResult<{ index: number | null; confidence: number }>;
type BboxResult = ReadResult<{ box: BoundingBox | null; confidence: number }>;

type FakeAdapter = Pick<BrowserAdapter, "isVisible" | "screenshot" | "snapshot"> & {
    calls: {
        isVisible: number;
        screenshot: number;
        snapshot: number;
    };
};

type FakeJev = Pick<JevClient, "bbox" | "choice"> & {
    calls: {
        bbox: number;
        choice: number;
    };
    lastBboxViewport?: { width: number; height: number };
};

const TEST_ACTION: LocateRequest["action"] = "click";

const UNREACHABLE = new Set([
    "board-new-task-dialog: 'New task' button behind the dialog",
]);

const testDir = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.join(testDir, "fixtures");

function loadScenarios(): ScenarioFixture[] {
    const entries = readdirSync(fixturesDir)
        .map((name) => path.join(fixturesDir, name))
        .filter((entryPath) => statSync(entryPath).isDirectory())
        .sort((a, b) => a.localeCompare(b));

    return entries.map((entryPath) => {
        const name = path.basename(entryPath);
        const snapshot = JSON.parse(readFileSync(path.join(entryPath, "snapshot.json"), "utf8")) as PageSnapshot;
        const expected = JSON.parse(readFileSync(path.join(entryPath, "expected.json"), "utf8")) as ScenarioExpected;
        const screenshot = readFileSync(path.join(entryPath, "screenshot.png"));

        return {
            name,
            snapshot,
            screenshot,
            expected,
        };
    });
}

const scenarios = loadScenarios();

function makeAdapter(scenario: ScenarioFixture): FakeAdapter {
    const calls = { isVisible: 0, screenshot: 0, snapshot: 0 };

    return {
        calls,
        isVisible: async () => {
            calls.isVisible += 1;
            return { ok: true, data: false };
        },
        screenshot: async () => {
            calls.screenshot += 1;
            return { ok: true, data: scenario.screenshot };
        },
        snapshot: async () => {
            calls.snapshot += 1;
            return { ok: true, data: scenario.snapshot };
        },
    };
}

function makeJev(overrides: {
    bbox?: (
        question: string,
        image: Buffer,
        viewport: { width: number; height: number },
        signal?: AbortSignal,
    ) => Promise<BboxResult>;
    choice?: (question: string, options: string[], signal?: AbortSignal) => Promise<ChoiceResult>;
} = {}): FakeJev {
    const calls = { bbox: 0, choice: 0 };

    return {
        calls,
        lastBboxViewport: undefined,
        bbox: async (question, image, viewport, signal) => {
            calls.bbox += 1;
            if (overrides.bbox !== undefined) {
                return overrides.bbox(question, image, viewport, signal);
            }
            return { ok: true, data: { box: null, confidence: 0.9 } };
        },
        choice: async (question, options, signal) => {
            calls.choice += 1;
            if (overrides.choice !== undefined) {
                return overrides.choice(question, options, signal);
            }
            return { ok: true, data: { index: null, confidence: 0.9 } };
        },
    };
}

function buildRequest(target: string): LocateRequest {
    return {
        action: TEST_ACTION,
        target,
        timeoutMs: 15_000,
    };
}

function expectedFound(scenarioName: string, target: ExpectedTarget): boolean {
    const key = `${scenarioName}: ${target.target}`;
    if (UNREACHABLE.has(key)) {
        return false;
    }
    return target.present && target.elementId !== null;
}

describe("fixtures", () => {
    it("loads exactly 9 scenarios", () => {
        expect(scenarios).toHaveLength(9);
    });
});

describe("Visual Locate", () => {
    for (const scenario of scenarios) {
        for (const target of scenario.expected.targets) {
            it(`${scenario.name}: ${target.target}`, async () => {
                const adapter = makeAdapter(scenario);
                const jev = makeJev({
                    bbox: async (_question, _image, viewport) => {
                        jev.lastBboxViewport = viewport;
                        return {
                            ok: true,
                            data: { box: target.bbox, confidence: 0.9 },
                        };
                    },
                    choice: async () => ({ ok: true, data: { index: null, confidence: 0.9 } }),
                });

                const found = expectedFound(scenario.name, target);
                if (found) {
                    const result = await locate(buildRequest(target.target), adapter, jev);
                    expect(result.element).toEqual({ snapshotId: target.elementId });
                    expect(result.method).toBe("visual");
                    expect(jev.calls.choice).toBe(0);
                } else {
                    await expect(locate(buildRequest(target.target), adapter, jev)).rejects.toBeInstanceOf(LocateError);
                }

                expect(adapter.calls.isVisible).toBe(0);
                expect(jev.calls.bbox).toBe(1);
                expect(jev.lastBboxViewport).toEqual(scenario.snapshot.viewport);
            });
        }
    }
});

describe("DOM Locate", () => {
    for (const scenario of scenarios) {
        for (const target of scenario.expected.targets) {
            it(`${scenario.name}: ${target.target}`, async () => {
                const candidates = selectCandidates(scenario.snapshot.elements, TEST_ACTION);
                const candidateIndex =
                    target.elementId === null
                        ? null
                        : candidates.findIndex((candidate) => candidate.id === target.elementId);
                const resolvedIndex = candidateIndex === -1 ? null : candidateIndex;

                const adapter = makeAdapter(scenario);
                const jev = makeJev({
                    bbox: async (_question, _image, viewport) => {
                        jev.lastBboxViewport = viewport;
                        return {
                            ok: true,
                            data: { box: null, confidence: 0.9 },
                        };
                    },
                    choice: async () => ({ ok: true, data: { index: resolvedIndex, confidence: 0.9 } }),
                });

                const found = expectedFound(scenario.name, target);
                if (found) {
                    const result = await locate(buildRequest(target.target), adapter, jev);
                    expect(result.element).toEqual({ snapshotId: target.elementId });
                    expect(result.method).toBe("dom");
                } else {
                    await expect(locate(buildRequest(target.target), adapter, jev)).rejects.toBeInstanceOf(LocateError);
                }

                expect(adapter.calls.isVisible).toBe(0);
                expect(jev.calls.bbox).toBe(1);
            });
        }
    }
});
