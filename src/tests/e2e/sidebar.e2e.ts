import { expect, test, type Locator, type Page } from "@playwright/test";
import { createWorkspace, signUp } from "./support.js";

function sidebarOf(page: Page): Locator {
  return page.getByRole("navigation", { name: "Projects", exact: true });
}

async function create(page: Page, opener: string, dialogName: string, name: string): Promise<Locator> {
  await sidebarOf(page).getByRole("button", { name: opener, exact: true }).click();
  const dialog = page.getByRole("dialog", { name: dialogName, exact: true });
  await dialog.getByLabel("Name").fill(name);
  await dialog.getByRole("button", { name: "Create", exact: true }).click();
  return dialog;
}

test("TC-WS-01 creates a project, module, and test file from the sidebar", async ({ page }) => {
  await signUp(page);
  await page.goto("/");
  const sidebar = sidebarOf(page);

  await expect(await create(page, "New project", "New project", "Demo Shop")).toBeHidden();
  await expect(await create(page, "New module in Demo Shop", "New module", "Shopping")).toBeHidden();
  await expect(await create(page, "New test file in Shopping", "New test file", "login")).toBeHidden();

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
  await page.goto("/");
  const sidebar = sidebarOf(page);
  await create(page, "New project", "New project", "Demo Shop");
  await create(page, "New module in Demo Shop", "New module", "Shopping");
  await create(page, "New test file in Shopping", "New test file", "login");
  await expect(page).toHaveURL(/\/files\/[^/]+$/);

  for (const [opener, dialogName, name] of [
    ["New project", "New project", "Demo Shop"],
    ["New module in Demo Shop", "New module", "Shopping"],
    ["New test file in Shopping", "New test file", "login.yaml"],
  ] as const) {
    const dialog = await create(page, opener, dialogName, name);
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("alert")).toBeVisible();
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  }
  await expect(sidebar.getByText("Demo Shop", { exact: true })).toHaveCount(1);
  await expect(sidebar.getByText("Shopping", { exact: true })).toHaveCount(1);
  await expect(sidebar.getByRole("link", { name: "login.yaml", exact: true })).toHaveCount(1);

  await expect(await create(page, "New project", "New project", "Other")).toBeHidden();
  await expect(await create(page, "New module in Other", "New module", "Shopping")).toBeHidden();
  await sidebar.getByRole("button", { name: "New test file in Shopping", exact: true }).last().click();
  const fileDialog = page.getByRole("dialog", { name: "New test file", exact: true });
  await fileDialog.getByLabel("Name").fill("login");
  await fileDialog.getByRole("button", { name: "Create", exact: true }).click();
  await expect(fileDialog).toBeHidden();
  await expect(sidebar.getByRole("link", { name: "login.yaml", exact: true })).toHaveCount(2);
});

test("TC-WS-03 accepts project names of 1 to 100 characters", async ({ page }) => {
  await signUp(page);
  await page.goto("/");
  const sidebar = sidebarOf(page);

  const empty = await create(page, "New project", "New project", "");
  await expect(empty).toBeVisible();
  await empty.getByRole("button", { name: "Cancel", exact: true }).click();

  const longest = "P".repeat(100);
  await expect(await create(page, "New project", "New project", longest)).toBeHidden();
  await expect(sidebar.getByText(longest, { exact: true })).toBeVisible();

  const tooLong = await create(page, "New project", "New project", "Q".repeat(101));
  await expect(tooLong).toBeVisible();
  await expect(tooLong.getByRole("alert")).toBeVisible();
  await tooLong.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(sidebar.getByText("Q".repeat(101), { exact: true })).toHaveCount(0);
});

test("TC-WS-08 keeps Unicode names and trims surrounding spaces", async ({ page }) => {
  await signUp(page);
  await page.goto("/");
  const sidebar = sidebarOf(page);

  await expect(await create(page, "New project", "New project", "Démo 商店 🛒")).toBeHidden();
  await expect(await create(page, "New project", "New project", "  Padded  ")).toBeHidden();
  const blank = await create(page, "New project", "New project", "   ");
  await expect(blank).toBeVisible();
  await expect(blank.getByRole("alert")).toBeVisible();
  await blank.getByRole("button", { name: "Cancel", exact: true }).click();

  await page.reload();
  await expect(sidebar.getByText("Démo 商店 🛒", { exact: true })).toBeVisible();
  await expect(sidebar.getByText("Padded", { exact: true })).toBeVisible();
  await expect(sidebar.getByRole("button", { name: /^Rename project / })).toHaveCount(2);
});

test("TC-WS-09 names test files with letters, digits, -, _ and ., before a fixed .yaml", async ({ page }) => {
  const { api } = await signUp(page);
  await createWorkspace(api);
  await page.goto("/");
  const sidebar = sidebarOf(page);

  for (const name of ["sign in", "商店", "a/b"]) {
    const dialog = await create(page, "New test file in Shopping", "New test file", name);
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("alert")).toHaveText("Use only letters, digits, -, _ and ., with no spaces.");
    await expect(dialog.getByLabel("Name")).toHaveAttribute("aria-invalid", "true");
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  }
  await expect(sidebar.getByRole("link")).toHaveCount(0);

  await expect(await create(page, "New test file in Shopping", "New test file", "  spaced  ")).toBeHidden();
  await expect(sidebar.getByRole("link", { name: "spaced.yaml", exact: true })).toBeVisible();
  await expect(await create(page, "New test file in Shopping", "New test file", "v1.2")).toBeHidden();
  await expect(sidebar.getByRole("link", { name: "v1.2.yaml", exact: true })).toBeVisible();
  // A pasted file name does not get a second .yaml.
  await expect(await create(page, "New test file in Shopping", "New test file", "pasted.yaml")).toBeHidden();
  await expect(sidebar.getByRole("link", { name: "pasted.yaml", exact: true })).toBeVisible();
});
