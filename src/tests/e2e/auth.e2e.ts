import { expect, test } from "@playwright/test";

test("registers, logs out, and logs back in", async ({ page }) => {
  const email = `e2e-${Date.now()}@example.com`;
  const password = "e2e-password-123";
  const form = page.locator("form");

  await page.goto("/login");
  // In Log in mode the only "Register" button is the mode switch.
  await page.getByRole("button", { name: "Register" }).click();
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await form.getByRole("button", { name: "Register" }).click();

  await expect(page).toHaveURL("/");
  await expect(page.getByText(`Signed in as ${email}`)).toBeVisible();

  await page.getByRole("button", { name: "Log out" }).click();
  await expect(page).toHaveURL("/login");

  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await form.getByRole("button", { name: "Log in" }).click();

  await expect(page).toHaveURL("/");
  await expect(page.getByText(`Signed in as ${email}`)).toBeVisible();
});
