import { describe, expect, it } from "vitest";
import { initials, starterSource, statusOf, toTestFileName, type LatestRun } from "@/app/frontend/lib/sidebar.js";

describe("statusOf", () => {
  it("returns 'none' when latestRun is null", () => {
    const latestRun: LatestRun = null;

    expect(statusOf(latestRun)).toBe("none");
  });

  it("returns 'active' when latestRun.status is 'queued'", () => {
    const latestRun: LatestRun = {
      id: "run-1",
      status: "queued",
      createdAt: "2026-11-13T00:00:00.000Z",
    };

    expect(statusOf(latestRun)).toBe("active");
  });

  it("returns 'active' when latestRun.status is 'running'", () => {
    const latestRun: LatestRun = {
      id: "run-1",
      status: "running",
      createdAt: "2026-11-13T00:00:00.000Z",
    };

    expect(statusOf(latestRun)).toBe("active");
  });

  it("returns 'passed' when latestRun.status is 'passed'", () => {
    const latestRun: LatestRun = {
      id: "run-1",
      status: "passed",
      createdAt: "2026-11-13T00:00:00.000Z",
    };

    expect(statusOf(latestRun)).toBe("passed");
  });

  it("returns 'failed' when latestRun.status is 'failed'", () => {
    const latestRun: LatestRun = {
      id: "run-1",
      status: "failed",
      createdAt: "2026-11-13T00:00:00.000Z",
    };

    expect(statusOf(latestRun)).toBe("failed");
  });
});

describe("toTestFileName", () => {
  it("adds .yaml to a bare name", () => {
    expect(toTestFileName("login")).toBe("login.yaml");
  });

  it("leaves an existing .yaml file name unchanged", () => {
    expect(toTestFileName("login.yaml")).toBe("login.yaml");
  });

  it("trims surrounding whitespace and appends .yaml", () => {
    expect(toTestFileName("  login  ")).toBe("login.yaml");
  });

  it("leaves a non-yaml extension unchanged", () => {
    expect(toTestFileName("login.yml")).toBe("login.yml");
  });

  it("returns an empty string for empty input", () => {
    expect(toTestFileName("")).toBe("");
  });

  it("returns an empty string for whitespace-only input", () => {
    expect(toTestFileName("   ")).toBe("");
  });
});

describe("initials", () => {
  it("returns 'ZH' for 'zhimin@example.com'", () => {
    expect(initials("zhimin@example.com")).toBe("ZH");
  });

  it("returns 'A' for 'a@example.com'", () => {
    expect(initials("a@example.com")).toBe("A");
  });

  it("returns 'YI' for 'Yike@example.com'", () => {
    expect(initials("Yike@example.com")).toBe("YI");
  });
});

describe("starterSource", () => {
  it("returns the starter YAML for a login test file", () => {
    expect(starterSource("login.yaml")).toBe('name: "login"\nsteps:\n  - open:\n      url: "https://example.com"\n');
  });
});
