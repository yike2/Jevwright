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

test("validates, saves, reloads, and runs a test file from the editor", async ({ page }) => {
  await registerUniqueUser(page);

  const sidebar = page.getByRole("navigation", { name: "Projects" });

  await sidebar.getByRole("button", { name: "New project" }).click();
  const newProjectDialog = page.getByRole("dialog", { name: "New project" });
  await newProjectDialog.getByLabel("Name").fill("Demo Shop");
  await newProjectDialog.getByRole("button", { name: "Create" }).click();
  await expect(sidebar.getByText("Demo Shop", { exact: true })).toBeVisible();

  await sidebar.getByRole("button", { name: "New module in Demo Shop" }).click();
  const newModuleDialog = page.getByRole("dialog", { name: "New module" });
  await newModuleDialog.getByLabel("Name").fill("Auth");
  await newModuleDialog.getByRole("button", { name: "Create" }).click();
  await expect(sidebar.getByText("Auth", { exact: true })).toBeVisible();

  await sidebar.getByRole("button", { name: "New test file in Auth" }).click();
  const newTestFileDialog = page.getByRole("dialog", { name: "New test file" });
  await newTestFileDialog.getByLabel("Name").fill("editor");
  await newTestFileDialog.getByRole("button", { name: "Create" }).click();
  await expect(newTestFileDialog).toBeHidden();
  await expect(page).toHaveURL(/\/files\/[^/]+$/);

  const textarea = page.getByRole("textbox", { name: "Test file YAML" });
  await expect(textarea).toHaveValue('name: "editor"\nsteps:\n  - open:\n      url: "https://example.com"\n');

  await textarea.fill('name: "editor"\nsteps:\n  - aiAct:\n      url: "https://example.com"\n');
  await expect(page.getByText("Unsaved changes")).toBeVisible();
  await page.getByRole("button", { name: "Validate" }).click();

  const validationRegion = page.getByRole("region", { name: "Validation" });
  await expect(validationRegion.getByText("1 validation error")).toBeVisible();
  await expect(validationRegion.getByRole("listitem").first()).toContainText("Line 3:");

  await textarea.fill('name: "editor"\nsteps:\n  - open:\n      url: "https://example.com"\n');
  const saveButton = page.getByRole("button", { name: "Save" });
  await saveButton.click();

  await expect(page.getByText("Unsaved changes")).toBeHidden();
  await expect(saveButton).toBeDisabled();

  await page.reload();
  await expect(textarea).toHaveValue('name: "editor"\nsteps:\n  - open:\n      url: "https://example.com"\n');

  await page.getByRole("button", { name: "Run" }).click();
  await expect(page.getByRole("status")).toHaveText("Run queued.");
});
