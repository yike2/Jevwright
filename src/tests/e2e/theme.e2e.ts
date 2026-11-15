import { expect, test, type Page } from "@playwright/test";
import { signUp, WORKSPACE } from "./support.js";

const html = (page: Page) => page.locator("html");
const themeButton = (page: Page, name: "Light" | "Dark" | "System") =>
  page.getByRole("group", { name: "Theme" }).getByRole("button", { name, exact: true });

test("TC-THEME-01 follows the system setting by default", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/");
  await expect(html(page)).toHaveClass(/(^|\s)dark(\s|$)/);
  await expect(themeButton(page, "System")).toHaveAttribute("aria-pressed", "true");

  await page.emulateMedia({ colorScheme: "light" });
  await expect(html(page)).not.toHaveClass(/(^|\s)dark(\s|$)/);
});

test("TC-THEME-02 keeps the chosen theme after a reload, and System follows the setting again", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/");

  await themeButton(page, "Dark").click();
  await expect(html(page)).toHaveClass(/(^|\s)dark(\s|$)/);
  await page.reload();
  await expect(html(page)).toHaveClass(/(^|\s)dark(\s|$)/);
  await expect(themeButton(page, "Dark")).toHaveAttribute("aria-pressed", "true");

  await themeButton(page, "System").click();
  await expect(html(page)).not.toHaveClass(/(^|\s)dark(\s|$)/);
  await themeButton(page, "Light").click();
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(html(page)).not.toHaveClass(/(^|\s)dark(\s|$)/);
});

test("TC-THEME-03 sets the saved theme before the page's scripts run, so it never flashes", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/");
  await themeButton(page, "Dark").click();
  await expect(html(page)).toHaveClass(/(^|\s)dark(\s|$)/);

  // Without the app's JavaScript only the server's HTML and its inline theme script run.
  await page.route("**/_next/static/**/*.js", (route) => route.abort());
  await page.reload();

  await expect(html(page)).toHaveClass(/(^|\s)dark(\s|$)/);
});

test("TC-THEME-04 offers the theme switch in the workspace and on the login page", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("group", { name: "Theme" })).toBeVisible();

  await signUp(page);
  await page.goto(WORKSPACE);
  await expect(page.getByRole("navigation", { name: "Projects" }).getByRole("group", { name: "Theme" })).toBeVisible();
});
