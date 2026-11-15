import { expect, test } from "@playwright/test";
import { createInSidebar, createWorkspace, editorOf, pickNew, sidebarOf, signUp, WORKSPACE } from "./support.js";

test("TC-WS-01 creates a project, folder, and test file in place in the sidebar", async ({ page }) => {
  await signUp(page);
  await page.goto(WORKSPACE);
  const sidebar = sidebarOf(page);
  const input = sidebar.getByRole("textbox", { name: "Name", exact: true });

  await createInSidebar(page, "New project", "Demo Shop");
  await expect(input).toHaveCount(0);
  await createInSidebar(page, { item: "New folder", in: "Demo Shop" }, "Shopping");
  await expect(input).toHaveCount(0);
  // No dialog: the new row's name is an input in the tree, with the fixed .yaml after it.
  await pickNew(page, "New test file", "Shopping");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(input).toBeFocused();
  await expect(input).toHaveValue("");
  await input.fill("login");
  await input.press("Enter");

  await expect(page).toHaveURL(/\/files\/[^/]+$/);
  await expect(page.getByRole("heading", { name: "login.yaml", exact: true })).toBeVisible();
  const fileLink = sidebar.getByRole("link", { name: "login.yaml", exact: true });
  await expect(fileLink).toHaveAttribute("aria-current", "page");
  const dot = fileLink.locator("[data-status]");
  await expect(dot).toHaveAttribute("data-status", "none");
  await expect(dot).toHaveAttribute("title", "Never run");

  await page.reload();
  await expect(sidebar.getByText("Demo Shop", { exact: true })).toBeVisible();
  await expect(sidebar.getByText("Shopping", { exact: true })).toBeVisible();
  await expect(sidebar.getByRole("link", { name: "login.yaml", exact: true })).toBeVisible();
});

test("TC-WS-02 keeps names unique within their parent only", async ({ page }) => {
  await signUp(page);
  await page.goto(WORKSPACE);
  const sidebar = sidebarOf(page);
  await createInSidebar(page, "New project", "Demo Shop");
  await createInSidebar(page, { item: "New folder", in: "Demo Shop" }, "Shopping");
  await createInSidebar(page, { item: "New test file", in: "Shopping" }, "login");
  await expect(page).toHaveURL(/\/files\/[^/]+$/);

  for (const [what, name] of [
    ["New project", "Demo Shop"],
    [{ item: "New folder", in: "Demo Shop" }, "Shopping"],
    [{ item: "New test file", in: "Shopping" }, "login.yaml"],
    // A folder and a test file in the same folder cannot share a name either.
    [{ item: "New folder", in: "Shopping" }, "login.yaml"],
  ] as const) {
    const input = await createInSidebar(page, what, name);
    // A save that fails keeps the input open with the message under it.
    await expect(input).toBeVisible();
    await expect(sidebar.getByRole("alert")).toBeVisible();
    await expect(input).toHaveAttribute("aria-describedby", /.+/);
    await input.press("Escape");
    await expect(input).toHaveCount(0);
  }
  await expect(sidebar.getByText("Demo Shop", { exact: true })).toHaveCount(1);
  await expect(sidebar.getByText("Shopping", { exact: true })).toHaveCount(1);
  await expect(sidebar.getByRole("link", { name: "login.yaml", exact: true })).toHaveCount(1);

  await createInSidebar(page, "New project", "Other");
  await expect(sidebar.getByText("Other", { exact: true })).toBeVisible();
  await createInSidebar(page, { item: "New folder", in: "Other" }, "Shopping");
  await expect(sidebar.getByText("Shopping", { exact: true })).toHaveCount(2);
  await pickNew(page, "New test file", "Shopping", true);
  const input = sidebar.getByRole("textbox", { name: "Name", exact: true });
  await input.fill("login");
  await input.press("Enter");
  await expect(sidebar.getByRole("link", { name: "login.yaml", exact: true })).toHaveCount(2);
});

test("TC-WS-03 accepts project names of 1 to 100 characters", async ({ page }) => {
  await signUp(page);
  await page.goto(WORKSPACE);
  const sidebar = sidebarOf(page);

  const empty = await createInSidebar(page, "New project", "");
  await expect(empty).toBeVisible();
  await expect(sidebar.getByRole("alert")).toHaveText("Enter a name.");
  await empty.press("Escape");

  const longest = "P".repeat(100);
  await createInSidebar(page, "New project", longest);
  await expect(sidebar.getByText(longest, { exact: true })).toBeAttached();

  const tooLong = await createInSidebar(page, "New project", "Q".repeat(101));
  await expect(tooLong).toBeVisible();
  await expect(sidebar.getByRole("alert")).toHaveText("Names can be at most 100 characters.");
  await tooLong.press("Escape");
  await expect(sidebar.getByText("Q".repeat(101), { exact: true })).toHaveCount(0);
});

test("TC-WS-08 keeps Unicode names and trims surrounding spaces", async ({ page }) => {
  await signUp(page);
  await page.goto(WORKSPACE);
  const sidebar = sidebarOf(page);

  await createInSidebar(page, "New project", "Démo 商店 🛒");
  await expect(sidebar.getByText("Démo 商店 🛒", { exact: true })).toBeVisible();
  await createInSidebar(page, "New project", "  Padded  ");
  await expect(sidebar.getByText("Padded", { exact: true })).toBeVisible();
  const blank = await createInSidebar(page, "New project", "   ");
  await expect(blank).toBeVisible();
  await expect(sidebar.getByRole("alert")).toBeVisible();
  await blank.press("Escape");

  await page.reload();
  await expect(sidebar.getByText("Démo 商店 🛒", { exact: true })).toBeVisible();
  await expect(sidebar.getByText("Padded", { exact: true })).toBeVisible();
  await expect(sidebar.getByRole("button", { name: /^Rename project / })).toHaveCount(2);
});

test("TC-WS-09 names test files with letters, digits, -, _ and ., before a fixed .yaml", async ({ page }) => {
  const { api } = await signUp(page);
  await createWorkspace(api);
  await page.goto(WORKSPACE);
  const sidebar = sidebarOf(page);
  const requests: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST" && request.url().includes("/test-files")) requests.push(request.url());
  });

  for (const name of ["sign in", "商店", "a/b"]) {
    const input = await createInSidebar(page, { item: "New test file", in: "Shopping" }, name);
    // The problem shows as the user types, and nothing is sent.
    await expect(sidebar.getByRole("alert")).toHaveText("Use only letters, digits, -, _ and ., with no spaces.");
    await expect(input).toHaveAttribute("aria-invalid", "true");
    await input.press("Escape");
  }
  await expect(sidebar.getByRole("link", { name: /\.yaml$/ })).toHaveCount(0);
  expect(requests).toEqual([]);

  await createInSidebar(page, { item: "New test file", in: "Shopping" }, "  spaced  ");
  await expect(sidebar.getByRole("link", { name: "spaced.yaml", exact: true })).toBeVisible();
  await createInSidebar(page, { item: "New test file", in: "Shopping" }, "v1.2");
  await expect(sidebar.getByRole("link", { name: "v1.2.yaml", exact: true })).toBeVisible();
  // A pasted file name does not get a second .yaml.
  await createInSidebar(page, { item: "New test file", in: "Shopping" }, "pasted.yaml");
  await expect(sidebar.getByRole("link", { name: "pasted.yaml", exact: true })).toBeVisible();
  await expect(editorOf(page).source).toBeVisible();
});

test("TC-WS-10 widens the sidebar, keeps its width, and shows a cut-off name in full", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  const { api } = await signUp(page);
  const long = "Checkout flows for returning customers with saved cards";
  await api("POST", "/projects", { name: long });
  await page.goto(WORKSPACE);
  const sidebar = sidebarOf(page);
  const row = sidebar.getByRole("button", { name: long, exact: true });
  const handle = page.getByRole("separator", { name: "Resize sidebar" });
  const before = (await sidebar.boundingBox())!.width;

  // A cut-off name shows in full on hover and on keyboard focus; the row's accessible name is the whole name.
  await row.hover();
  await expect(page.locator("[data-slot=tooltip-content]")).toHaveText(long);
  await page.mouse.move(800, 400);
  await row.focus();
  await expect(page.locator("[data-slot=tooltip-content]")).toHaveText(long);

  await handle.focus();
  for (let i = 0; i < 5; i += 1) await page.keyboard.press("ArrowRight");
  await expect.poll(async () => (await sidebar.boundingBox())!.width).toBeGreaterThan(before + 20);
  const after = (await sidebar.boundingBox())!.width;

  await page.reload();
  await expect.poll(async () => Math.round((await sidebarOf(page).boundingBox())!.width)).toBe(Math.round(after));
});
