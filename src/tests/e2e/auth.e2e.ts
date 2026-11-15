import { expect, test, type Page } from "@playwright/test";
import { alertsOf, API_URL, PASSWORD, signUp, uniqueEmail, WORKSPACE } from "./support.js";

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
  await expect(page).toHaveURL(WORKSPACE);
  await expect(page.getByText(`Signed in as ${email}`)).toBeVisible();

  await page.getByRole("button", { name: "Log out" }).click();
  await expect(page).toHaveURL("/login");

  await submit(page, "Log in", email, PASSWORD);
  await expect(page).toHaveURL(WORKSPACE);
  await expect(page.getByText(`Signed in as ${email}`)).toBeVisible();
});

test("TC-AUTH-02 refuses an email that is taken, in any case", async ({ page }) => {
  const email = uniqueEmail();
  const registered = await page.request.post(`${API_URL}/auth/register`, { data: { email, password: PASSWORD } });
  expect(registered.status()).toBe(201);

  await submit(page, "Register", email.toUpperCase(), PASSWORD);

  await expect(alertsOf(page)).toHaveText("An account with this email already exists. Log in instead.");
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
  const registers: string[] = [];
  page.on("request", (request) => {
    if (request.url().endsWith("/auth/register")) registers.push(request.url());
  });
  await submit(page, "Register", uniqueEmail(), "1234567");
  // The form checks the rule itself, with the backend's words, and sends nothing.
  await expect(alertsOf(page)).toHaveText("Password must be at least 8 characters.");
  await expect(page.getByLabel("Password")).toHaveAttribute("aria-invalid", "true");
  expect(registers).toEqual([]);
  await expect(page).toHaveURL("/login");

  await submit(page, "Register", uniqueEmail(), "12345678");
  await expect(page).toHaveURL(WORKSPACE);
});

test("TC-AUTH-05 sends a visitor without a token to the login page", async ({ page }) => {
  const id = "00000000-0000-4000-8000-000000000000";

  for (const path of [WORKSPACE, `/files/${id}`, `/runs/${id}`]) {
    await page.goto(path);
    await expect(page).toHaveURL("/login");
    await expect(page.getByRole("navigation", { name: "Projects" })).toHaveCount(0);
  }
});

test("TC-AUTH-07 compares emails in lower case", async ({ page }) => {
  const email = uniqueEmail();
  await page.request.post(`${API_URL}/auth/register`, { data: { email, password: PASSWORD } });

  await submit(page, "Log in", email.toUpperCase(), PASSWORD);

  await expect(page).toHaveURL(WORKSPACE);
  await expect(page.getByText(`Signed in as ${email}`)).toBeVisible();
});

test("TC-AUTH-08 sends another tab to the login page after logging out", async ({ page }) => {
  await submit(page, "Register", uniqueEmail(), PASSWORD);
  await expect(page).toHaveURL(WORKSPACE);
  const other = await page.context().newPage();
  await other.goto(WORKSPACE);
  await expect(other.getByRole("button", { name: "Log out" })).toBeVisible();

  await page.getByRole("button", { name: "Log out" }).click();
  await other.reload();

  await expect(other).toHaveURL("/login");
});

test("TC-AUTH-09 sends a signed-in user from the auth pages to the workspace", async ({ page }) => {
  await signUp(page);

  for (const path of ["/login", "/register"]) {
    await page.goto(path);
    await expect(page).toHaveURL(WORKSPACE);
    await expect(page.getByRole("navigation", { name: "Projects" })).toBeVisible();
  }
});

test("TC-AUTH-10 shows the form and clears a token the backend rejects", async ({ page }) => {
  await page.goto("/login");
  await page.evaluate(() => window.localStorage.setItem("auth-token", "invalid"));

  await page.reload();

  await expect(page.locator("form").getByRole("button", { name: "Log in" })).toBeVisible();
  await expect(page).toHaveURL("/login");
  expect(await page.evaluate(() => window.localStorage.getItem("auth-token"))).toBeNull();
});
