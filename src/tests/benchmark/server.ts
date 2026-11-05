import { createServer, type Server } from "node:http";
import { readFile } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SITE = fileURLToPath(new URL("./demo-app/site/", import.meta.url));
// Pages for what Swag Labs lacks (dialogs, a new tab, hover, right-click); ours, so they stay out of the build.
const EXTRAS = fileURLToPath(new URL("./demo-app/extras/", import.meta.url));

// Every file type the built app holds; browsers run module scripts only with a JavaScript type.
const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
};

/** Serves the Swag Labs demo app on a free local port; returns its base URL and a stop function. */
export async function serveDemoApp(): Promise<{ baseUrl: string; stop: () => Promise<void> }> {
  const server: Server = createServer(async (req, res) => {
    // new URL() resolves "..", so the path stays inside the site or the extras.
    const { pathname } = new URL(req.url ?? "/", "http://x");
    // The app routes on the client, at paths such as /inventory.html that are no file, so they get index.html.
    const path = pathname.startsWith("/extras/") ? join(EXTRAS, pathname.slice("/extras/".length)) : join(SITE, pathname);
    const file = await readFile(path)
      .then((body) => ({ body, type: TYPES[extname(pathname)] ?? "application/octet-stream" }))
      .catch(async () => ({ body: await readFile(join(SITE, "index.html")), type: TYPES[".html"]! }));
    res.writeHead(200, { "content-type": file.type }).end(file.body);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    stop: () => new Promise((resolve) => server.close(() => resolve())),
  };
}
