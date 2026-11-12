import { z } from "zod";
import type { Network } from "@/core/browser/index.js";

const ENV = z.object({
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  JWT_SECRET: z.string().min(32),
  OPENROUTER_API_KEY: z.string().min(1),
  CORS_ORIGIN: z.url(),
  RUNS_DIR: z.string().min(1).default("./data/runs"),
  RUN_CONCURRENCY: z.coerce.number().int().min(1).max(8).default(1),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  // Only this machine by default, so a local backend is not open to its network; the image sets 0.0.0.0.
  HOST: z.string().min(1).default("127.0.0.1"),
  BROWSER_ENDPOINT: z.url({ protocol: /^wss?$/ }).optional(),
});

export type Env = z.infer<typeof ENV>;

/** The repository's .env, which a local backend reads wherever it starts (backend.md 1.8). */
export const ENV_FILE = new URL("../../../../.env", import.meta.url);

/**
 * Validates the backend's environment variables (backend.md 1.8) and picks the Runs' network: "public", or "any"
 * in dev mode. Problems name variables, never values.
 */
export function parseEnv(
  source: Record<string, string | undefined>,
  options: { dev?: boolean } = {},
): { ok: true; env: Env; runNetwork: Network } | { ok: false; problems: string[] } {
  const parsed = ENV.safeParse(source);
  if (parsed.success) {
    if (!options.dev) return { ok: true, env: parsed.data, runNetwork: "public" };
    // Dev mode's Runs can open this machine's private addresses, so only this machine may reach the backend.
    if (!isLoopback(parsed.data.HOST))
      return { ok: false, problems: ["HOST: dev mode needs a loopback HOST, such as 127.0.0.1"] };
    return { ok: true, env: parsed.data, runNetwork: "any" };
  }
  // zod messages describe the rule ("Too small: expected ..."), not the input, so they are safe to print.
  return { ok: false, problems: parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`) };
}

const isLoopback = (host: string) => host === "localhost" || host === "::1" || /^127\.\d+\.\d+\.\d+$/.test(host);
