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

test("adds, validates, and deletes a project variable", async ({ page }) => {
  await registerUniqueUser(page);

  const sidebar = page.getByRole("navigation", { name: "Projects" });

  await sidebar.getByRole("button", { name: "New project" }).click();
  const newProjectDialog = page.getByRole("dialog", { name: "New project" });
  await newProjectDialog.getByLabel("Name").fill("Demo Shop");
  await newProjectDialog.getByRole("button", { name: "Create" }).click();
  await expect(sidebar.getByText("Demo Shop", { exact: true })).toBeVisible();

  await sidebar.getByRole("button", { name: "Variables for Demo Shop" }).click();
  const variablesDialog = page.getByRole("dialog", { name: "Variables" });
  const valueInput = variablesDialog.getByLabel("Value");
  const nameInput = variablesDialog.getByLabel("Name");
  const saveButton = variablesDialog.getByRole("button", { name: "Save" });

  await nameInput.fill("BASE");
  await valueInput.fill("https://demo.example.com/secret-value");
  await saveButton.click();

  const variableListItem = variablesDialog.getByRole("listitem").filter({ hasText: "BASE" });
  await expect(variableListItem).toContainText("BASE");
  await expect(variableListItem.getByRole("button", { name: "Delete BASE" })).toBeVisible();
  await expect(variablesDialog).not.toContainText("secret-value");
  await expect(valueInput).toHaveValue("");

  await nameInput.fill("base");
  await valueInput.fill("https://demo.example.com/secret-value");
  await saveButton.click();
  await expect(variablesDialog.getByRole("alert")).toHaveText("Name must match [A-Z_][A-Z0-9_]*");

  await variableListItem.getByRole("button", { name: "Delete BASE" }).click();
  await expect(variableListItem).toHaveCount(0);
});
