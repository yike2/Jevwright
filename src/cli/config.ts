import { existsSync } from "node:fs";
import { resolve } from "node:path";

type ConfigSuccess = {
  ok: true;
  apiKey: string;
  vars: Record<string, string>;
};

type ConfigFailure = {
  ok: false;
  error: string;
};

export type ConfigResult = ConfigSuccess | ConfigFailure;

export function loadEnvFile(cwd: string): void {
  const envPath = resolve(cwd, ".env");
  if (!existsSync(envPath)) {
    return;
  }

  process.loadEnvFile(envPath);
}

export function readConfig(env: Readonly<Record<string, string | undefined>>): ConfigResult {
  const apiKey = env.OPENROUTER_API_KEY;
  if (apiKey === undefined || apiKey === "") {
    return { ok: false, error: "OPENROUTER_API_KEY is not set" };
  }

  const vars: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    if (key === "OPENROUTER_API_KEY" || value === undefined) {
      continue;
    }

    vars[key] = value;
  }

  return { ok: true, apiKey, vars };
}
