import { expect, test, type Page } from "@playwright/test";

async function registerUniqueUser(page: Page): Promise<string> {
  const email = `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
  const password = "e2e-password-123";
  const form = page.locator("form");

  await page.goto("/login");
  await page.getByRole("button", { name: "Register", exact: true }).click();
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await form.getByRole("button", { name: "Register", exact: true }).click();

  await expect(page).toHaveURL("/");
  return email;
}

test("renames and deletes from sidebar actions", async ({ page }) => {
  await registerUniqueUser(page);

  const sidebar = page.getByRole("navigation", { name: "Projects", exact: true });

  await sidebar.getByRole("button", { name: "New project", exact: true }).click();
  const newProjectDialog = page.getByRole("dialog", { name: "New project", exact: true });
  await newProjectDialog.getByLabel("Name").fill("Shop");
  await newProjectDialog.getByRole("button", { name: "Create", exact: true }).click();

  await sidebar.getByRole("button", { name: "New project", exact: true }).click();
  const secondProjectDialog = page.getByRole("dialog", { name: "New project", exact: true });
  await secondProjectDialog.getByLabel("Name").fill("Checkout");
  await secondProjectDialog.getByRole("button", { name: "Create", exact: true }).click();

  await sidebar.getByRole("button", { name: "New module in Shop", exact: true }).click();
  const newModuleDialog = page.getByRole("dialog", { name: "New module", exact: true });
  await newModuleDialog.getByLabel("Name").fill("Auth");
  await newModuleDialog.getByRole("button", { name: "Create", exact: true }).click();

  await sidebar.getByRole("button", { name: "New test file in Auth", exact: true }).click();
  const newTestFileDialog = page.getByRole("dialog", { name: "New test file", exact: true });
  await newTestFileDialog.getByLabel("Name").fill("login");
  await newTestFileDialog.getByRole("button", { name: "Create", exact: true }).click();

  await expect(page).toHaveURL(/\/files\/[^/]+$/);

  await sidebar.getByRole("button", { name: "Rename test file login.yaml", exact: true }).click();
  const renameTestFileDialog = page.getByRole("dialog", { name: "Rename test file", exact: true });
  const renameInput = renameTestFileDialog.getByLabel("Name");
  await renameInput.fill("checkout.yaml");
  await renameTestFileDialog.getByRole("button", { name: "Save", exact: true }).click();

  await expect(sidebar.getByRole("link", { name: "checkout.yaml", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "checkout.yaml", exact: true })).toBeVisible();

  await sidebar.getByRole("button", { name: "Rename project Checkout", exact: true }).click();
  const renameProjectDialog = page.getByRole("dialog", { name: "Rename project", exact: true });
  await renameProjectDialog.getByLabel("Name").fill("Shop");
  await renameProjectDialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(renameProjectDialog).toBeVisible();
  await expect(renameProjectDialog.getByRole("alert")).toBeVisible();
  await renameProjectDialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(renameProjectDialog).toBeHidden();

  await sidebar.getByRole("button", { name: "Delete test file checkout.yaml", exact: true }).click();
  const deleteTestFileDialog = page.getByRole("dialog", { name: "Delete test file", exact: true });
  await deleteTestFileDialog.getByRole("button", { name: "Delete", exact: true }).click();

  await expect(page).toHaveURL("/");
  await expect(sidebar.getByRole("link", { name: "checkout.yaml", exact: true })).toHaveCount(0);

  await sidebar.getByRole("button", { name: "Delete project Shop", exact: true }).click();
  const deleteProjectDialog = page.getByRole("dialog", { name: "Delete project", exact: true });
  await expect(
    deleteProjectDialog.getByText(
      'Delete project "Shop" and all its modules, test files and variables? Run history is kept.',
      { exact: true },
    ),
  ).toBeVisible();
  await deleteProjectDialog.getByRole("button", { name: "Delete", exact: true }).click();

  const testFilesRegion = page.getByRole("region", { name: "Test files", exact: true });
  await expect(testFilesRegion.getByText("No test files yet", { exact: true })).toBeVisible();
});
