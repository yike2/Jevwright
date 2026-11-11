import { spawn } from "node:child_process";
import { connect, createServer, type AddressInfo } from "node:net";
import { fileURLToPath } from "node:url";

const PLAYWRIGHT = fileURLToPath(new URL("../../../../../node_modules/.bin/playwright", import.meta.url));

/**
 * Starts `playwright run-server` on a free local port, as the browser container runs it, behind a TCP proxy that
 * counts connections, so a test can tell the remote browser was used. Answers the proxy's ws:// URL.
 */
export async function startRunServer() {
  const server = spawn(PLAYWRIGHT, ["run-server", "--port", "0", "--host", "127.0.0.1"], { stdio: "pipe" });
  const target = new URL(
    await new Promise<string>((resolve, reject) => {
      let output = "";
      server.stdout.on("data", (chunk: Buffer) => {
        output += chunk.toString();
        const url = /Listening on (ws:\/\/\S+)/.exec(output)?.[1];
        if (url) resolve(url);
      });
      server.once("exit", (code) => reject(new Error(`playwright run-server exited with ${code}: ${output}`)));
    }),
  );
  let connections = 0;
  const proxy = createServer((client) => {
    connections += 1;
    const upstream = connect(Number(target.port), target.hostname);
    client.pipe(upstream).pipe(client);
    const end = () => (client.destroy(), upstream.destroy());
    client.on("error", end).on("close", end);
    upstream.on("error", end).on("close", end);
  });
  await new Promise<void>((resolve) => proxy.listen(0, "127.0.0.1", resolve));
  const { port } = proxy.address() as AddressInfo;
  return {
    endpoint: `ws://127.0.0.1:${port}${target.pathname}`,
    connections: () => connections,
    stop: () => {
      proxy.close();
      server.kill();
    },
  };
}
