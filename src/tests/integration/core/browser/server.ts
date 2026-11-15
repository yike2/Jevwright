import { createServer, type IncomingMessage, type Server } from "node:http";
import { readFile } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const FIXTURES = fileURLToPath(new URL("./fixtures/", import.meta.url));

/**
 * Serves the HTML fixtures in `dir` on a free local port, passing every request to `onRequest` first;
 * returns its base URL and a stop function.
 */
export async function serveFixtures(
  dir = FIXTURES,
  onRequest: (req: IncomingMessage) => void = () => {},
  host = "127.0.0.1",
): Promise<{ baseUrl: string; port: number; stop: () => Promise<void> }> {
  const server: Server = createServer(async (req, res) => {
    onRequest(req);
    const { pathname } = new URL(req.url ?? "/", "http://x");
    // Holds back the page's load event, for readiness tests.
    if (pathname === "/slow-resource") return void setTimeout(() => res.writeHead(200).end(), 800);
    if (pathname === "/header.js") {
      const auth = req.headers.authorization ?? "(none)";
      return void res
        .writeHead(200, { "content-type": "application/javascript; charset=utf-8" })
        .end(`document.getElementById("header").textContent = ${JSON.stringify(auth)};`);
    }
    if (pathname === "/echo") {
      const auth = req.headers.authorization ?? "(none)";
      return void res.writeHead(200, { "content-type": "text/plain; charset=utf-8" }).end(auth);
    }
    const file = normalize(join(dir, pathname));
    if (!file.startsWith(dir)) return void res.writeHead(403).end();
    // Read first, so a missing file still gets its 404 status.
    const body = await readFile(file).catch(() => undefined);
    if (body === undefined) res.writeHead(404).end();
    else res.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end(body);
  });
  await new Promise<void>((resolve) => server.listen(0, host, resolve));
  const { port } = server.address() as AddressInfo;
  return {
    baseUrl: `http://${host}:${port}`,
    port,
    stop: () => new Promise((resolve) => server.close(() => resolve())),
  };
}
