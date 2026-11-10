import { lookup as dnsLookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";
import type { BrowserContext } from "playwright";

/** Resolves a host name to every address it has. */
export type Lookup = (hostname: string) => Promise<string[]>;

// Non-public ranges (browser-adapter.md 1.12). IPv4-mapped IPv6 addresses are checked as their IPv4 address.
const BLOCKED = new BlockList();
for (const [prefix, bits] of [
  ["0.0.0.0", 8], // unspecified, "this network"
  ["10.0.0.0", 8], // private
  ["100.64.0.0", 10], // carrier-grade NAT
  ["127.0.0.0", 8], // loopback
  ["169.254.0.0", 16], // link-local, cloud metadata
  ["172.16.0.0", 12], // private
  ["192.168.0.0", 16], // private
  ["224.0.0.0", 4], // multicast
  ["240.0.0.0", 4], // reserved, broadcast
] as const)
  BLOCKED.addSubnet(prefix, bits, "ipv4");
for (const [prefix, bits] of [
  ["::", 128], // unspecified
  ["::1", 128], // loopback
  ["fc00::", 7], // unique local
  ["fe80::", 10], // link-local
  ["ff00::", 8], // multicast
] as const)
  BLOCKED.addSubnet(prefix, bits, "ipv6");

const MAPPED_IPV4 = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i;

/** Whether an IPv4 or IPv6 address is public: not loopback, private, link-local, CGNAT, unspecified, or multicast. */
export function isPublicAddress(address: string): boolean {
  const mapped = MAPPED_IPV4.exec(address)?.[1];
  if (mapped !== undefined) return isPublicAddress(mapped);
  const family = isIP(address);
  if (family === 0) return false;
  return !BLOCKED.check(address, family === 4 ? "ipv4" : "ipv6");
}

const lookupAll: Lookup = async (hostname) =>
  (await dnsLookup(hostname, { all: true, verbatim: true })).map((entry) => entry.address);

/** Whether a request URL may be loaded with `network: "public"`: http(s), and every address of its host public. */
export async function isPublicUrl(url: string, lookup: Lookup = lookupAll): Promise<boolean> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
  const host = parsed.hostname.replace(/^\[(.*)\]$/, "$1"); // IPv6 literals keep their brackets in URL.hostname
  if (isIP(host) !== 0) return isPublicAddress(host);
  try {
    const addresses = await lookup(host);
    return addresses.length > 0 && addresses.every(isPublicAddress);
  } catch {
    // A host that does not resolve cannot be checked, so it is not loaded.
    return false;
  }
}

/** Aborts every request and WebSocket of `context` whose URL is not public (browser-adapter.md 1.12). */
export async function blockPrivateNetwork(context: BrowserContext): Promise<void> {
  await context.route("**/*", async (route) => {
    if (await isPublicUrl(route.request().url())) await route.continue();
    else await route.abort("failed");
  });
  await context.routeWebSocket(/.*/, async (socket) => {
    // A WebSocket URL is ws(s):, which isPublicUrl rejects, so its host is checked as http(s).
    const url = new URL(socket.url());
    url.protocol = url.protocol === "wss:" ? "https:" : "http:";
    if (await isPublicUrl(url.toString())) socket.connectToServer();
    else await socket.close();
  });
}
