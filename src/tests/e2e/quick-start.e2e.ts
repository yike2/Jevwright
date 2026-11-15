import { expect, test, type Page } from "@playwright/test";
import { alertsOf, PASSWORD, QUICK_START, signUp, uniqueEmail, waitForFinalStatus, WORKSPACE } from "./support.js";

const ADD = "Add the Quick Start project";

function overviewOf(page: Page) {
  return page.getByRole("region", { name: "Test files", exact: true });
}

test("TC-QS-01 a new account starts with the Quick Start project and runs its passing file", async ({ page }) => {
  await page.goto("/register");
  await page.getByLabel("Email").fill(uniqueEmail());
  await page.getByLabel("Password").fill(PASSWORD);
  await page.locator("form").getByRole("button", { name: "Register" }).click();
  await expect(page).toHaveURL(WORKSPACE);

  const overview = overviewOf(page);
  await expect(overview.getByRole("heading", { level: 2, name: QUICK_START, exact: true })).toBeVisible();
  for (const module of ["Passing", "Failing", "Invalid"])
    await expect(overview.getByRole("heading", { level: 3, name: module, exact: true })).toBeVisible();
  await expect(overview.getByRole("link", { name: "multiple-errors.yaml", exact: true })).toBeVisible();

  await page.getByRole("button", { name: `Variables for ${QUICK_START}`, exact: true }).click();
  const variables = page.getByRole("dialog", { name: "Variables" });
  await expect(variables.getByRole("listitem")).toHaveText([/^BASE/, /^SWAG_PASSWORD/]);
  await variables.getByRole("button", { name: "Close", exact: true }).click();

  await overview.getByRole("link", { name: "sign-in.yaml", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Test file YAML" })).toHaveValue(/baseUrl: "\{\{BASE\}\}"/);
  await page.getByRole("button", { name: "Run", exact: true }).click();
  await page.getByRole("link", { name: "View run" }).click();
  expect(await waitForFinalStatus(page)).toBe("Passed");
});

test("TC-QS-02 an empty workspace offers to add the Quick Start project", async ({ page }) => {
  await signUp(page);
  await page.goto(WORKSPACE);
  const overview = overviewOf(page);
  await expect(overview.getByText("No test files yet", { exact: true })).toBeVisible();

  await overview.getByRole("button", { name: ADD, exact: true }).click();

  await expect(overview.getByRole("heading", { level: 2, name: QUICK_START, exact: true })).toBeVisible();
  await expect(overview.getByRole("link", { name: "sign-in.yaml", exact: true })).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "Projects" }).getByText(QUICK_START, { exact: true }),
  ).toBeVisible();
  await expect(overview.getByRole("button", { name: ADD })).toHaveCount(0);
});

test("TC-QS-03 explains why the Quick Start project cannot be added twice", async ({ page }) => {
  const { api } = await signUp(page);
  await api("POST", "/projects", { name: QUICK_START });
  await page.goto(WORKSPACE);

  await overviewOf(page).getByRole("button", { name: ADD, exact: true }).click();

  await expect(alertsOf(page)).toHaveText(
    "You already have a project named Quick Start. Rename or delete it, then add it again.",
  );
});
