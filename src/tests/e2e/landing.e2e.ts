import { expect, test } from "@playwright/test";
import { signUp, WORKSPACE } from "./support.js";

const FEATURES = ["Plain YAML steps", "Jev locating", "Live runs", "History and reports", "CLI and API"];

test("TC-LAND-01 shows the product page with its features, a sample test file, Log in and Register", async ({
  page,
}) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { level: 1, name: "Web tests in plain YAML" })).toBeVisible();
  for (const feature of FEATURES)
    await expect(page.getByRole("heading", { level: 3, name: feature, exact: true })).toBeVisible();
  await expect(page.getByRole("figure", { name: "sign-in.yaml" })).toContainText("steps:");
  const header = page.getByRole("banner");
  await expect(header.getByRole("link", { name: "Log in", exact: true })).toBeVisible();
  await expect(header.getByRole("link", { name: "Open workspace" })).toHaveCount(0);

  await header.getByRole("link", { name: "Register", exact: true }).click();
  await expect(page).toHaveURL("/register");
  await expect(page.getByRole("heading", { level: 1, name: "Register" })).toBeVisible();
});

test("TC-LAND-02 opens the login page from the product page", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("banner").getByRole("link", { name: "Log in", exact: true }).click();

  await expect(page).toHaveURL("/login");
  await expect(page.getByRole("heading", { level: 1, name: "Log in" })).toBeVisible();
});

test("TC-LAND-03 takes a signed-in visitor from the product page to the workspace in one click", async ({ page }) => {
  await signUp(page);
  await page.goto("/");
  const header = page.getByRole("banner");
  await expect(header.getByRole("link", { name: "Log in", exact: true })).toHaveCount(0);

  await header.getByRole("link", { name: "Open workspace" }).click();

  await expect(page).toHaveURL(WORKSPACE);
  await expect(page.getByRole("navigation", { name: "Projects" })).toBeVisible();
});
