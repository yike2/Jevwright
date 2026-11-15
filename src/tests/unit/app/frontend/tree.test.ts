import { describe, expect, it } from "vitest";
import {
  allTestFiles,
  canAddFolder,
  childFolderId,
  levelOf,
  MAX_LEVEL,
  moveDestinations,
  parentOf,
} from "@/app/frontend/lib/tree.js";
import { file, folder, inProject } from "./tree-builders.js";

// Shop: smoke.yaml, checkout/ (pay.yaml, cards/ (visa.yaml)), cart/; Blog: posts/.
const TREE = [
  inProject("shop", "Shop", {
    testFiles: [file("smoke", "smoke.yaml")],
    folders: [
      folder("checkout", "checkout", {
        testFiles: [file("pay", "pay.yaml")],
        folders: [folder("cards", "cards", { testFiles: [file("visa", "visa.yaml")] })],
      }),
      folder("cart", "cart"),
    ],
  }),
  inProject("blog", "Blog", { folders: [folder("posts", "posts")] }),
];

describe("allTestFiles", () => {
  it("lists every Test File at any level, a level's files before its folders'", () => {
    expect(allTestFiles(TREE).map((testFile) => testFile.id)).toEqual(["smoke", "pay", "visa"]);
  });

  it("lists nothing for an empty tree", () => {
    expect(allTestFiles([])).toEqual([]);
  });
});

describe("canAddFolder", () => {
  it("allows a new folder in a Project and in folders above level 4", () => {
    expect(canAddFolder(1)).toBe(true);
    expect(canAddFolder(MAX_LEVEL - 1)).toBe(true);
  });

  it("refuses a new folder in a folder at level 4", () => {
    expect(MAX_LEVEL).toBe(4);
    expect(canAddFolder(4)).toBe(false);
  });
});

describe("parentOf", () => {
  it("answers the Project for a Test File directly in it", () => {
    expect(parentOf(TREE, { kind: "testFile", id: "smoke" })).toEqual({ projectId: "shop", folderId: null });
  });

  it("answers the folder a Test File or folder sits in", () => {
    expect(parentOf(TREE, { kind: "testFile", id: "visa" })).toEqual({ projectId: "shop", folderId: "cards" });
    expect(parentOf(TREE, { kind: "folder", id: "cards" })).toEqual({ projectId: "shop", folderId: "checkout" });
    expect(parentOf(TREE, { kind: "folder", id: "posts" })).toEqual({ projectId: "blog", folderId: null });
  });

  it("answers undefined for a row the tree does not have", () => {
    expect(parentOf(TREE, { kind: "folder", id: "missing" })).toBeUndefined();
  });
});

describe("levelOf", () => {
  it("counts a Project as level 1 and each folder one below its parent", () => {
    expect(levelOf(TREE, { projectId: "shop", folderId: null })).toBe(1);
    expect(levelOf(TREE, { projectId: "shop", folderId: "checkout" })).toBe(2);
    expect(levelOf(TREE, { projectId: "shop", folderId: "cards" })).toBe(3);
  });
});

describe("childFolderId", () => {
  it("finds a folder by name directly in a Project or folder", () => {
    expect(childFolderId(TREE, { projectId: "shop", folderId: null }, "checkout")).toBe("checkout");
    expect(childFolderId(TREE, { projectId: "shop", folderId: "checkout" }, "cards")).toBe("cards");
  });

  it("finds no folder of that name elsewhere, nor a Test File", () => {
    expect(childFolderId(TREE, { projectId: "shop", folderId: null }, "cards")).toBeUndefined();
    expect(childFolderId(TREE, { projectId: "shop", folderId: null }, "smoke.yaml")).toBeUndefined();
  });
});

describe("moveDestinations", () => {
  const labels = (item: Parameters<typeof moveDestinations>[1]) =>
    moveDestinations(TREE, item).map((destination) => destination.label);

  it("offers a Test File every Project and folder with its path, except where it already is", () => {
    expect(labels({ kind: "testFile", id: "pay" })).toEqual([
      "Shop",
      "Shop / checkout / cards",
      "Shop / cart",
      "Blog",
      "Blog / posts",
    ]);
  });

  it("offers a folder no place inside itself", () => {
    expect(labels({ kind: "folder", id: "checkout" })).toEqual(["Shop / cart", "Blog", "Blog / posts"]);
  });

  it("names each place by its Project and folder ids", () => {
    expect(moveDestinations(TREE, { kind: "folder", id: "cart" })).toContainEqual({
      projectId: "blog",
      folderId: "posts",
      label: "Blog / posts",
    });
  });
});
