import { expect, test, type Page } from "@playwright/test";

async function registerUniqueUser(page: Page): Promise<string> {
  const email = `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
  const password = "e2e-password-123";
  const form = page.locator("form");

  await page.goto("/login");
  await page.getByRole("button", { name: "Register" }).click();
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await form.getByRole("button", { name: "Register" }).click();

  await expect(page).toHaveURL("/");
  return email;
}

test("creates a project, module, and test file from the sidebar", async ({ page }) => {
  await registerUniqueUser(page);

  const sidebar = page.getByRole("navigation", { name: "Projects" });

  await sidebar.getByRole("button", { name: "New project" }).click();
  const newProjectDialog = page.getByRole("dialog", { name: "New project" });
  await newProjectDialog.getByLabel("Name").fill("Demo Shop");
  await newProjectDialog.getByRole("button", { name: "Create" }).click();
  await expect(newProjectDialog).toBeHidden();
  await expect(sidebar.getByText("Demo Shop", { exact: true })).toBeVisible();

  await sidebar.getByRole("button", { name: "New module in Demo Shop" }).click();
  const newModuleDialog = page.getByRole("dialog", { name: "New module" });
  await newModuleDialog.getByLabel("Name").fill("Auth");
  await newModuleDialog.getByRole("button", { name: "Create" }).click();
  await expect(newModuleDialog).toBeHidden();
  await expect(sidebar.getByText("Auth", { exact: true })).toBeVisible();

  await sidebar.getByRole("button", { name: "New test file in Auth" }).click();
  const newTestFileDialog = page.getByRole("dialog", { name: "New test file" });
  await newTestFileDialog.getByLabel("Name").fill("login");
  await newTestFileDialog.getByRole("button", { name: "Create" }).click();
  await expect(newTestFileDialog).toBeHidden();

  await expect(page).toHaveURL(/\/files\/[^/]+$/);
  const loginFileLink = sidebar.getByRole("link", { name: "login.yaml" });
  await expect(loginFileLink).toHaveAttribute("aria-current", "page");
  await expect(loginFileLink.locator("[data-status]")).toHaveAttribute("data-status", "none");

  await page.reload();
  await expect(sidebar.getByText("Demo Shop", { exact: true })).toBeVisible();
  await expect(sidebar.getByText("Auth", { exact: true })).toBeVisible();
  await expect(sidebar.getByRole("link", { name: "login.yaml" })).toBeVisible();
});

test("keeps the dialog open on a duplicate project name", async ({ page }) => {
  await registerUniqueUser(page);

  const sidebar = page.getByRole("navigation", { name: "Projects" });

  await sidebar.getByRole("button", { name: "New project" }).click();
  const firstNewProjectDialog = page.getByRole("dialog", { name: "New project" });
  await firstNewProjectDialog.getByLabel("Name").fill("Demo Shop");
  await firstNewProjectDialog.getByRole("button", { name: "Create" }).click();
  await expect(firstNewProjectDialog).toBeHidden();
  await expect(sidebar.getByText("Demo Shop", { exact: true })).toBeVisible();

  await sidebar.getByRole("button", { name: "New project" }).click();
  const duplicateProjectDialog = page.getByRole("dialog", { name: "New project" });
  await duplicateProjectDialog.getByLabel("Name").fill("Demo Shop");
  await duplicateProjectDialog.getByRole("button", { name: "Create" }).click();

  await expect(duplicateProjectDialog).toBeVisible();
  await expect(duplicateProjectDialog.getByRole("alert")).toBeVisible();
});
