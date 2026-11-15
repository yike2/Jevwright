import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { parseEnv } from "node:util";

type ConfigSuccess = {
  ok: true;
  apiKey: string;
};

type ConfigFailure = {
  ok: false;
  error: string;
};

export type ConfigResult = ConfigSuccess | ConfigFailure;

/** Variables as the shell has them: a name may be unset. */
export type Env = Readonly<Record<string, string | undefined>>;

const API_KEY = "OPENROUTER_API_KEY";

/** The variables of the `.env` in `dir`, parsed and never loaded into `process.env`; `{}` when there is none. */
export function readEnvFile(dir: string): Record<string, string> {
  let text: string;
  try {
    text = readFileSync(join(dir, ".env"), "utf8");
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return {};
    throw error;
  }
  return parseEnv(text) as Record<string, string>;
}

/** The directories whose `.env` a file reads: the working directory, then each one down to the file's own. */
export function envDirsFor(cwd: string, file: string): string[] {
  // Path expansion keeps every file inside the working directory, so the walk never goes above it.
  const segments = dirname(file)
    .split(/[\\/]/)
    .filter((segment) => segment !== "" && segment !== ".");
  return [cwd, ...segments.map((_, index) => resolve(cwd, ...segments.slice(0, index + 1)))];
}

/**
 * The `{{VAR}}` values of one file: every `.env` from the working directory down to the file's directory, a nearer
 * one winning, and the shell winning over all. `OPENROUTER_API_KEY` is never a test variable.
 */
export function varsFor(cwd: string, file: string, shell: Env): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const dir of envDirsFor(cwd, file)) Object.assign(vars, readEnvFile(dir));
  for (const [key, value] of Object.entries(shell)) if (value !== undefined) vars[key] = value;
  delete vars[API_KEY];
  return vars;
}

/** The Jev API key, from the shell or else the working directory's `.env`. */
export function readConfig(cwd: string, shell: Env): ConfigResult {
  const apiKey = shell[API_KEY] ?? readEnvFile(cwd)[API_KEY];
  if (apiKey === undefined || apiKey === "") {
    return { ok: false, error: `${API_KEY} is not set` };
  }

  return { ok: true, apiKey };
}
