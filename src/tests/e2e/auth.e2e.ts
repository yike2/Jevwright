import { expect, test, type Page } from "@playwright/test";
import { alertsOf, API_URL, PASSWORD, uniqueEmail } from "./support.js";

async function submit(page: Page, mode: "Log in" | "Register", email: string, password: string): Promise<void> {
  await page.goto("/login");
  // The mode buttons sit outside the form; the submit button inside it can share their label.
  await page.getByRole("button", { name: mode }).first().click();
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.locator("form").getByRole("button", { name: mode }).click();
}

test("TC-AUTH-01 registers, logs out, and logs back in", async ({ page }) => {
  const email = uniqueEmail();

  await submit(page, "Register", email, PASSWORD);
  await expect(page).toHaveURL("/");
  await expect(page.getByText(`Signed in as ${email}`)).toBeVisible();

  await page.getByRole("button", { name: "Log out" }).click();
  await expect(page).toHaveURL("/login");

  await submit(page, "Log in", email, PASSWORD);
  await expect(page).toHaveURL("/");
  await expect(page.getByText(`Signed in as ${email}`)).toBeVisible();
});

test("TC-AUTH-02 refuses an email that is taken, in any case", async ({ page }) => {
  const email = uniqueEmail();
  const registered = await page.request.post(`${API_URL}/auth/register`, { data: { email, password: PASSWORD } });
  expect(registered.status()).toBe(201);

  await submit(page, "Register", email.toUpperCase(), PASSWORD);

  await expect(alertsOf(page)).toHaveText("The email is taken");
  await expect(page).toHaveURL("/login");
});

test("TC-AUTH-03 shows an error for a wrong password", async ({ page }) => {
  const email = uniqueEmail();
  await page.request.post(`${API_URL}/auth/register`, { data: { email, password: PASSWORD } });

  await submit(page, "Log in", email, "wrong-password-1");

  await expect(alertsOf(page)).toHaveText("Wrong email or password");
  await expect(page).toHaveURL("/login");
  await expect(page.locator("form").getByRole("button", { name: "Log in" })).toBeEnabled();
});

test("TC-AUTH-04 needs a password of at least 8 characters", async ({ page }) => {
  await submit(page, "Register", uniqueEmail(), "1234567");
  // The 400 message, then one line per detail.
  await expect(alertsOf(page).locator("p")).not.toHaveCount(0);
  expect(await alertsOf(page).locator("p").count()).toBeGreaterThanOrEqual(2);
  await expect(page).toHaveURL("/login");

  await submit(page, "Register", uniqueEmail(), "12345678");
  await expect(page).toHaveURL("/");
});

test("TC-AUTH-05 sends a visitor without a token to the login page", async ({ page }) => {
  const id = "00000000-0000-4000-8000-000000000000";

  for (const path of ["/", `/files/${id}`, `/runs/${id}`]) {
    await page.goto(path);
    await expect(page).toHaveURL("/login");
    await expect(page.getByRole("navigation", { name: "Projects" })).toHaveCount(0);
  }
});
