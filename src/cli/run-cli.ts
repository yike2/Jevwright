import { readFile } from "node:fs/promises";
import { relative, resolve } from "node:path";

import { Command, CommanderError } from "commander";

import { readConfig, loadEnvFile } from "@/cli/config.js";
import { getExitCode, type FileOutcome } from "@/cli/exit-codes.js";
import {
  formatMultiFileSummary,
  formatRunError,
  formatRunFileHeader,
  formatRunSummary,
  formatStepResult,
  formatUnexpectedError,
  formatValidateDiagnostic,
  formatValidateFailed,
  formatValidateJson,
  formatValidatePassed,
} from "@/cli/output.js";
import { expandPaths } from "@/cli/path-expansion.js";
import { createFileReportStore } from "@/cli/report-store.js";
import { runTest } from "@/core/pipeline/index.js";
import { createJevClient } from "@/core/jev/index.js";
import { analyze, type Diagnostic } from "@/core/syntax/index.js";

export type CliIo = {
  cwd: string;
  stdout: (text: string) => void;
  stderr: (text: string) => void;
};

type ValidateInvocation = {
  command: "validate";
  paths: string[];
  json: boolean;
};

type RunInvocation = {
  command: "run";
  paths: string[];
  headed: boolean;
  outDir: string;
};

type Invocation = ValidateInvocation | RunInvocation;

const DEFAULT_OUT_DIR = "./jevwright-reports";

export async function runCli(argv: readonly string[], io: CliIo): Promise<number> {
  let invocation: Invocation | undefined;

  const program = new Command();
  program
    .name("jevwright")
    .helpCommand(false)
    .exitOverride()
    .configureOutput({
      writeOut: (text) => io.stdout(text),
      writeErr: (text) => io.stderr(text),
      outputError: (text, write) => write(text),
    });

  program
    .command("validate <paths...>")
    .description("Validate test files without launching a browser")
    .option("--json", "Print diagnostics as JSON")
    .action((paths: string[], options: { json?: boolean }) => {
      invocation = {
        command: "validate",
        paths,
        json: options.json === true,
      };
    });

  program
    .command("run <paths...>")
    .description("Run test files")
    .option("--headed", "Show the browser window")
    .option("--out-dir <dir>", "Directory for reports", DEFAULT_OUT_DIR)
    .action((paths: string[], options: { headed?: boolean; outDir?: string }) => {
      invocation = {
        command: "run",
        paths,
        headed: options.headed === true,
        outDir: options.outDir ?? DEFAULT_OUT_DIR,
      };
    });

  try {
    await program.parseAsync(argv, { from: "user" });
  } catch (error) {
    if (error instanceof CommanderError) {
      return error.code === "commander.helpDisplayed" ? 0 : 2;
    }

    throw error;
  }

  if (invocation === undefined) {
    return 2;
  }

  if (invocation.command === "validate") {
    return runValidate(invocation, io);
  }

  return runRun(invocation, io);
}

async function runValidate(invocation: ValidateInvocation, io: CliIo): Promise<number> {
  const expanded = await expandPaths(invocation.paths, io.cwd);
  if (!expanded.ok) {
    writeStderrLine(io, expanded.error);
    return 2;
  }

  const diagnosticsByFile: Array<{ file: string; diagnostics: readonly Diagnostic[] }> = [];
  const outcomes: FileOutcome[] = [];

  for (const file of expanded.files) {
    const filePath = resolve(io.cwd, file);

    let source: string;
    try {
      source = await readFile(filePath, "utf8");
    } catch (error) {
      const line = formatUnexpectedError(file, getErrorName(error));
      if (invocation.json) {
        writeStderrLine(io, line);
      } else {
        writeStdoutLine(io, line);
      }
      diagnosticsByFile.push({ file, diagnostics: [] });
      outcomes.push("invalid");
      continue;
    }

    const analysis = analyze(source);
    diagnosticsByFile.push({ file, diagnostics: analysis.diagnostics });

    if (analysis.diagnostics.length > 0) {
      outcomes.push("invalid");

      if (!invocation.json) {
        for (const diagnostic of analysis.diagnostics) {
          writeStdoutLine(io, formatValidateDiagnostic(file, diagnostic));
        }
      }

      continue;
    }

    outcomes.push("passed");
  }

  if (invocation.json) {
    writeStdoutLine(io, formatValidateJson(diagnosticsByFile));
  } else {
    const invalidCount = outcomes.filter((outcome) => outcome === "invalid").length;

    if (invalidCount === 0) {
      writeStdoutLine(io, formatValidatePassed(expanded.files.length));
    } else {
      const diagnosticCount = diagnosticsByFile.reduce((sum, result) => sum + result.diagnostics.length, 0);
      writeStdoutLine(io, formatValidateFailed(diagnosticCount));
    }
  }

  return getExitCode(outcomes);
}

async function runRun(invocation: RunInvocation, io: CliIo): Promise<number> {
  const expanded = await expandPaths(invocation.paths, io.cwd);
  if (!expanded.ok) {
    writeStderrLine(io, expanded.error);
    return 2;
  }

  loadEnvFile(io.cwd);
  const config = readConfig(process.env);
  if (!config.ok) {
    writeStderrLine(io, config.error);
    return 2;
  }

  const jev = createJevClient({ apiKey: config.apiKey, fetch: globalThis.fetch });
  const timestamp = new Date().toISOString().replaceAll(":", "-");
  const outcomes: FileOutcome[] = [];

  for (const file of expanded.files) {
    writeStdoutLine(io, formatRunFileHeader(file));

    let source: string;
    try {
      source = await readFile(resolve(io.cwd, file), "utf8");
    } catch (error) {
      writeStdoutLine(io, formatUnexpectedError(file, getErrorName(error)));
      outcomes.push("failed");
      continue;
    }

    const reportDir = resolve(io.cwd, invocation.outDir, timestamp, stripYamlSuffix(file));
    const reportDirRelative = normalizePath(relative(io.cwd, reportDir));
    const store = createFileReportStore(reportDir);

    try {
      const result = await runTest(
        { file, source },
        {
          headed: invocation.headed,
          vars: config.vars,
          jev,
          store,
          onEvent: (event) => {
            if (event.type !== "finished") {
              return;
            }

            const line = formatStepResult(event.result);
            if (line !== undefined) {
              writeStdoutLine(io, line);
            }
          },
        },
      );

      if (result.kind === "invalid") {
        for (const diagnostic of result.diagnostics) {
          writeStdoutLine(io, formatValidateDiagnostic(file, diagnostic));
        }
        outcomes.push("invalid");
        continue;
      }

      if (result.report.error !== undefined) {
        writeStdoutLine(io, formatRunError(result.report.error));
      }

      writeStdoutLine(io, formatRunSummary(result.report, reportDirRelative));
      outcomes.push(result.report.status === "passed" ? "passed" : "failed");
    } catch (error) {
      writeStdoutLine(io, formatUnexpectedError(file, getErrorName(error)));
      outcomes.push("failed");
    }
  }

  if (expanded.files.length > 1) {
    const passed = outcomes.filter((outcome) => outcome === "passed").length;
    const failed = outcomes.filter((outcome) => outcome === "failed").length;
    const invalid = outcomes.filter((outcome) => outcome === "invalid").length;

    writeStdoutLine(io, formatMultiFileSummary(passed, failed, invalid));
  }

  return getExitCode(outcomes);
}

function stripYamlSuffix(file: string): string {
  return file.endsWith(".yaml") ? file.slice(0, -".yaml".length) : file;
}

function normalizePath(path: string): string {
  return path.split("\\").join("/");
}

function getErrorName(error: unknown): string {
  return error instanceof Error ? error.name : "Error";
}

function writeStdoutLine(io: CliIo, text: string): void {
  io.stdout(`${text}\n`);
}

function writeStderrLine(io: CliIo, text: string): void {
  io.stderr(`${text}\n`);
}
