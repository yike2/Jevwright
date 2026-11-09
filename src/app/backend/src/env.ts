export type Env = {
  DATABASE_URL: string;
  JWT_SECRET: string;
  OPENROUTER_API_KEY: string;
  CORS_ORIGIN: string;
  RUNS_DIR: string;
  RUN_CONCURRENCY: number;
  PORT: number;
};

/** Validates the backend's environment variables (backend.md 1.8); problems name variables, never values. */
export function parseEnv(
  source: Record<string, string | undefined>,
): { ok: true; env: Env } | { ok: false; problems: string[] } {
  void source;
  return { ok: false, problems: [] };
}
