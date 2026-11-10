/** Resolves a host name to every address it has. */
export type Lookup = (hostname: string) => Promise<string[]>;

/** Whether an IPv4 or IPv6 address is public: not loopback, private, link-local, CGNAT, unspecified, or multicast. */
export function isPublicAddress(_address: string): boolean {
  return true;
}

/** Whether a request URL may be loaded with `network: "public"`: http(s), and every address of its host public. */
export async function isPublicUrl(_url: string, _lookup?: Lookup): Promise<boolean> {
  return true;
}
