import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  addTestFile,
  createWorkspace,
  DEMO_URL,
  fixture,
  runFromEditor,
  setUpDemoProject,
  signUp,
  WORKSPACE,
} from "./support.js";

async function openVariables(page: Page): Promise<Locator> {
  const { api } = await signUp(page);
  await createWorkspace(api);
  await page.goto(WORKSPACE);
  await page.getByRole("button", { name: "Variables for Demo Shop", exact: true }).click();
  return page.getByRole("dialog", { name: "Variables", exact: true });
}

async function saveVariable(dialog: Locator, name: string, value: string): Promise<void> {
  await dialog.getByLabel("Name").fill(name);
  await dialog.getByLabel("Value").fill(value);
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
}

test("TC-VAR-01 adds, replaces, and deletes a variable without showing its value", async ({ page }) => {
  const dialog = await openVariables(page);
  await expect(dialog.getByText("No variables yet", { exact: true })).toBeVisible();
  const items = dialog.getByRole("listitem").filter({ hasText: "BASE" });

  await saveVariable(dialog, "BASE", DEMO_URL);
  await expect(items).toHaveCount(1);
  await expect(dialog.getByLabel("Value")).toHaveValue("");
  await expect(page.locator("body")).not.toContainText(DEMO_URL);

  await saveVariable(dialog, "BASE", "http://127.0.0.1:9999");
  await expect(items).toHaveCount(1);
  await expect(page.locator("body")).not.toContainText("127.0.0.1:9999");

  await dialog.getByRole("button", { name: "Delete BASE", exact: true }).click();
  await expect(items).toHaveCount(0);
});

test("TC-VAR-02 rejects names that are not upper snake case, before any request", async ({ page }) => {
  const dialog = await openVariables(page);
  const puts: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "PUT") puts.push(request.url());
  });

  for (const name of ["base", "1BASE"]) {
    await saveVariable(dialog, name, "value");
    await expect(dialog.getByRole("alert")).toHaveText(
      "Variable names use capital letters, digits and _, and do not start with a digit, for example BASE_URL.",
    );
  }
  expect(puts).toEqual([]);

  await saveVariable(dialog, "_BASE_1", "value");
  await expect(dialog.getByRole("listitem").filter({ hasText: "_BASE_1" })).toHaveCount(1);
  expect(puts).toHaveLength(1);
});

test("TC-VAR-03 fails the step whose variable is not set", async ({ page }) => {
  const { api, moduleId } = await setUpDemoProject(page);
  const testFileId = await addTestFile(api, moduleId, "missing-variable.yaml", fixture("fail/missing-variable.yaml"));

  expect(await runFromEditor(page, testFileId)).toBe("Failed");

  const steps = page.getByRole("list", { name: "Steps" }).getByRole("listitem");
  await expect(steps.nth(0)).toContainText("Passed");
  await expect(steps.nth(1)).toContainText("Failed");
  await expect(steps.nth(1)).toContainText("Variable {{NOT_SET}} is not set");
  await expect(steps.nth(2)).toContainText("Pending");
  await expect(page.getByText("1/3 passed", { exact: true })).toBeVisible();
});

test("TC-VAR-04 uses only the variables of the file's own project", async ({ page }) => {
  const { api } = await setUpDemoProject(page);
  const other = await api<{ id: string }>("POST", "/projects", { name: "Other" });
  const module = await api<{ id: string }>("POST", `/projects/${other.id}/modules`, { name: "Shopping" });
  const testFileId = await addTestFile(api, module.id, "sign-in.yaml", fixture("pass/sign-in.yaml"));

  expect(await runFromEditor(page, testFileId)).toBe("Failed");

  const firstStep = page.getByRole("list", { name: "Steps" }).getByRole("listitem").first();
  await expect(firstStep).toContainText("Variable {{BASE}} is not set");
});

test("TC-VAR-05 needs a name and a value of at most 10,000 characters", async ({ page }) => {
  const dialog = await openVariables(page);
  const name = dialog.getByLabel("Name");
  const value = dialog.getByLabel("Value");
  const save = dialog.getByRole("button", { name: "Save", exact: true });

  await name.fill("LONG");
  await expect(save).toBeDisabled();
  await name.fill("");
  await value.fill("x");
  await expect(save).toBeDisabled();

  await saveVariable(dialog, "LONG", "x".repeat(10_000));
  await expect(dialog.getByRole("listitem").filter({ hasText: "LONG" })).toHaveCount(1);

  await saveVariable(dialog, "LONG", "x".repeat(10_001));
  await expect(dialog.getByRole("alert")).toHaveText("A Variable value can be at most 10,000 characters.");
  await expect(dialog).toBeVisible();
});

test("TC-VAR-06 passes a value with special characters to the page unchanged", async ({ page }) => {
  const { api, projectId, moduleId } = await setUpDemoProject(page);
  const value = 'Zoë "the <b>Swag</b>" Fan & 商店';
  await api("PUT", `/projects/${projectId}/variables/DISPLAY_NAME`, { value });
  const testFileId = await addTestFile(api, moduleId, "variable-value.yaml", fixture("pass/variable-value.yaml"));

  expect(await runFromEditor(page, testFileId)).toBe("Passed");

  await expect(page.getByText("3/3 passed", { exact: true })).toBeVisible();
  await expect(page.locator("body")).not.toContainText("Zoë");
});
