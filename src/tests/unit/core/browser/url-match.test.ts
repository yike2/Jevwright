import { describe, expect, it } from "vitest";
import { matchesUrl } from "@/core/browser/url-match.js";

describe("matchesUrl", () => {
  it("matches an absolute URL exactly", () => {
    expect(matchesUrl("https://demo.example.com/board", "https://demo.example.com/board")).toBe(true);
    expect(matchesUrl("https://demo.example.com/board/1", "https://demo.example.com/board")).toBe(false);
  });
});

describe("matchesUrl with a baseUrl", () => {
  it("resolves a relative URL against baseUrl before comparing", () => {
    expect(matchesUrl("https://demo.example.com/board", "/board", "https://demo.example.com/login")).toBe(true);
  });
});

describe("matchesUrl with a glob", () => {
  it("lets ** match across slashes", () => {
    expect(matchesUrl("https://demo.example.com/docs/help", "**/help")).toBe(true);
  });
});

describe("matchesUrl with a single *", () => {
  it("does not let * match a slash", () => {
    expect(matchesUrl("https://demo.example.com/board/1", "https://demo.example.com/*")).toBe(false);
    expect(matchesUrl("https://demo.example.com/board", "https://demo.example.com/*")).toBe(true);
  });
});

describe("matchesUrl with a relative glob", () => {
  it("resolves the glob against baseUrl", () => {
    expect(matchesUrl("https://demo.example.com/board/1", "/board/*", "https://demo.example.com")).toBe(true);
  });
});

describe("matchesUrl with an absolute glob and a baseUrl", () => {
  it("matches the glob as written, even with * in the host", () => {
    expect(matchesUrl("https://help.example.com/a", "https://*.example.com/a", "https://demo.example.com")).toBe(true);
  });
});

describe("matchesUrl with regular expression characters in a glob", () => {
  it("matches them literally", () => {
    expect(matchesUrl("https://demo.example.com/indexXhtml", "**/index.html")).toBe(false);
  });
});

describe("matchesUrl with a glob starting with *", () => {
  it("matches it as written, on any origin, even with a baseUrl", () => {
    expect(matchesUrl("https://help.example.com/help", "**/help", "https://demo.example.com")).toBe(true);
  });
});
