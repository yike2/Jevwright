import { describe, expect, it, vi } from "vitest";
import { isPublicAddress, isPublicUrl, type Lookup } from "@/core/browser/network.js";

describe("isPublicAddress", () => {
  it.each([
    ["8.8.8.8"],
    ["93.184.216.34"],
    ["172.32.0.1"],
    ["100.128.0.1"],
    ["2606:4700:4700::1111"],
    ["::ffff:8.8.8.8"],
  ])("allows the public address %s", (address) => {
    expect(isPublicAddress(address)).toBe(true);
  });

  it.each([
    ["127.0.0.1", "loopback"],
    ["127.255.255.254", "loopback"],
    ["10.1.2.3", "private"],
    ["172.16.0.1", "private"],
    ["172.31.255.255", "private"],
    ["192.168.1.1", "private"],
    ["169.254.169.254", "link-local (cloud metadata)"],
    ["100.64.0.1", "carrier-grade NAT"],
    ["0.0.0.0", "unspecified"],
    ["224.0.0.1", "multicast"],
    ["255.255.255.255", "broadcast"],
    ["::1", "IPv6 loopback"],
    ["::", "IPv6 unspecified"],
    ["fc00::1", "IPv6 unique local"],
    ["fd12:3456::1", "IPv6 unique local"],
    ["fe80::1", "IPv6 link-local"],
    ["ff02::1", "IPv6 multicast"],
    ["::ffff:127.0.0.1", "IPv4-mapped loopback"],
    ["::ffff:10.0.0.1", "IPv4-mapped private"],
  ])("blocks %s (%s)", (address) => {
    expect(isPublicAddress(address)).toBe(false);
  });

  it("blocks a string that is not an address", () => {
    expect(isPublicAddress("postgres")).toBe(false);
  });
});

describe("isPublicUrl", () => {
  const resolvesTo =
    (...addresses: string[]): Lookup =>
    async () =>
      addresses;

  it("allows http and https URLs whose host resolves only to public addresses", async () => {
    const lookup = vi.fn(resolvesTo("93.184.216.34", "2606:2800:220:1::1"));

    expect(await isPublicUrl("https://example.com/page", lookup)).toBe(true);
    expect(await isPublicUrl("http://example.com:8080/", lookup)).toBe(true);
    expect(lookup).toHaveBeenCalledWith("example.com");
  });

  it("blocks a host with any non-public address", async () => {
    expect(await isPublicUrl("https://mixed.example/", resolvesTo("93.184.216.34", "10.0.0.5"))).toBe(false);
  });

  it("blocks a host that resolves to a private address, like a docker service name", async () => {
    expect(await isPublicUrl("http://postgres:5432/", resolvesTo("172.18.0.2"))).toBe(false);
  });

  it("checks IP literals, IPv6 in brackets too", async () => {
    const lookup = vi.fn(resolvesTo("8.8.8.8"));

    expect(await isPublicUrl("http://127.0.0.1:4000/api", lookup)).toBe(false);
    expect(await isPublicUrl("http://[::1]/", lookup)).toBe(false);
    expect(await isPublicUrl("http://169.254.169.254/latest/meta-data", lookup)).toBe(false);
    expect(await isPublicUrl("http://8.8.8.8/", lookup)).toBe(true);
    expect(lookup).not.toHaveBeenCalled();
  });

  it("blocks schemes other than http and https", async () => {
    const lookup = resolvesTo("93.184.216.34");

    for (const url of ["file:///etc/passwd", "ftp://example.com/", "chrome://settings", "ws://example.com/"]) {
      expect(await isPublicUrl(url, lookup), url).toBe(false);
    }
  });

  it("blocks a host that does not resolve or resolves to nothing", async () => {
    const failing: Lookup = async () => {
      throw new Error("ENOTFOUND");
    };

    expect(await isPublicUrl("https://nowhere.example/", failing)).toBe(false);
    expect(await isPublicUrl("https://empty.example/", resolvesTo())).toBe(false);
  });

  it("blocks a string that is not a URL", async () => {
    expect(await isPublicUrl("not a url", resolvesTo("8.8.8.8"))).toBe(false);
  });
});
