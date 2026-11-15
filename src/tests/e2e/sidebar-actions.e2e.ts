import { expect, test, type Page } from "@playwright/test";
import { addTestFile, createWorkspace, fixture, setDemoVariables, sidebarOf, signUp, WORKSPACE } from "./support.js";

async function openWorkspaceFile(page: Page): Promise<void> {
  const { api } = await signUp(page);
  const { moduleId } = await createWorkspace(api);
  const testFileId = await addTestFile(api, moduleId, "login.yaml", fixture("pass/sign-in.yaml"));
  await page.goto(`/files/${testFileId}`);
  await expect(page.getByRole("heading", { name: "login.yaml", exact: true })).toBeVisible();
}

async function rename(page: Page, button: string, name: string): Promise<void> {
  const sidebar = sidebarOf(page);
  await sidebar.getByRole("button", { name: button, exact: true }).click();
  const input = sidebar.getByRole("textbox", { name: "Name", exact: true });
  await input.fill(name);
  await input.press("Enter");
  await expect(input).toHaveCount(0);
}

async function selectionOf(page: Page): Promise<string> {
  return page.evaluate(() => {
    const input = document.activeElement as HTMLInputElement;
    return input.value.slice(input.selectionStart ?? 0, input.selectionEnd ?? 0);
  });
}

test("TC-WS-04 renames a project, a module, and the open test file in place", async ({ page }) => {
  await openWorkspaceFile(page);
  const sidebar = sidebarOf(page);
  const input = sidebar.getByRole("textbox", { name: "Name", exact: true });

  // The name turns into an input in the same spot, the name selected without .yaml, which stays shown after it.
  await sidebar.getByRole("button", { name: "Rename test file login.yaml", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(input).toBeFocused();
  await expect(input).toHaveValue("login");
  expect(await selectionOf(page)).toBe("login");
  await expect(input.locator("xpath=following-sibling::*[1]")).toHaveText(".yaml");
  await input.fill("sign-in");
  await input.press("Enter");
  await expect(sidebar.getByRole("link", { name: "sign-in.yaml", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "sign-in.yaml", exact: true })).toBeVisible();

  await rename(page, "Rename module Shopping", "Checkout");
  await expect(sidebar.getByText("Checkout", { exact: true })).toBeVisible();

  // Clicking away saves too.
  await sidebar.getByRole("button", { name: "Rename project Demo Shop", exact: true }).click();
  await input.fill("Swag Labs");
  await page.getByRole("heading", { name: "sign-in.yaml", exact: true }).click();
  await expect(sidebar.getByText("Swag Labs", { exact: true })).toBeVisible();
});

test("TC-WS-11 renames with F2, cancels with Escape, and keeps a taken name's input open", async ({ page }) => {
  const { api } = await signUp(page);
  const { moduleId } = await createWorkspace(api);
  await addTestFile(api, moduleId, "login.yaml", fixture("pass/sign-in.yaml"));
  await addTestFile(api, moduleId, "checkout.yaml", fixture("pass/checkout.yaml"));
  await page.goto(WORKSPACE);
  const sidebar = sidebarOf(page);
  const input = sidebar.getByRole("textbox", { name: "Name", exact: true });
  const login = sidebar.getByRole("link", { name: "login.yaml", exact: true });

  await login.focus();
  await page.keyboard.press("F2");
  await expect(input).toHaveValue("login");
  await input.fill("changed");
  await input.press("Escape");
  await expect(input).toHaveCount(0);
  await expect(login).toBeVisible();

  await login.focus();
  await page.keyboard.press("F2");
  await input.fill("checkout");
  await input.press("Enter");
  await expect(input).toBeVisible();
  await expect(sidebar.getByRole("alert")).toBeVisible();
  await expect(input).toHaveAttribute("aria-describedby", /.+/);
  await input.press("Escape");
  await expect(login).toBeVisible();

  // A problem shows under the input as the user types.
  await sidebar.getByRole("button", { name: "Rename project Demo Shop", exact: true }).focus();
  await page.keyboard.press("Enter");
  await input.fill("");
  await expect(sidebar.getByRole("alert")).toHaveText("Enter a name.");
  await expect(input).toHaveAttribute("aria-invalid", "true");
});

test("TC-WS-05 deletes the open test file and returns to the overview", async ({ page }) => {
  await openWorkspaceFile(page);

  await page.getByRole("button", { name: "Delete test file login.yaml", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Delete test file", exact: true });
  await expect(dialog.getByText('Delete test file "login.yaml"? Run history is kept.', { exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "Delete", exact: true }).click();

  await expect(page).toHaveURL(WORKSPACE);
  await expect(page.getByRole("link", { name: "login.yaml", exact: true })).toHaveCount(0);
});

test("TC-WS-06 deletes a project with its modules, test files, and variables", async ({ page }) => {
  const { api } = await signUp(page);
  const { projectId, moduleId } = await createWorkspace(api);
  await setDemoVariables(api, projectId);
  await addTestFile(api, moduleId, "login.yaml", fixture("pass/sign-in.yaml"));
  await page.goto(WORKSPACE);

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
