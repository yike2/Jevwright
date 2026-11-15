import { describe, expect, it } from "vitest";
import {
  heightOf,
  isWithin,
  levelOf,
  MAX_LEVEL,
  nest,
  pathOf,
  subtreeIds,
  type FolderRow,
} from "@/app/backend/src/workspace/folders.js";

// Project/checkout/payments/cards, and Project/cart beside checkout.
const FOLDERS: FolderRow[] = [
  { id: "checkout", parentId: null, name: "checkout" },
  { id: "payments", parentId: "checkout", name: "payments" },
  { id: "cards", parentId: "payments", name: "cards" },
  { id: "cart", parentId: null, name: "cart" },
];

describe("levelOf", () => {
  it("counts the Project as level 1, so a folder directly in it is level 2", () => {
    expect(levelOf(FOLDERS, "checkout")).toBe(2);
  });

  it("adds one level for each folder above", () => {
    expect(levelOf(FOLDERS, "payments")).toBe(3);
    expect(levelOf(FOLDERS, "cards")).toBe(4);
  });

  it("allows at most 4 levels, counting the Project", () => {
    expect(MAX_LEVEL).toBe(4);
  });
});

describe("heightOf", () => {
  it("is 1 for a folder without subfolders", () => {
    expect(heightOf(FOLDERS, "cards")).toBe(1);
    expect(heightOf(FOLDERS, "cart")).toBe(1);
  });

  it("counts the deepest chain of subfolders", () => {
    expect(heightOf(FOLDERS, "checkout")).toBe(3);
    expect(heightOf(FOLDERS, "payments")).toBe(2);
  });
});

describe("isWithin", () => {
  it("is true for the folder itself", () => {
    expect(isWithin(FOLDERS, "checkout", "checkout")).toBe(true);
  });

  it("is true for a folder at any depth inside", () => {
    expect(isWithin(FOLDERS, "payments", "checkout")).toBe(true);
    expect(isWithin(FOLDERS, "cards", "checkout")).toBe(true);
  });

  it("is false for a folder outside, including the folders above", () => {
    expect(isWithin(FOLDERS, "cart", "checkout")).toBe(false);
    expect(isWithin(FOLDERS, "checkout", "payments")).toBe(false);
  });
});

describe("subtreeIds", () => {
  it("lists the folder and every folder inside it", () => {
    expect(subtreeIds(FOLDERS, "checkout").sort()).toEqual(["cards", "checkout", "payments"]);
  });

  it("lists only the folder when it has no subfolders", () => {
    expect(subtreeIds(FOLDERS, "cart")).toEqual(["cart"]);
  });
});

describe("pathOf", () => {
  it("is the file name for a Test File directly in the Project", () => {
    expect(pathOf(FOLDERS, null, "login.yaml")).toBe("login.yaml");
  });

  it("joins the folder names from the Project down with /", () => {
    expect(pathOf(FOLDERS, "checkout", "wrong-total.yaml")).toBe("checkout/wrong-total.yaml");
    expect(pathOf(FOLDERS, "cards", "visa.yaml")).toBe("checkout/payments/cards/visa.yaml");
  });
});

describe("nest", () => {
  it("puts every folder and Test File under its parent, keeping the order given", () => {
    const files = [
      { id: "f1", folderId: null, name: "a.yaml" },
      { id: "f2", folderId: "cards", name: "visa.yaml" },
      { id: "f3", folderId: "checkout", name: "pay.yaml" },
      { id: "f4", folderId: "checkout", name: "total.yaml" },
    ];

    const tree = nest(FOLDERS, files);

    expect(tree.testFiles.map((file) => file.id)).toEqual(["f1"]);
    expect(tree.folders.map((folder) => folder.id)).toEqual(["checkout", "cart"]);
    const [checkout, cart] = tree.folders;
    expect(checkout!.testFiles.map((file) => file.id)).toEqual(["f3", "f4"]);
    expect(checkout!.folders.map((folder) => folder.id)).toEqual(["payments"]);
    expect(checkout!.folders[0]!.folders[0]!).toEqual({ ...FOLDERS[2], folders: [], testFiles: [files[1]] });
    expect(cart).toEqual({ ...FOLDERS[3], folders: [], testFiles: [] });
  });
});
