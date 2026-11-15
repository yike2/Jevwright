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
  await page.getByRole("link", { name: "Variables for Demo Shop", exact: true }).click();
  await expect(page).toHaveURL(/\/projects\/[^/]+\/variables$/);
  const variables = page.getByRole("region", { name: "Variables", exact: true });
  await expect(variables.getByRole("heading", { name: "Variables", level: 1 })).toBeVisible();
  return variables;
}

async function saveVariable(page: Locator, name: string, value: string): Promise<void> {
  await page.getByLabel("Name", { exact: true }).fill(name);
  await page.getByLabel("Value", { exact: true }).fill(value);
  await page.getByRole("button", { name: "Save", exact: true }).click();
}

test("TC-VAR-01 adds, replaces, and deletes a variable, its value masked until shown", async ({ page }) => {
  const variables = await openVariables(page);
  await expect(variables.getByText("No variables yet", { exact: true })).toBeVisible();
  const items = variables.getByRole("listitem").filter({ hasText: "BASE" });
  const show = variables.getByRole("button", { name: "Show value of BASE", exact: true });

  await saveVariable(variables, "BASE", DEMO_URL);
  await expect(items).toHaveCount(1);
  await expect(items).toContainText("****");
  await expect(variables.getByLabel("Value", { exact: true })).toHaveValue("");
  await expect(page.locator("body")).not.toContainText(DEMO_URL);

  await show.click();
  await expect(show).toHaveAttribute("aria-pressed", "true");
  await expect(items).toContainText(DEMO_URL);
  await show.click();
  await expect(items).not.toContainText(DEMO_URL);
  await expect(items).toContainText("****");

  await saveVariable(variables, "BASE", "http://127.0.0.1:9999");
  await expect(items).toHaveCount(1);
  await expect(page.locator("body")).not.toContainText("127.0.0.1:9999");
  await show.click();
  await expect(items).toContainText("http://127.0.0.1:9999");

  await variables.getByRole("button", { name: "Delete BASE", exact: true }).click();
  await expect(items).toHaveCount(0);
});

test("TC-VAR-02 rejects names that are not upper snake case, before any request", async ({ page }) => {
  const variables = await openVariables(page);
  const puts: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "PUT") puts.push(request.url());
  });

  for (const name of ["base", "1BASE"]) {
    await saveVariable(variables, name, "value");
    await expect(variables.getByRole("alert")).toHaveText(
      "Variable names use capital letters, digits and _, and do not start with a digit, for example BASE_URL.",
    );
  }
  expect(puts).toEqual([]);

  await saveVariable(variables, "_BASE_1", "value");
  await expect(variables.getByRole("listitem").filter({ hasText: "_BASE_1" })).toHaveCount(1);
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
  const variables = await openVariables(page);
  const name = variables.getByLabel("Name", { exact: true });
  const value = variables.getByLabel("Value", { exact: true });
  const save = variables.getByRole("button", { name: "Save", exact: true });

  await name.fill("LONG");
  await expect(save).toBeDisabled();
  await name.fill("");
  await value.fill("x");
  await expect(save).toBeDisabled();

  await saveVariable(variables, "LONG", "x".repeat(10_000));
  await expect(variables.getByRole("listitem").filter({ hasText: "LONG" })).toHaveCount(1);

  await saveVariable(variables, "LONG", "x".repeat(10_001));
  await expect(variables.getByRole("alert")).toHaveText("A Variable value can be at most 10,000 characters.");
  await expect(variables.getByLabel("Value", { exact: true })).toHaveValue("x".repeat(10_001));
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
