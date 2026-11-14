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

test("creates a valid test file, runs it, and views the live run flow", async ({ page }) => {
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
  await newTestFileDialog.getByLabel("Name").fill("flow");
  await newTestFileDialog.getByRole("button", { name: "Create" }).click();
  await expect(newTestFileDialog).toBeHidden();
  await expect(page).toHaveURL(/\/files\/[^/]+$/);

  const savedSource = 'name: "flow"\nsteps:\n  - open:\n      url: "https://example.com/flow"\n';
  const textarea = page.getByRole("textbox", { name: "Test file YAML" });
  await textarea.fill(savedSource);

  await page.getByRole("button", { name: "Validate" }).click();
  const validationRegion = page.getByRole("region", { name: "Validation" });
  await expect(validationRegion).toContainText("Valid. Ready to run.");

  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Unsaved changes")).toBeHidden();

  await page.getByRole("button", { name: "Run" }).click();
  await expect(page.getByRole("status")).toHaveText("Run queued.");

  await page.getByRole("link", { name: "View run" }).click();
  await expect(page).toHaveURL(/\/runs\/[^/]+$/);

  await expect(page.getByRole("heading", { name: "flow.yaml" })).toBeVisible();
  await expect(page.getByText(/^Status: (Queued|Running|Passed|Failed)$/)).toBeVisible();

  const stepsList = page.getByRole("list", { name: "Steps" });
  await expect(stepsList.getByRole("listitem")).toHaveCount(1);
  await expect(stepsList.getByRole("listitem").first()).toContainText("Step 1");

  await page.getByRole("link", { name: "Back to flow.yaml" }).click();
  await expect(page).toHaveURL(/\/files\/[^/]+$/);

  const runsRegion = page.getByRole("region", { name: "Runs" });
  await expect(runsRegion.getByRole("listitem").filter({ has: page.getByRole("link") })).toHaveCount(1);
});
