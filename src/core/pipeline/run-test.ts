import { launchBrowser } from "../browser/index.js";
import { execute, RunAbortedError, type RunError, type StepResult } from "../executor/index.js";
import { buildReport } from "../report/index.js";
import { analyze } from "../syntax/index.js";
import type { RunTestOptions, RunTestResult } from "./types.js";

/** Runs one source file through analysis, execution, report building, and save. */
export async function runTest(
    input: { file: string; source: string },
    options: RunTestOptions,
    launch: typeof launchBrowser = launchBrowser,
): Promise<RunTestResult> {
    const { file, source } = input;
    const { diagnostics, testCase } = analyze(source);

    if (diagnostics.length > 0 || testCase === undefined) {
        return { kind: "invalid", diagnostics };
    }

    const startedAt = new Date();
    const onEvent = options.onEvent ?? (() => { });
    let steps: StepResult[];
    let trace: Buffer;
    let error: RunError | undefined;

    try {
        const outcome = await execute(testCase, { headed: options.headed, vars: options.vars, onEvent, jev: options.jev }, launch);
        steps = outcome.steps;
        trace = outcome.trace;
    } catch (caught) {
        if (!(caught instanceof RunAbortedError)) throw caught;
        steps = caught.steps;
        trace = caught.trace;
        error = { kind: caught.kind, message: caught.message };
    }

    const durationMs = Date.now() - startedAt.getTime();
    const { report, files } = buildReport({
        file,
        testCase,
        startedAt,
        durationMs,
        steps,
        trace,
        ...(error ? { error } : {}),
    });
    await options.store.save({ report, files });
    return { kind: "completed", report };
}
