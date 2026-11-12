import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { NON_PUBLIC_RANGES } from "@/core/browser/network.js";

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

  it("listens on every interface inside its container, so Caddy can reach it", () => {
    expect(dockerfile).toMatch(/^ENV .*\bHOST=0\.0\.0\.0\b/m);
  });

  it("starts the backend in dev mode only from the development scripts, never in production", () => {
    const root = JSON.parse(read("package.json")).scripts as Record<string, string>;
    const backend = JSON.parse(read("src/app/backend/package.json")).scripts as Record<string, string>;

    expect(root.backend).toMatch(/ --dev$/);
    expect(root["backend:debug"]).toMatch(/^tsx --inspect\S* src\/app\/backend\/src\/main\.ts --dev$/);
    expect(backend.dev).toMatch(/ --dev$/);
    expect(backend.start).not.toContain("--dev");
    expect(dockerfile).toContain("pnpm --filter @jevwright/backend start");
  });

  it("migrates the database before starting the backend", () => {
    expect(dockerfile).toMatch(/prisma migrate deploy && exec pnpm --filter @jevwright\/backend start/);
  });

  it("proxies the API domain to the backend's port in compose", () => {
    const compose = read("compose.yaml");

    expect(compose).toMatch(/^\s+PORT: 4000$/m);
    expect(read("Caddyfile")).toMatch(/^\{\$API_DOMAIN\} \{\n\treverse_proxy backend:4000\n\}$/m);
  });

  it("serves the Demo App on DEMO_DOMAIN like serveDemoApp: extras, the build, and index.html for client routes", () => {
    const caddyfile = read("demo-app.Caddyfile");
    const demo = /^\{\$DEMO_DOMAIN\} \{\n([\s\S]*?)^\}$/m.exec(caddyfile)?.[1] ?? "";

    expect(demo).toMatch(/handle_path \/extras\/\* \{\s+root \* \/srv\/demo\/extras\s+file_server\s+\}/);
    expect(demo).toMatch(/root \* \/srv\/demo\/site\s+try_files \{path\} \/index\.html\s+file_server/);
    const compose = read("compose.yaml");
    expect(compose).toContain("./src/tests/benchmark/demo-app/site:/srv/demo/site:ro");
    expect(compose).toContain("./src/tests/benchmark/demo-app/extras:/srv/demo/extras:ro");
    expect(compose).toMatch(/DEMO_DOMAIN: \$\{DEMO_DOMAIN:\?/);
  });

  it("keeps the Demo App's site in one file, which the full Caddyfile imports and compose mounts beside it", () => {
    expect(read("Caddyfile")).toMatch(/^import \/etc\/caddy\/demo-app\.Caddyfile$/m);
    expect(read("Caddyfile")).not.toContain("{$DEMO_DOMAIN}");
    expect(read("compose.yaml")).toContain("./demo-app.Caddyfile:/etc/caddy/demo-app.Caddyfile:ro");
  });

  it("uses one Postgres version for production, local development, and CI", () => {
    const image = /image: (postgres:\S+)/;
    const production = image.exec(read("compose.yaml"))?.[1];

    expect(production).toMatch(/^postgres:\d+\.\d+-alpine$/);
    expect(image.exec(read("compose.dev.yaml"))?.[1]).toBe(production);
    expect(image.exec(read(".github/workflows/ci.yml"))?.[1]).toBe(production);
  });

  describe("the browser container", () => {
    const browserfile = read("src/app/backend/browser.Dockerfile");
    const firewall = read("src/app/backend/browser-firewall.sh");
    const compose = read("compose.yaml");
    const service = (name: string) => new RegExp(`^  ${name}:\n((?:    .*\n|\n)*)`, "m").exec(compose)?.[1] ?? "";

    it("serves the pinned playwright version's browser with run-server", () => {
      const { playwright } = JSON.parse(read("package.json")).dependencies as Record<string, string>;

      expect(browserfile).toContain(`FROM mcr.microsoft.com/playwright:v${playwright}-`);
      expect(browserfile).toContain(`playwright@${playwright}`);
      expect(firewall).toMatch(/playwright run-server --port 3000 --host 0\.0\.0\.0/);
    });

    it("blocks every non-public range of network.ts for outgoing connections, IPv4 and IPv6", () => {
      for (const [prefix, bits] of NON_PUBLIC_RANGES.ipv4)
        expect(firewall).toMatch(new RegExp(`^\\s*${prefix.replaceAll(".", "\\.")}/${bits}\\b`, "m"));
      for (const [prefix, bits] of NON_PUBLIC_RANGES.ipv6) expect(firewall).toContain(`${prefix}/${bits}`);
    });

    it("drops root and every capability before it starts the browser server", () => {
      expect(firewall).toMatch(/^set -eu$/m);
      expect(firewall).toMatch(
        /exec setpriv --reuid=pwuser --regid=pwuser --init-groups --inh-caps=-all --bounding-set=-all/,
      );
    });

    it("limits the browser's memory, CPU, and processes, so one page cannot exhaust the server", () => {
      expect(service("browser")).toMatch(/^ {4}mem_limit: \d+[mg]$/m);
      expect(service("browser")).toMatch(/^ {4}cpus: "\d+(\.\d+)?"$/m);
      expect(service("browser")).toMatch(/^ {4}pids_limit: \d+$/m);
    });

    it("runs with NET_ADMIN for its firewall, only on the browser network, and the backend drives it", () => {
      expect(service("browser")).toMatch(/cap_add: \[NET_ADMIN\]/);
      expect(service("browser")).toMatch(/networks: \[browser\]/);
      expect(service("backend")).toMatch(/BROWSER_ENDPOINT: ws:\/\/browser:3000\//);
      expect(service("backend")).toMatch(/networks: \[data, web, browser\]/);
    });
  });
});
