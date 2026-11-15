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

/** The variables of the `.env` in `dir`, parsed and never loaded into `process.env`; `{}` when there is none. */
export function readEnvFile(dir: string): Record<string, string> {
  void dir;
  return {};
}

/** The directories whose `.env` a file reads: the working directory, then each one down to the file's own. */
export function envDirsFor(cwd: string, file: string): string[] {
  void cwd;
  void file;
  return [];
}

/**
 * The `{{VAR}}` values of one file: every `.env` from the working directory down to the file's directory, a nearer
 * one winning, and the shell winning over all. `OPENROUTER_API_KEY` is never a test variable.
 */
export function varsFor(cwd: string, file: string, shell: Env): Record<string, string> {
  void cwd;
  void file;
  void shell;
  return {};
}

/** The Jev API key, from the shell or else the working directory's `.env`. */
export function readConfig(cwd: string, shell: Env): ConfigResult {
  void cwd;
  void shell;
  return { ok: false, error: "" };
}
