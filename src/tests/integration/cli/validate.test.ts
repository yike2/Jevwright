import { mkdtemp, mkdir, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { runCli, type CliIo } from "@/cli/run-cli.js";

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

describe("cli validate", () => {
    it("returns 0 and prints PASSED for a valid file", async () => {
        const cwd = await realpath(await mkdtemp(join(tmpdir(), "jevwright-cli-")));

        try {
            await writeFile(
                join(cwd, "valid.yaml"),
                [
                    'name: "Valid file"',
                    "steps:",
                    "  - open:",
                    '      url: "https://example.com"',
                    "",
                ].join("\n"),
            );

            const { io, stdout, stderr } = createIo(cwd);
            const exitCode = await runCli(["validate", "valid.yaml"], io);

            expect(exitCode).toBe(0);
            expect(stdout()).toBe("✔ Validation PASSED (1 files).\n");
            expect(stderr()).toBe("");
        } finally {
            await rm(cwd, { recursive: true, force: true });
        }
    });

    it("returns 2 and prints a line-numbered diagnostic for an invalid file", async () => {
        const cwd = await realpath(await mkdtemp(join(tmpdir(), "jevwright-cli-")));

        try {
            await writeFile(
                join(cwd, "broken.yaml"),
                [
                    'name: "Broken file"',
                    "steps:",
                    "  - aiAct:",
                    '      foo: "bar"',
                    "",
                ].join("\n"),
            );

            const { io, stdout, stderr } = createIo(cwd);
            const exitCode = await runCli(["validate", "broken.yaml"], io);

            expect(exitCode).toBe(2);
            expect(stdout()).toBe('✖ broken.yaml:3 — Error: Unknown action "aiAct"\nValidation FAILED (1 errors).\n');
            expect(stderr()).toBe("");
        } finally {
            await rm(cwd, { recursive: true, force: true });
        }
    });

    it("prints JSON diagnostics with --json", async () => {
        const cwd = await realpath(await mkdtemp(join(tmpdir(), "jevwright-cli-")));

        try {
            await writeFile(
                join(cwd, "broken.yaml"),
                [
                    'name: "Broken file"',
                    "steps:",
                    "  - aiAct:",
                    '      foo: "bar"',
                    "",
                ].join("\n"),
            );

            const { io, stdout, stderr } = createIo(cwd);
            const exitCode = await runCli(["validate", "--json", "broken.yaml"], io);

            expect(exitCode).toBe(2);
            expect(stdout()).toBe(
                '[\n  {\n    "file": "broken.yaml",\n    "code": "E005",\n    "message": "Unknown action \\\"aiAct\\\"",\n    "line": 3\n  }\n]\n',
            );
            expect(stderr()).toBe("");
        } finally {
            await rm(cwd, { recursive: true, force: true });
        }
    });

    it("reports only the invalid file in a directory", async () => {
        const cwd = await realpath(await mkdtemp(join(tmpdir(), "jevwright-cli-")));

        try {
            await mkdir(join(cwd, "suite"), { recursive: true });
            await writeFile(
                join(cwd, "suite", "valid.yaml"),
                [
                    'name: "Valid file"',
                    "steps:",
                    "  - open:",
                    '      url: "https://example.com"',
                    "",
                ].join("\n"),
            );
            await writeFile(
                join(cwd, "suite", "broken.yaml"),
                [
                    'name: "Broken file"',
                    "steps:",
                    "  - aiAct:",
                    '      foo: "bar"',
                    "",
                ].join("\n"),
            );

            const { io, stdout, stderr } = createIo(cwd);
            const exitCode = await runCli(["validate", "suite"], io);

            expect(exitCode).toBe(2);
            expect(stdout()).toBe('✖ suite/broken.yaml:3 — Error: Unknown action "aiAct"\nValidation FAILED (1 errors).\n');
            expect(stderr()).toBe("");
        } finally {
            await rm(cwd, { recursive: true, force: true });
        }
    });

    it("returns 2 for a missing file", async () => {
        const cwd = await realpath(await mkdtemp(join(tmpdir(), "jevwright-cli-")));

        try {
            const { io, stdout, stderr } = createIo(cwd);
            const exitCode = await runCli(["validate", "nope.yaml"], io);

            expect(exitCode).toBe(2);
            expect(stdout()).toBe("");
            expect(stderr()).toBe("File not found: nope.yaml\n");
        } finally {
            await rm(cwd, { recursive: true, force: true });
        }
    });
});
