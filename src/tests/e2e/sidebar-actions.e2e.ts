import { expect, test, type Page } from "@playwright/test";
import { addTestFile, createWorkspace, fixture, setDemoVariables, signUp } from "./support.js";

async function openWorkspaceFile(page: Page): Promise<void> {
  const { api } = await signUp(page);
  const { moduleId } = await createWorkspace(api);
  const testFileId = await addTestFile(api, moduleId, "login.yaml", fixture("pass/sign-in.yaml"));
  await page.goto(`/files/${testFileId}`);
  await expect(page.getByRole("heading", { name: "login.yaml", exact: true })).toBeVisible();
}

async function rename(page: Page, button: string, dialogName: string, name: string): Promise<void> {
  await page.getByRole("button", { name: button, exact: true }).click();
  const dialog = page.getByRole("dialog", { name: dialogName, exact: true });
  await dialog.getByLabel("Name").fill(name);
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(dialog).toBeHidden();
}

test("TC-WS-04 renames a project, a module, and the open test file", async ({ page }) => {
  await openWorkspaceFile(page);
  const sidebar = page.getByRole("navigation", { name: "Projects", exact: true });

  await rename(page, "Rename test file login.yaml", "Rename test file", "sign-in");
  await expect(sidebar.getByRole("link", { name: "sign-in.yaml", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "sign-in.yaml", exact: true })).toBeVisible();

  await rename(page, "Rename module Shopping", "Rename module", "Checkout");
  await expect(sidebar.getByText("Checkout", { exact: true })).toBeVisible();

  await rename(page, "Rename project Demo Shop", "Rename project", "Swag Labs");
  await expect(sidebar.getByText("Swag Labs", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Rename test file sign-in.yaml", exact: true }).click();
  const unchanged = page.getByRole("dialog", { name: "Rename test file", exact: true });
  await expect(unchanged.getByLabel("Name")).toHaveValue("sign-in");
  await expect(unchanged.getByRole("button", { name: "Save", exact: true })).toBeDisabled();
});

test("TC-WS-05 deletes the open test file and returns to the overview", async ({ page }) => {
  await openWorkspaceFile(page);

  await page.getByRole("button", { name: "Delete test file login.yaml", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Delete test file", exact: true });
  await expect(dialog.getByText('Delete test file "login.yaml"? Run history is kept.', { exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "Delete", exact: true }).click();

  await expect(page).toHaveURL("/");
  await expect(page.getByRole("link", { name: "login.yaml", exact: true })).toHaveCount(0);
});

test("TC-WS-06 deletes a project with its modules, test files, and variables", async ({ page }) => {
  const { api } = await signUp(page);
  const { projectId, moduleId } = await createWorkspace(api);
  await setDemoVariables(api, projectId);
  await addTestFile(api, moduleId, "login.yaml", fixture("pass/sign-in.yaml"));
  await page.goto("/");

  await page.getByRole("button", { name: "Delete project Demo Shop", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Delete project", exact: true });
  await expect(
    dialog.getByText('Delete project "Demo Shop" and all its modules, test files and variables? Run history is kept.', {
      exact: true,
    }),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Delete", exact: true }).click();

  const overview = page.getByRole("region", { name: "Test files", exact: true });
  await expect(overview.getByText("No test files yet", { exact: true })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Projects" }).getByText("Demo Shop")).toHaveCount(0);
});
