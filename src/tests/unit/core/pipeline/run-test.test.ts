import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/core/executor/index.js", async () => {
    const actual = await vi.importActual<typeof import("@/core/executor/index.js")>("@/core/executor/index.js");
    return {
        ...actual,
        execute: vi.fn(),
    };
});

import { execute } from "@/core/executor/index.js";
import { runTest } from "@/core/pipeline/run-test.js";
import type { RunTestResult } from "@/core/pipeline/types.js";
import type { Report, ReportStore } from "@/core/report/index.js";

const VALID_SOURCE = `name: "Demo"
steps:
  - open:
      url: "https://example.com"`;

function makeReportStore() {
    const bundles: Array<{ report: unknown; files: unknown[] }> = [];
    const save = vi.fn(async (bundle: { report: unknown; files: unknown[] }) => {
        bundles.push(bundle);
    });
    return { bundles, save } as const;
}

function makeFailedStep(index = 0) {
    return {
        index,
        line: index + 1,
        action: "click" as const,
        status: "failed" as const,
        startedAt: "2024-01-02T03:04:05.000Z",
        durationMs: 7,
        locateMethod: "selector" as const,
        dialogs: [],
        reason: "Element not found",
        screenshot: Buffer.from("FAKE-PNG"),
    };
}

function completedReport(result: RunTestResult): Report {
    if (result.kind !== "completed") throw new Error(`Expected completed, got ${result.kind}`);
    return result.report;
}

describe("runTest", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.useRealTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it("returns invalid when analyze reports diagnostics and does not execute or save", async () => {
        const store = makeReportStore();
        const result = await runTest(
            { file: "invalid.yaml", source: 'name: "Broken"\nsteps: []' },
            { headed: false, vars: {}, jev: {} as never, store: store as unknown as ReportStore },
        );

        expect(result.kind).toBe("invalid");
        expect(result).toMatchObject({
            kind: "invalid",
            diagnostics: expect.arrayContaining([
                expect.objectContaining({
                    code: "E002",
                    message: expect.stringContaining("non-empty array"),
                }),
            ]),
        });
        expect(execute).not.toHaveBeenCalled();
        expect(store.save).not.toHaveBeenCalled();
    });

    it("passes headed, vars, jev, onEvent, and launch to execute unchanged", async () => {
        const launch = vi.fn();
        const onEvent = vi.fn();
        const jev = { ping: vi.fn() } as never;
        const store = makeReportStore();
        vi.mocked(execute).mockResolvedValue({ steps: [], trace: Buffer.alloc(0) });

        await runTest(
            { file: "demo.yaml", source: VALID_SOURCE },
            { headed: true, vars: { USER: "alice" }, jev, store: store as unknown as ReportStore, onEvent },
            launch,
        );

        expect(execute).toHaveBeenCalledTimes(1);
        const [testCase, executeOptions, executeLaunch] = vi.mocked(execute).mock.calls[0]!;
        expect(testCase).toMatchObject({ name: "Demo", timeoutMs: 15000 });
        expect(executeOptions).toEqual({ headed: true, vars: { USER: "alice" }, onEvent, jev });
        expect(executeLaunch).toBe(launch);
    });

    it("passes a noop callback when onEvent is omitted", async () => {
        const launch = vi.fn();
        const store = makeReportStore();
        const jev = { ping: vi.fn() } as never;
        vi.mocked(execute).mockResolvedValue({ steps: [], trace: Buffer.alloc(0) });

        await runTest(
            { file: "demo.yaml", source: VALID_SOURCE },
            { headed: false, vars: {}, jev, store: store as unknown as ReportStore },
            launch,
        );

        const [, executeOptions] = vi.mocked(execute).mock.calls[0]!;
        expect(executeOptions).toMatchObject({ headed: false, vars: {}, jev });
        expect(typeof executeOptions.onEvent).toBe("function");
    });

    it("saves the bundle once and returns the saved report on a normal run", async () => {
        vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
        vi.setSystemTime(new Date("2024-01-02T03:04:05.000Z"));
        const store = makeReportStore();
        const launch = vi.fn();
        const jev = { ping: vi.fn() } as never;
        vi.mocked(execute).mockImplementation(async () => {
            await vi.advanceTimersByTimeAsync(1234);
            return {
                steps: [makeFailedStep(0)],
                trace: Buffer.from("FAKE-TRACE"),
            };
        });

        const result = await runTest(
            { file: "demo.yaml", source: VALID_SOURCE },
            { headed: false, vars: {}, jev, store: store as unknown as ReportStore },
            launch,
        );

        expect(result.kind).toBe("completed");
        expect(store.save).toHaveBeenCalledTimes(1);
        const savedBundle = vi.mocked(store.save).mock.calls[0]?.[0] as { report: Record<string, unknown>; files: Array<{ path: string; data: Buffer }> };
        expect(completedReport(result)).toBe(savedBundle.report);
        expect(savedBundle.report).toMatchObject({
            file: "demo.yaml",
            name: "Demo",
            status: "failed",
            startedAt: "2024-01-02T03:04:05.000Z",
            durationMs: 1234,
            trace: "trace.zip",
        });
        expect(savedBundle.files.map(({ path }) => path)).toEqual(["trace.zip", "screenshots/step-0.png"]);
        expect(savedBundle.files[0]!.data.equals(Buffer.from("FAKE-TRACE"))).toBe(true);
        expect(savedBundle.files[1]!.data.equals(Buffer.from("FAKE-PNG"))).toBe(true);
    });

    it("converts RunAbortedError to a failed report with the RunAbortedError steps and trace, and saves once", async () => {
        vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
        vi.setSystemTime(new Date("2024-01-02T03:04:05.000Z"));
        const store = makeReportStore();
        const launch = vi.fn();
        const jev = { ping: vi.fn() } as never;
        const { RunAbortedError: RealRunAbortedError } = await vi.importActual<typeof import("@/core/executor/index.js")>("@/core/executor/index.js");
        const steps = [makeFailedStep(0), makeFailedStep(1)];
        const trace = Buffer.from("FAKE-TRACE");
        const error = new RealRunAbortedError("timeout", "ABORTED", steps as never, trace, {
            cause: new Error("SECRET-CAUSE-VALUE"),
        });
        vi.mocked(execute).mockImplementation(async () => {
            await vi.advanceTimersByTimeAsync(1000);
            throw error;
        });

        const result = await runTest(
            { file: "aborted.yaml", source: VALID_SOURCE },
            { headed: false, vars: {}, jev, store: store as unknown as ReportStore },
            launch,
        );

        expect(result.kind).toBe("completed");
        expect(completedReport(result)).toMatchObject({
            file: "aborted.yaml",
            name: "Demo",
            status: "failed",
            trace: "trace.zip",
            error: { kind: "timeout", message: "ABORTED" },
        });
        expect(completedReport(result).steps).toEqual([
            expect.objectContaining({ status: "failed", screenshot: "screenshots/step-0.png" }),
            expect.objectContaining({ status: "failed", screenshot: "screenshots/step-1.png" }),
        ]);
        expect(completedReport(result).trace).toBe("trace.zip");
        expect(JSON.stringify(completedReport(result))).not.toContain("SECRET-CAUSE-VALUE");
        expect(store.save).toHaveBeenCalledTimes(1);
    });

    it("measures durationMs when execute throws RunAbortedError", async () => {
        vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
        vi.setSystemTime(new Date("2024-01-02T03:04:05.000Z"));
        const store = makeReportStore();
        const launch = vi.fn();
        const jev = { ping: vi.fn() } as never;
        const { RunAbortedError: RealRunAbortedError } = await vi.importActual<typeof import("@/core/executor/index.js")>("@/core/executor/index.js");
        const error = new RealRunAbortedError(
            "timeout",
            "ABORTED",
            [makeFailedStep(0)] as never,
            Buffer.from("FAKE-TRACE"),
            { cause: new Error("SECRET-CAUSE-VALUE") },
        );
        vi.mocked(execute).mockImplementation(async () => {
            await vi.advanceTimersByTimeAsync(2345);
            throw error;
        });

        const result = await runTest(
            { file: "aborted.yaml", source: VALID_SOURCE },
            { headed: false, vars: {}, jev, store: store as unknown as ReportStore },
            launch,
        );

        expect(completedReport(result).startedAt).toBe("2024-01-02T03:04:05.000Z");
        expect(completedReport(result).durationMs).toBe(2345);
        expect(store.save).toHaveBeenCalledTimes(1);
    });

    it("rethrows a non-RunAbortedError execute error unchanged and does not save", async () => {
        const store = makeReportStore();
        const launch = vi.fn();
        const jev = { ping: vi.fn() } as never;
        const error = new Error("EXECUTE-FAILED");
        vi.mocked(execute).mockRejectedValue(error);

        await expect(
            runTest(
                { file: "demo.yaml", source: VALID_SOURCE },
                { headed: false, vars: {}, jev, store: store as unknown as ReportStore },
                launch,
            ),
        ).rejects.toBe(error);
        expect(store.save).not.toHaveBeenCalled();
    });

    it("rethrows a save error unchanged", async () => {
        const store = makeReportStore();
        const launch = vi.fn();
        const jev = { ping: vi.fn() } as never;
        const saveError = new Error("SAVE-FAILED");
        vi.mocked(execute).mockResolvedValue({ steps: [], trace: Buffer.alloc(0) });
        store.save.mockRejectedValueOnce(saveError);

        await expect(
            runTest(
                { file: "demo.yaml", source: VALID_SOURCE },
                { headed: false, vars: {}, jev, store: store as unknown as ReportStore },
                launch,
            ),
        ).rejects.toBe(saveError);
        expect(store.save).toHaveBeenCalledTimes(1);
    });

    it("does not resolve before store.save resolves", async () => {
        vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
        vi.setSystemTime(new Date("2024-01-02T03:04:05.000Z"));
        const store = makeReportStore();
        const launch = vi.fn();
        const jev = { ping: vi.fn() } as never;
        let resolveSave: (() => void) | undefined;
        const savePromise = new Promise<void>((resolve) => {
            resolveSave = resolve;
        });
        vi.mocked(execute).mockResolvedValue({ steps: [], trace: Buffer.alloc(0) });
        store.save.mockReturnValueOnce(savePromise);

        const resultPromise = runTest(
            { file: "demo.yaml", source: VALID_SOURCE },
            { headed: false, vars: {}, jev, store: store as unknown as ReportStore },
            launch,
        );

        let settled = false;
        resultPromise.then(
            () => {
                settled = true;
            },
            () => {
                settled = true;
            },
        );

        await vi.advanceTimersByTimeAsync(0);
        expect(store.save).toHaveBeenCalledTimes(1);
        expect(settled).toBe(false);

        resolveSave?.();
        await expect(resultPromise).resolves.toMatchObject({ kind: "completed" });
    });

    it("omits trace.zip from saved files when the trace is empty", async () => {
        const store = makeReportStore();
        const launch = vi.fn();
        const jev = { ping: vi.fn() } as never;
        vi.mocked(execute).mockResolvedValue({ steps: [], trace: Buffer.alloc(0) });

        const result = await runTest(
            { file: "demo.yaml", source: VALID_SOURCE },
            { headed: false, vars: {}, jev, store: store as unknown as ReportStore },
            launch,
        );

        expect(result.kind).toBe("completed");
        expect(store.save).toHaveBeenCalledTimes(1);
        const savedBundle = vi.mocked(store.save).mock.calls[0]?.[0] as { files: Array<{ path: string }> };
        expect(savedBundle.files.map(({ path }) => path)).toEqual([]);
        expect(completedReport(result).trace).toBeUndefined();
    });
});
