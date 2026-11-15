import { describe, expect, it } from "vitest";
import type { TreeResponse } from "@/app/frontend/lib/api.js";
import {
  confirmDeleteText,
  deletesTestFile,
  hasActiveRun,
  initials,
  starterSource,
  statusOf,
  statusTitle,
  testFileBaseName,
  toTestFileName,
  uploadedTestFileName,
  hasQuickStart,
  type LatestRun,
} from "@/app/frontend/lib/sidebar.js";
import { file, folder, inProject } from "./tree-builders.js";

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
  it("adds .yaml to the name typed before the fixed suffix", () => {
    expect(toTestFileName("login")).toBe("login.yaml");
  });

  it("does not add a second .yaml to a pasted file name", () => {
    expect(toTestFileName("login.yaml")).toBe("login.yaml");
  });

  it("trims surrounding whitespace", () => {
    expect(toTestFileName("  login  ")).toBe("login.yaml");
  });

  it("adds .yaml after any other dot, since the suffix is always .yaml", () => {
    expect(toTestFileName("v1.2")).toBe("v1.2.yaml");
  });

  it("returns an empty string for empty or whitespace-only input", () => {
    expect(toTestFileName("")).toBe("");
    expect(toTestFileName("   ")).toBe("");
  });
});

describe("testFileBaseName", () => {
  it("drops the .yaml suffix, for the Rename input", () => {
    expect(testFileBaseName("sign-in.yaml")).toBe("sign-in");
  });

  it("keeps a name without the suffix", () => {
    expect(testFileBaseName("notes")).toBe("notes");
  });
});

describe("uploadedTestFileName", () => {
  it.each([
    ["checkout.yaml", "checkout.yaml"],
    ["checkout.yml", "checkout.yaml"],
    ["Checkout.YML", "Checkout.yaml"],
    ["v1.2.yaml", "v1.2.yaml"],
  ])("names an upload of %s %s", (fileName, name) => {
    expect(uploadedTestFileName(fileName)).toBe(name);
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
      'Delete project "Shop" and all its folders, test files and variables? Run history is kept.',
    );
  });

  it("returns folder cascade confirmation text", () => {
    expect(confirmDeleteText("folder", "Cart")).toBe(
      'Delete folder "Cart" and every folder and test file in it? Run history is kept.',
    );
  });

  it("returns test file confirmation text", () => {
    expect(confirmDeleteText("testFile", "login.yaml")).toBe('Delete test file "login.yaml"? Run history is kept.');
  });
});

describe("deletesTestFile", () => {
  // Project 1: login.yaml in auth/session/; Project 2: checkout.yaml directly in it.
  const tree: TreeResponse = {
    items: [
      inProject("p-1", "Project 1", {
        folders: [
          folder("f-1", "auth", { folders: [folder("f-2", "session", { testFiles: [file("tf-1", "login.yaml")] })] }),
        ],
      }),
      inProject("p-2", "Project 2", { folders: [folder("f-3", "other")], testFiles: [file("tf-2", "checkout.yaml")] }),
    ],
  };

  it("returns true for deleting the current test file", () => {
    expect(deletesTestFile(tree, { kind: "testFile", id: "tf-1" }, "tf-1")).toBe(true);
  });

  it("returns false for deleting a different test file", () => {
    expect(deletesTestFile(tree, { kind: "testFile", id: "tf-2" }, "tf-1")).toBe(false);
  });

  it("returns true for deleting a folder that holds the current test file at any depth", () => {
    expect(deletesTestFile(tree, { kind: "folder", id: "f-2" }, "tf-1")).toBe(true);
    expect(deletesTestFile(tree, { kind: "folder", id: "f-1" }, "tf-1")).toBe(true);
  });

  it("returns false for deleting a different folder", () => {
    expect(deletesTestFile(tree, { kind: "folder", id: "f-3" }, "tf-1")).toBe(false);
  });

  it("returns true for deleting the project that contains the current test file", () => {
    expect(deletesTestFile(tree, { kind: "project", id: "p-1" }, "tf-1")).toBe(true);
    expect(deletesTestFile(tree, { kind: "project", id: "p-2" }, "tf-2")).toBe(true);
  });

  it("returns false for deleting a different project", () => {
    expect(deletesTestFile(tree, { kind: "project", id: "p-2" }, "tf-1")).toBe(false);
  });

  it("returns false when current test file id is null", () => {
    expect(deletesTestFile(tree, { kind: "project", id: "p-1" }, null)).toBe(false);
  });
});

describe("hasQuickStart", () => {
  it("is true when a Project is named Quick Start", () => {
    expect(hasQuickStart([inProject("p-1", "Shop"), inProject("p-2", "Quick Start")])).toBe(true);
  });

  it("is false without a Project named exactly Quick Start", () => {
    expect(hasQuickStart([])).toBe(false);
    expect(hasQuickStart([inProject("p-1", "Quick Start 2"), inProject("p-2", "quick start")])).toBe(false);
  });
});

describe("hasActiveRun", () => {
  it.each(["queued", "running"] as const)("is true when a file at any depth is %s", (status) => {
    const active: LatestRun = { id: "run-1", status, createdAt: "2026-11-13T00:00:00.000Z" };
    const tree = [
      inProject("p-1", "Shop", {
        folders: [folder("f-1", "Auth", { testFiles: [file("tf-1", "login.yaml", active)] })],
      }),
    ];
    expect(hasActiveRun(tree)).toBe(true);
  });

  it("is false when every file has finished or never run", () => {
    const passed: LatestRun = { id: "run-1", status: "passed", createdAt: "2026-11-13T00:00:00.000Z" };
    const failed: LatestRun = { id: "run-2", status: "failed", createdAt: "2026-11-13T00:00:00.000Z" };
    const tree = [
      inProject("p-1", "Shop", {
        testFiles: [file("tf-1", "smoke.yaml", passed)],
        folders: [
          folder("f-1", "Auth", {
            testFiles: [file("tf-2", "login.yaml", failed), file("tf-3", "logout.yaml")],
          }),
        ],
      }),
    ];
    expect(hasActiveRun(tree)).toBe(false);
  });
});
