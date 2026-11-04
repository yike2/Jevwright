import { createServer, type Server } from "node:http";
import { readFile } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const FIXTURES = fileURLToPath(new URL("./fixtures/", import.meta.url));

/** Serves the HTML fixtures in `dir` on a free local port; returns its base URL and a stop function. */
export async function serveFixtures(dir = FIXTURES): Promise<{ baseUrl: string; stop: () => Promise<void> }> {
  const server: Server = createServer(async (req, res) => {
    const { pathname } = new URL(req.url ?? "/", "http://x");
    // Holds back the page's load event, for readiness tests.
    if (pathname === "/slow-resource") return void setTimeout(() => res.writeHead(200).end(), 800);
    const file = normalize(join(dir, pathname));
    if (!file.startsWith(dir)) return void res.writeHead(403).end();
    try {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end(await readFile(file));
    } catch {
      res.writeHead(404).end();
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    stop: () => new Promise((resolve) => server.close(() => resolve())),
  };
}
