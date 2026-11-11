import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const root = new URL("../../../../../", import.meta.url);
const read = (path: string) => (existsSync(new URL(path, root)) ? readFileSync(new URL(path, root), "utf8") : "");

describe("deploy files", () => {
  const dockerfile = read("src/app/backend/Dockerfile");

  it("builds the backend on the Playwright image of the pinned playwright package", () => {
    const { playwright } = JSON.parse(read("package.json")).dependencies as Record<string, string>;

    expect(playwright).toMatch(/^\d+\.\d+\.\d+$/);
    expect(dockerfile).toContain(`FROM mcr.microsoft.com/playwright:v${playwright}-`);
  });

  it("runs the backend on the Node major of .nvmrc", () => {
    const major = read(".nvmrc").trim();

    expect(dockerfile).toMatch(new RegExp(`^FROM node:${major}\\.\\d+\\.\\d+-\\S+ AS node$`, "m"));
  });

  it("migrates the database before starting the backend", () => {
    expect(dockerfile).toMatch(/prisma migrate deploy && exec pnpm --filter @jevwright\/backend start/);
  });

  it("proxies the API domain to the backend's port in compose", () => {
    const compose = read("compose.yaml");

    expect(compose).toMatch(/^\s+PORT: 4000$/m);
    expect(read("Caddyfile")).toMatch(/^\{\$API_DOMAIN\} \{\n\treverse_proxy backend:4000\n\}$/m);
  });

  it("uses one Postgres version for production, local development, and CI", () => {
    const image = /image: (postgres:\S+)/;
    const production = image.exec(read("compose.yaml"))?.[1];

    expect(production).toMatch(/^postgres:\d+\.\d+-alpine$/);
    expect(image.exec(read("compose.dev.yaml"))?.[1]).toBe(production);
    expect(image.exec(read(".github/workflows/ci.yml"))?.[1]).toBe(production);
  });
});
