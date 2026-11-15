import { describe, expect, it } from "vitest";
import { ApiError } from "@/app/frontend/lib/api.js";
import { importEntries, importSummary, NOT_YAML, type ImportEntry } from "@/app/frontend/lib/import.js";
import type { Parent } from "@/app/frontend/lib/tree.js";
import { MAX_SOURCE_CHARS } from "@/app/frontend/lib/validation.js";

const PROJECT: Parent & { level: number } = { projectId: "p-1", folderId: null, level: 1 };
const TOO_DEEP = "Folders can be at most 4 levels deep, counting the project.";
const TAKEN = "A folder or test file with this name already exists in this project.";

const yaml = (path: string, text = "name: x\n"): ImportEntry => ({
  kind: "file",
  path,
  file: { size: text.length, text: async () => text },
});
const dir = (path: string): ImportEntry => ({ kind: "folder", path });

/** A fake API: records each request, answers ids, and refuses the names in `refuse` with their errors. */
function fakeDeps(options: { existing?: Record<string, string>; refuse?: Record<string, Error> } = {}) {
  const calls: string[] = [];
  let next = 0;
  const where = (parent: Parent) => parent.folderId ?? parent.projectId;
  const answer = <T>(call: string, name: string, value: T) => {
    calls.push(call);
    const error = options.refuse?.[name];
    return error ? Promise.reject(error) : Promise.resolve(value);
  };
  return {
    calls,
    deps: {
      createFolder: (parent: Parent, name: string) =>
        answer(`folder ${where(parent)}/${name}`, name, { id: `new-${name}-${(next += 1)}` }),
      createTestFile: (parent: Parent, name: string, source: string) =>
        answer(`file ${where(parent)}/${name} ${JSON.stringify(source)}`, name, { testFile: { id: `tf-${name}` } }),
      existingFolder: (parent: Parent, name: string) => options.existing?.[`${where(parent)}/${name}`],
    },
  };
}

describe("importEntries", () => {
  it("creates each file as a Test File with its text in the drop target", async () => {
    const { calls, deps } = fakeDeps();

    const result = await importEntries(PROJECT, [yaml("login.yaml", "name: login\n")], deps);

    expect(calls).toEqual(['file p-1/login.yaml "name: login\\n"']);
    expect(result).toEqual({ imported: ["tf-login.yaml"], skipped: [] });
  });

  it("creates a dropped folder and its subfolders, each before what is inside it", async () => {
    const { calls, deps } = fakeDeps();

    await importEntries(PROJECT, [yaml("checkout/cards/visa.yaml"), dir("checkout"), dir("checkout/cards")], deps);

    expect(calls).toEqual([
      "folder p-1/checkout",
      "folder new-checkout-1/cards",
      'file new-cards-2/visa.yaml "name: x\\n"',
    ]);
  });

  it("creates an empty dropped folder", async () => {
    const { calls, deps } = fakeDeps();

    await importEntries(PROJECT, [dir("empty")], deps);

    expect(calls).toEqual(["folder p-1/empty"]);
  });

  it("adds to a folder of the same name that already exists instead of creating a second one", async () => {
    const { calls, deps } = fakeDeps({ existing: { "p-1/checkout": "f-checkout" } });

    await importEntries(PROJECT, [dir("checkout"), yaml("checkout/pay.yaml")], deps);

    expect(calls).toEqual(['file f-checkout/pay.yaml "name: x\\n"']);
  });

  it("names a .yml file .yaml, like an upload", async () => {
    const { calls, deps } = fakeDeps();

    await importEntries(PROJECT, [yaml("Checkout.YML")], deps);

    expect(calls).toEqual(['file p-1/Checkout.yaml "name: x\\n"']);
  });

  it("skips a file that is not .yaml or .yml", async () => {
    const { calls, deps } = fakeDeps();

    const result = await importEntries(PROJECT, [yaml("notes.md")], deps);

    expect(calls).toEqual([]);
    expect(result.skipped).toEqual([{ path: "notes.md", reason: NOT_YAML }]);
  });

  it("skips a file whose name breaks the Test File name rules", async () => {
    const { calls, deps } = fakeDeps();

    const result = await importEntries(PROJECT, [yaml("sign in.yaml")], deps);

    expect(calls).toEqual([]);
    expect(result.skipped).toEqual([
      { path: "sign in.yaml", reason: "Use only letters, digits, -, _ and ., with no spaces." },
    ]);
  });

  it("skips a file over the size limit without sending it", async () => {
    const { calls, deps } = fakeDeps();

    const result = await importEntries(PROJECT, [yaml("big.yaml", "x".repeat(MAX_SOURCE_CHARS + 1))], deps);

    expect(calls).toEqual([]);
    expect(result.skipped).toEqual([
      { path: "big.yaml", reason: "The test file is too long: it can be at most 262,144 characters." },
    ]);
  });

  it("skips a file whose name is taken, with the backend's message, and overwrites nothing", async () => {
    const { deps } = fakeDeps({ refuse: { "login.yaml": new ApiError(409, "conflict", TAKEN) } });

    const result = await importEntries(PROJECT, [yaml("login.yaml"), yaml("logout.yaml")], deps);

    expect(result).toEqual({ imported: ["tf-logout.yaml"], skipped: [{ path: "login.yaml", reason: TAKEN }] });
  });

  it("skips a folder below level 4 once, and everything inside it, without a request", async () => {
    const { calls, deps } = fakeDeps();
    const atLevel3 = { projectId: "p-1", folderId: "f-3", level: 3 };

    const result = await importEntries(atLevel3, [dir("a"), dir("a/b"), yaml("a/b/c.yaml"), yaml("a/ok.yaml")], deps);

    expect(calls).toEqual(["folder f-3/a", 'file new-a-1/ok.yaml "name: x\\n"']);
    expect(result.skipped).toEqual([{ path: "a/b/", reason: TOO_DEEP }]);
  });

  it("skips a folder the backend refuses once, and everything inside it", async () => {
    const { calls, deps } = fakeDeps({ refuse: { checkout: new ApiError(409, "conflict", TAKEN) } });

    const result = await importEntries(
      PROJECT,
      [dir("checkout"), yaml("checkout/a.yaml"), yaml("checkout/b.yaml")],
      deps,
    );

    expect(calls).toEqual(["folder p-1/checkout"]);
    expect(result.skipped).toEqual([{ path: "checkout/", reason: TAKEN }]);
  });

  it("skips a folder whose name breaks the name rules", async () => {
    const { calls, deps } = fakeDeps();
    const long = "f".repeat(101);

    const result = await importEntries(PROJECT, [yaml(`${long}/a.yaml`)], deps);

    expect(calls).toEqual([]);
    expect(result.skipped).toEqual([{ path: `${long}/`, reason: "Names can be at most 100 characters." }]);
  });
});

describe("importSummary", () => {
  it("counts the imported Test Files", () => {
    expect(importSummary({ imported: ["a"], skipped: [] })).toBe("Imported 1 test file.");
    expect(importSummary({ imported: ["a", "b"], skipped: [] })).toBe("Imported 2 test files.");
  });

  it("says how many entries were skipped, so the list after it explains each", () => {
    const skipped = [{ path: "notes.md", reason: NOT_YAML }];

    expect(importSummary({ imported: [], skipped })).toBe("Imported no test files. 1 skipped:");
    expect(importSummary({ imported: ["a"], skipped: [...skipped, ...skipped] })).toBe(
      "Imported 1 test file. 2 skipped:",
    );
  });
});
