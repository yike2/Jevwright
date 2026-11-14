import { describe, expect, it } from "vitest";
import type { TreeResponse } from "@/app/frontend/lib/api.js";
import {
  confirmDeleteText,
  deletesTestFile,
  initials,
  starterSource,
  statusOf,
  statusTitle,
  toTestFileName,
  type LatestRun,
} from "@/app/frontend/lib/sidebar.js";

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

describe("statusTitle", () => {
  it("maps none to Never run", () => {
    expect(statusTitle("none")).toBe("Never run");
  });

  it("maps active to Running", () => {
    expect(statusTitle("active")).toBe("Running");
  });

  it("maps passed to Passed", () => {
    expect(statusTitle("passed")).toBe("Passed");
  });

  it("maps failed to Failed", () => {
    expect(statusTitle("failed")).toBe("Failed");
  });
});

describe("confirmDeleteText", () => {
  it("returns project cascade confirmation text", () => {
    expect(confirmDeleteText("project", "Shop")).toBe(
      'Delete project "Shop" and all its modules, test files and variables? Run history is kept.',
    );
  });

  it("returns module cascade confirmation text", () => {
    expect(confirmDeleteText("module", "Cart")).toBe(
      'Delete module "Cart" and all its test files? Run history is kept.',
    );
  });

  it("returns test file confirmation text", () => {
    expect(confirmDeleteText("testFile", "login.yaml")).toBe('Delete test file "login.yaml"? Run history is kept.');
  });
});

describe("deletesTestFile", () => {
  const tree: TreeResponse = {
    items: [
      {
        id: "p-1",
        name: "Project 1",
        createdAt: "2026-11-13T00:00:00.000Z",
        updatedAt: "2026-11-13T00:00:00.000Z",
        modules: [
          {
            id: "m-1",
            projectId: "p-1",
            name: "Module 1",
            createdAt: "2026-11-13T00:00:00.000Z",
            updatedAt: "2026-11-13T00:00:00.000Z",
            testFiles: [
              {
                id: "tf-1",
                moduleId: "m-1",
                name: "login.yaml",
                createdAt: "2026-11-13T00:00:00.000Z",
                updatedAt: "2026-11-13T00:00:00.000Z",
                latestRun: null,
              },
            ],
          },
        ],
      },
      {
        id: "p-2",
        name: "Project 2",
        createdAt: "2026-11-13T00:00:00.000Z",
        updatedAt: "2026-11-13T00:00:00.000Z",
        modules: [
          {
            id: "m-2",
            projectId: "p-2",
            name: "Module 2",
            createdAt: "2026-11-13T00:00:00.000Z",
            updatedAt: "2026-11-13T00:00:00.000Z",
            testFiles: [
              {
                id: "tf-2",
                moduleId: "m-2",
                name: "checkout.yaml",
                createdAt: "2026-11-13T00:00:00.000Z",
                updatedAt: "2026-11-13T00:00:00.000Z",
                latestRun: null,
              },
            ],
          },
        ],
      },
    ],
  };

  it("returns true for deleting the current test file", () => {
    expect(deletesTestFile(tree, { kind: "testFile", id: "tf-1" }, "tf-1")).toBe(true);
  });

  it("returns false for deleting a different test file", () => {
    expect(deletesTestFile(tree, { kind: "testFile", id: "tf-2" }, "tf-1")).toBe(false);
  });

  it("returns true for deleting the module that contains the current test file", () => {
    expect(deletesTestFile(tree, { kind: "module", id: "m-1" }, "tf-1")).toBe(true);
  });

  it("returns false for deleting a different module", () => {
    expect(deletesTestFile(tree, { kind: "module", id: "m-2" }, "tf-1")).toBe(false);
  });

  it("returns true for deleting the project that contains the current test file", () => {
    expect(deletesTestFile(tree, { kind: "project", id: "p-1" }, "tf-1")).toBe(true);
  });

  it("returns false for deleting a different project", () => {
    expect(deletesTestFile(tree, { kind: "project", id: "p-2" }, "tf-1")).toBe(false);
  });

  it("returns false when current test file id is null", () => {
    expect(deletesTestFile(tree, { kind: "project", id: "p-1" }, null)).toBe(false);
  });
});
