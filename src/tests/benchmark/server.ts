import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

/** Serves the Swag Labs demo app on a free local port; returns its base URL and a stop function. */
export async function serveDemoApp(): Promise<{ baseUrl: string; stop: () => Promise<void> }> {
  const server: Server = createServer((_req, res) => res.writeHead(404).end());
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    stop: () => new Promise((resolve) => server.close(() => resolve())),
  };
}
