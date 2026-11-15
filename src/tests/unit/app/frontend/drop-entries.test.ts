import { describe, expect, it } from "vitest";
import {
  readDroppedEntries,
  type DroppedDirectoryEntry,
  type DroppedFileEntry,
} from "@/app/frontend/lib/drop-entries.js";

function dropFile(name: string, text = name): DroppedFileEntry {
  return {
    name,
    isFile: true,
    isDirectory: false,
    file: (success) => success({ size: text.length, text: async () => text }),
  };
}

/** A dropped folder whose reader answers its entries in batches of `batch`, as Chrome answers at most 100 at a time. */
function dropFolder(
  name: string,
  children: (DroppedFileEntry | DroppedDirectoryEntry)[],
  batch = 2,
): DroppedDirectoryEntry {
  return {
    name,
    isFile: false,
    isDirectory: true,
    createReader: () => {
      let offset = 0;
      return {
        readEntries: (success) => {
          const next = children.slice(offset, offset + batch);
          offset += batch;
          setTimeout(() => success(next));
        },
      };
    },
  };
}

const paths = async (roots: Parameters<typeof readDroppedEntries>[0]) =>
  (await readDroppedEntries(roots)).map((entry) => `${entry.kind} ${entry.path}`);

describe("readDroppedEntries", () => {
  it("answers each dropped file by its name", async () => {
    expect(await paths([dropFile("a.yaml"), dropFile("notes.md")])).toEqual(["file a.yaml", "file notes.md"]);
  });

  it("answers a dropped folder, its subfolders, and their files by path", async () => {
    const roots = [dropFolder("checkout", [dropFile("pay.yaml"), dropFolder("cards", [dropFile("visa.yaml")])])];

    expect(await paths(roots)).toEqual([
      "folder checkout",
      "file checkout/pay.yaml",
      "folder checkout/cards",
      "file checkout/cards/visa.yaml",
    ]);
  });

  it("reads every batch of a large folder", async () => {
    const files = ["1", "2", "3", "4", "5"].map((n) => dropFile(`${n}.yaml`));

    expect(await paths([dropFolder("many", files)])).toHaveLength(6);
  });

  it("keeps each file's text", async () => {
    const [entry] = await readDroppedEntries([dropFile("a.yaml", "name: a\n")]);

    expect(entry?.kind === "file" && (await entry.file.text())).toBe("name: a\n");
  });

  it("skips node_modules and hidden folders inside a dropped folder", async () => {
    const roots = [
      dropFolder("repo", [
        dropFolder("node_modules", [dropFile("a.yaml")]),
        dropFolder(".git", [dropFile("b.yaml")]),
        dropFolder(".github", [dropFile("ci.yaml")]),
        dropFile("login.yaml"),
      ]),
    ];

    expect(await paths(roots)).toEqual(["folder repo", "file repo/login.yaml"]);
  });
});
