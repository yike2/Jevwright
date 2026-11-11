import { z } from "zod";

const ENV = z.object({
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  JWT_SECRET: z.string().min(32),
  OPENROUTER_API_KEY: z.string().min(1),
  CORS_ORIGIN: z.url(),
  RUNS_DIR: z.string().min(1).default("./data/runs"),
  RUN_CONCURRENCY: z.coerce.number().int().min(1).max(8).default(1),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  BROWSER_ENDPOINT: z.url({ protocol: /^wss?$/ }).optional(),
});

export type Env = z.infer<typeof ENV>;

/** Validates the backend's environment variables (backend.md 1.8); problems name variables, never values. */
export function parseEnv(
  source: Record<string, string | undefined>,
): { ok: true; env: Env } | { ok: false; problems: string[] } {
  const parsed = ENV.safeParse(source);
  if (parsed.success) return { ok: true, env: parsed.data };
  // zod messages describe the rule ("Too small: expected ..."), not the input, so they are safe to print.
  return { ok: false, problems: parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`) };
}
