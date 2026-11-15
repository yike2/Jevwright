import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  addFolder,
  addTestFile,
  alertsOf,
  createInSidebar,
  createWorkspace,
  fixture,
  pickNew,
  sidebarOf,
  signUp,
  startRun,
  WORKSPACE,
  type Api,
  type Parent,
} from "./support.js";

const TOO_DEEP = "Folders can be at most 4 levels deep, counting the project.";
const TAKEN_IN_FOLDER = "A folder or test file with this name already exists in this folder.";

/** A folder's or Project's row in the sidebar, found by its name's toggle button. */
function rowOf(page: Page, name: string): Locator {
  return sidebarOf(page).getByRole("button", { name, exact: true });
}

function fileLink(page: Page, name: string): Locator {
  return sidebarOf(page).getByRole("link", { name, exact: true });
}

function messagesOf(page: Page): Locator {
  return sidebarOf(page).getByRole("status", { name: "Sidebar messages", exact: true });
}

/** The ids of the folder or Project a Test File sits in, by its name, from the API's tree. */
async function parentOfFile(api: Api, name: string): Promise<Parent | undefined> {
  type Node = {
    id: string;
    folders: Node[];
    testFiles: { name: string; projectId: string; folderId: string | null }[];
  };
  const tree = await api<{ items: Node[] }>("GET", "/tree");
  const find = (nodes: Node[]): Parent | undefined => {
    for (const node of nodes) {
      const file = node.testFiles.find((testFile) => testFile.name === name);
      if (file) return { projectId: file.projectId, folderId: file.folderId };
      const inside = find(node.folders);
      if (inside) return inside;
    }
    return undefined;
  };
  return find(tree.items);
}

// What a drop from the computer carries, built in the page: files with their text, and folders with what is in them.
type Dropped = { name: string; text: string } | { name: string; children: Dropped[] };

/**
 * Drops files and folders from the computer onto a row. A test cannot drag from the OS, so the drop event is made in
 * the page with the same DataTransfer items and FileSystemEntry methods a real drop has.
 */
async function dropFromComputer(row: Locator, dropped: Dropped[]): Promise<void> {
  await row.evaluate((element, items) => {
    type Item = { name: string; text: string } | { name: string; children: Item[] };
    const toEntry = (item: Item): object =>
      "children" in item
        ? {
            name: item.name,
            isFile: false,
            isDirectory: true,
            createReader: () => {
              let read = false;
              return {
                readEntries: (success: (entries: object[]) => void) => {
                  success(read ? [] : item.children.map(toEntry));
                  read = true;
                },
              };
            },
          }
        : {
            name: item.name,
            isFile: true,
            isDirectory: false,
            file: (success: (file: File) => void) => success(new File([item.text], item.name)),
          };
    const dataTransfer = {
      types: ["Files"],
      items: items.map((item) => ({ kind: "file", webkitGetAsEntry: () => toEntry(item), getAsFile: () => null })),
      dropEffect: "none",
    };
    for (const type of ["dragover", "drop"]) {
      const event = new Event(type, { bubbles: true, cancelable: true });
      Object.defineProperty(event, "dataTransfer", { value: dataTransfer });
      element.dispatchEvent(event);
    }
  }, dropped);
}

/** Drags one sidebar row onto another with the mouse, checking that the target says what a drop does. */
async function dragRow(page: Page, from: Locator, to: Locator): Promise<void> {
  await from.hover();
  await page.mouse.down();
  // Two moves, so the browser fires dragenter and then dragover on the target.
  await to.hover();
  await to.hover();
  await expect(sidebarOf(page).getByText("Move here", { exact: true })).toBeVisible();
  await page.mouse.up();
}

test("TC-FLD-01 nests folders in place down to level 4, where the + menu offers no New folder", async ({ page }) => {
  await signUp(page);
  await page.goto(WORKSPACE);
  const sidebar = sidebarOf(page);

  await createInSidebar(page, "New project", "Shop");
  await createInSidebar(page, { item: "New folder", in: "Shop" }, "account");
  await createInSidebar(page, { item: "New folder", in: "account" }, "profile");
  await createInSidebar(page, { item: "New folder", in: "profile" }, "avatar");
  await expect(rowOf(page, "avatar")).toBeVisible();

  // avatar is level 4, counting the project: it takes Test Files, not folders.
  await sidebar.getByRole("button", { name: "New in avatar", exact: true }).click();
  const menu = page.getByRole("menu");
  await expect(menu.getByRole("menuitem")).toHaveText(["New test file", "Upload files…"]);
  await page.keyboard.press("Escape");
  await createInSidebar(page, { item: "New test file", in: "avatar" }, "upload");
  await expect(fileLink(page, "upload.yaml")).toHaveAttribute("aria-current", "page");

  // A Test File can sit in the project itself, next to its folders.
  await createInSidebar(page, { item: "New test file", in: "Shop" }, "smoke");
  await page.reload();
  await expect(fileLink(page, "smoke.yaml")).toBeVisible();
  await expect(fileLink(page, "upload.yaml")).toBeVisible();
  await pickNew(page, "New folder", "profile");
  await expect(sidebar.getByRole("textbox", { name: "Name", exact: true })).toBeFocused();
});

test("TC-FLD-02 renames a folder and deletes it with everything inside, keeping Run history", async ({ page }) => {
  const { api } = await signUp(page);
  const { projectId, folder } = await createWorkspace(api);
  const cart = await addFolder(api, folder, "Cart");
  const testFileId = await addTestFile(api, cart, "add.yaml", fixture("pass/sign-in.yaml"));
  const runId = await startRun(api, testFileId);
  await page.goto(`/files/${testFileId}`);
  const sidebar = sidebarOf(page);

  await sidebar.getByRole("button", { name: "Rename folder Shopping", exact: true }).click();
  const input = sidebar.getByRole("textbox", { name: "Name", exact: true });
  await input.fill("Store");
  await input.press("Enter");
  await expect(rowOf(page, "Store")).toBeVisible();

  await sidebar.getByRole("button", { name: "Delete folder Store", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Delete folder", exact: true });
  await expect(dialog).toContainText(
    'Delete folder "Store" and every folder and test file in it? Run history is kept.',
  );
  await dialog.getByRole("button", { name: "Delete", exact: true }).click();

  // The open file was inside, so the page returns to the overview.
  await expect(page).toHaveURL(WORKSPACE);
  await expect(rowOf(page, "Cart")).toHaveCount(0);
  await expect(fileLink(page, "add.yaml")).toHaveCount(0);
  const runs = await api<{ items: { id: string; path: string }[] }>("GET", `/runs?projectId=${projectId}`);
  expect(runs.items).toEqual([expect.objectContaining({ id: runId, path: "Shopping/Cart/add.yaml" })]);
});

test("TC-FLD-03 moves a test file and a folder by drag and drop, keeping their Runs", async ({ page }) => {
  const { api } = await signUp(page);
  const { folder } = await createWorkspace(api);
  const blog = await api<{ id: string }>("POST", "/projects", { name: "Blog" });
  const checkout = await addFolder(api, { projectId: folder.projectId, folderId: null }, "Checkout");
  const testFileId = await addTestFile(api, folder, "login.yaml", fixture("pass/sign-in.yaml"));
  const runId = await startRun(api, testFileId);
  await page.goto(WORKSPACE);

  await dragRow(page, fileLink(page, "login.yaml"), rowOf(page, "Checkout"));
  await expect(messagesOf(page)).toContainText("Moved login.yaml to Demo Shop / Checkout.");
  await expect.poll(() => parentOfFile(api, "login.yaml")).toEqual(checkout);

  // A folder moves with everything in it, also to another project.
  await dragRow(page, rowOf(page, "Checkout"), rowOf(page, "Blog"));
  await expect(messagesOf(page)).toContainText("Moved Checkout to Blog.");
  await expect.poll(async () => (await parentOfFile(api, "login.yaml"))?.projectId).toBe(blog.id);
  const runs = await api<{ items: { id: string }[] }>("GET", `/runs?testFileId=${testFileId}`);
  expect(runs.items.map((run) => run.id)).toEqual([runId]);
});

test("TC-FLD-04 refuses a drop that breaks a rule, says why, and changes nothing", async ({ page }) => {
  const { api } = await signUp(page);
  const { folder } = await createWorkspace(api);
  const root = { projectId: folder.projectId, folderId: null };
  const cart = await addFolder(api, folder, "Cart");
  await addTestFile(api, root, "login.yaml", fixture("pass/sign-in.yaml"));
  await addTestFile(api, cart, "login.yaml", fixture("pass/sign-in.yaml"));
  await addFolder(api, await addFolder(api, root, "a"), "b");
  await addFolder(api, await addFolder(api, root, "x"), "y");
  await page.goto(WORKSPACE);

  // A taken name.
  await dragRow(page, fileLink(page, "login.yaml").last(), rowOf(page, "Cart"));
  await expect(alertsOf(page)).toHaveText(`login.yaml was not moved. ${TAKEN_IN_FOLDER}`);
  await expect(fileLink(page, "login.yaml")).toHaveCount(2);

  // A folder into one of its own folders.
  await dragRow(page, rowOf(page, "Shopping"), rowOf(page, "Cart"));
  await expect(alertsOf(page)).toHaveText(
    "Shopping was not moved. A folder cannot be moved into itself or into one of its own folders.",
  );

  // More than 4 levels: x/y into a/b would put y at level 5.
  await dragRow(page, rowOf(page, "x"), rowOf(page, "b"));
  await expect(alertsOf(page)).toHaveText(`x was not moved. ${TOO_DEEP}`);
  const tree = await api<{ items: { folders: { name: string }[] }[] }>("GET", "/tree");
  expect(tree.items[0]!.folders.map((item) => item.name)).toEqual(["a", "Shopping", "x"]);
});

test("TC-FLD-05 moves a test file and a folder with the keyboard through Move to…", async ({ page }) => {
  const { api } = await signUp(page);
  const { folder } = await createWorkspace(api);
  const checkout = await addFolder(api, { projectId: folder.projectId, folderId: null }, "Checkout");
  await addTestFile(api, folder, "login.yaml", fixture("pass/sign-in.yaml"));
  await page.goto(WORKSPACE);
  const sidebar = sidebarOf(page);

  await sidebar.getByRole("button", { name: "Move test file login.yaml", exact: true }).focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "Move login.yaml", exact: true });
  // Every place but the one it is in.
  await expect(dialog.getByRole("list", { name: "Places" }).getByRole("button")).toHaveText([
    "Demo Shop",
    "Demo Shop / Checkout",
  ]);
  await dialog.getByRole("button", { name: "Demo Shop / Checkout", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(dialog).toHaveCount(0);
  await expect.poll(() => parentOfFile(api, "login.yaml")).toEqual(checkout);
  await expect(messagesOf(page)).toContainText("Moved login.yaml to Demo Shop / Checkout.");

  // A folder is not offered itself or the folders inside it.
  await sidebar.getByRole("button", { name: "Move folder Shopping", exact: true }).click();
  const folderDialog = page.getByRole("dialog", { name: "Move Shopping", exact: true });
  await expect(folderDialog.getByRole("list", { name: "Places" }).getByRole("button")).toHaveText([
    "Demo Shop / Checkout",
  ]);
  await folderDialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(folderDialog).toHaveCount(0);
});

test("TC-FLD-06 imports .yaml files and folders dropped from the computer, listing what it skips", async ({ page }) => {
  const { api } = await signUp(page);
  const { folder } = await createWorkspace(api);
  const root = { projectId: folder.projectId, folderId: null };
  await addTestFile(api, root, "login.yaml", fixture("pass/sign-in.yaml"));
  const b = await addFolder(api, await addFolder(api, root, "a"), "b");
  await page.goto(WORKSPACE);

  await dropFromComputer(rowOf(page, "Demo Shop"), [
    { name: "login.yaml", text: "name: other\n" },
    {
      name: "checkout",
      children: [
        { name: "pay.yaml", text: fixture("pass/checkout.yaml") },
        { name: "notes.md", text: "# notes" },
        { name: ".git", children: [{ name: "config.yaml", text: "x" }] },
        { name: "cards", children: [{ name: "visa.yml", text: fixture("invalid/multiple-errors.yaml") }] },
      ],
    },
  ]);

  const messages = messagesOf(page);
  await expect(messages).toContainText("Imported 2 test files. 2 skipped:");
  await expect(messages.getByRole("list", { name: "Skipped" }).getByRole("listitem")).toHaveText([
    "login.yaml: A folder or test file with this name already exists in this project.",
    "checkout/notes.md: Only .yaml and .yml files can be imported.",
  ]);
  await expect(fileLink(page, "pay.yaml")).toBeVisible();
  // Saved with its diagnostics, as an upload is; the hidden .git folder is not imported.
  await expect(fileLink(page, "visa.yaml")).toBeVisible();
  await expect(rowOf(page, ".git")).toHaveCount(0);
  await expect.poll(async () => (await parentOfFile(api, "login.yaml"))?.folderId).toBeNull();
  const original = await api<{ items: { name: string; id: string }[] }>(
    "GET",
    `/projects/${root.projectId}/test-files`,
  );
  const login = original.items.find((item) => item.name === "login.yaml")!;
  expect((await api<{ source: string }>("GET", `/test-files/${login.id}`)).source).toBe(fixture("pass/sign-in.yaml"));

  // Into a level-3 folder, a dropped folder fits at level 4 but its own subfolder does not.
  await dropFromComputer(rowOf(page, "b"), [
    {
      name: "deep",
      children: [
        { name: "y.yaml", text: "name: y\n" },
        { name: "deeper", children: [{ name: "x.yaml", text: "x" }] },
      ],
    },
  ]);
  await expect(messages).toContainText("Imported 1 test file. 1 skipped:");
  await expect(messages.getByRole("list", { name: "Skipped" })).toHaveText(`deep/deeper/: ${TOO_DEEP}`);
  await expect.poll(async () => (await parentOfFile(api, "y.yaml"))?.projectId).toBe(b.projectId);
});
