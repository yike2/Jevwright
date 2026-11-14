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

test("shows overview empty state and grouped files after creating a test file", async ({ page }) => {
  await registerUniqueUser(page);

  const sidebar = page.getByRole("navigation", { name: "Projects", exact: true });
  const testFilesRegion = page.getByRole("region", { name: "Test files", exact: true });

  await expect(testFilesRegion.getByText("No test files yet", { exact: true })).toBeVisible();

  await sidebar.getByRole("button", { name: "New project", exact: true }).click();
  const newProjectDialog = page.getByRole("dialog", { name: "New project", exact: true });
  await newProjectDialog.getByLabel("Name").fill("Demo Shop");
  await newProjectDialog.getByRole("button", { name: "Create", exact: true }).click();

  await sidebar.getByRole("button", { name: "New module in Demo Shop", exact: true }).click();
  const newModuleDialog = page.getByRole("dialog", { name: "New module", exact: true });
  await newModuleDialog.getByLabel("Name").fill("Auth");
  await newModuleDialog.getByRole("button", { name: "Create", exact: true }).click();

  await sidebar.getByRole("button", { name: "New test file in Auth", exact: true }).click();
  const newTestFileDialog = page.getByRole("dialog", { name: "New test file", exact: true });
  await newTestFileDialog.getByLabel("Name").fill("login");
  await newTestFileDialog.getByRole("button", { name: "Create", exact: true }).click();

  await page.goto("/");

  const refreshedTestFilesRegion = page.getByRole("region", { name: "Test files", exact: true });
  await expect(refreshedTestFilesRegion.getByRole("heading", { name: "Demo Shop", exact: true })).toBeVisible();
  await expect(refreshedTestFilesRegion.getByRole("heading", { name: "Auth", exact: true })).toBeVisible();

  const fileItem = refreshedTestFilesRegion.getByRole("listitem").filter({
    has: page.getByRole("link", { name: "login.yaml", exact: true }),
  });
  await expect(fileItem).toContainText("Never run");

  await refreshedTestFilesRegion.getByRole("link", { name: "login.yaml", exact: true }).click();
  await expect(page).toHaveURL(/\/files\/[^/]+$/);
});
