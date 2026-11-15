import { describe, expect, it } from "vitest";

import { overviewGroups } from "@/app/frontend/lib/overview.js";
import { file, folder, inProject } from "./tree-builders.js";

describe("overviewGroups", () => {
  // Shop: smoke.yaml, auth/ (login.yaml, session/ (expire.yaml)), empty/; Blog: nothing; Checkout: cart/ (add.yaml).
  const tree = {
    items: [
      inProject("p-1", "Shop", {
        testFiles: [file("tf-smoke", "smoke.yaml")],
        folders: [
          folder("f-auth", "auth", {
            testFiles: [file("tf-login", "login.yaml")],
            folders: [folder("f-session", "session", { testFiles: [file("tf-expire", "expire.yaml")] })],
          }),
          folder("f-empty", "empty"),
        ],
      }),
      inProject("p-2", "Blog", { folders: [folder("f-drafts", "drafts")] }),
      inProject("p-3", "Checkout", {
        folders: [folder("f-cart", "cart", { testFiles: [file("tf-add", "add.yaml")] })],
      }),
    ],
  };

  it("groups each Project's Test Files by the folder they sit in, with the folder's path in the Project", () => {
    const [shop] = overviewGroups(tree);

    expect(shop!.groups.map((group) => [group.path, group.testFiles.map((testFile) => testFile.id)])).toEqual([
      ["", ["tf-smoke"]],
      ["auth", ["tf-login"]],
      ["auth/session", ["tf-expire"]],
    ]);
  });

  it("keeps only folders and Projects that hold Test Files, in API order", () => {
    const groups = overviewGroups(tree);

    expect(groups.map((project) => project.name)).toEqual(["Shop", "Checkout"]);
    expect(groups[1]!.groups.map((group) => group.path)).toEqual(["cart"]);
  });

  it("keys each group by its folder, or by the Project for the files directly in it", () => {
    const [shop] = overviewGroups(tree);

    expect(shop!.groups.map((group) => group.id)).toEqual(["p-1", "f-auth", "f-session"]);
  });

  it("does not change the tree", () => {
    const before = JSON.stringify(tree);

    overviewGroups(tree);

    expect(JSON.stringify(tree)).toBe(before);
  });
});
