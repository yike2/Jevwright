import { expect, test } from "@playwright/test";
import { addTestFile, createWorkspace, fixture, signUp, WORKSPACE } from "./support.js";

const COMMAND = "pnpm jevwright run tests/sign-in.yaml";
const QUESTIONS = [
  "How does Jev find an element?",
  "What does it fix?",
  "Which should I write?",
  "What runs where?",
  "Checked before it runs",
  "Light and dark",
  "Quick start",
  "What it is, and what it is not",
];

test("TC-LAND-01 shows the product page with its sections, the command, and one Sign in button", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { level: 1 })).toContainText("Web tests as plain YAML steps");
  for (const question of QUESTIONS)
    await expect(page.getByRole("heading", { level: 2, name: question, exact: true })).toBeVisible();
  await expect(page.getByRole("main").getByText(COMMAND, { exact: true }).first()).toBeVisible();
  const header = page.getByRole("banner");
  await expect(header.getByRole("link", { name: "Docs", exact: true })).toHaveAttribute(
    "href",
    "https://yike2.github.io/Jevwright/",
  );
  await expect(header.getByRole("link", { name: "Sign in", exact: true })).toBeVisible();
  await expect(header.getByRole("link", { name: "Register", exact: true })).toHaveCount(0);
  await expect(header.getByRole("link", { name: "Log in", exact: true })).toHaveCount(0);
  await expect(header.getByRole("link", { name: "Open workspace" })).toHaveCount(0);

  // The hero's Get started opens the same auth page in Register mode.
  await page.getByRole("main").getByRole("link", { name: "Get started" }).first().click();
  await expect(page).toHaveURL("/register");
  await expect(page.getByRole("heading", { level: 1, name: "Register" })).toBeVisible();
});

test("TC-LAND-02 opens the one auth page from Sign in, where Log in and Register switch", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("banner").getByRole("link", { name: "Sign in", exact: true }).click();

  await expect(page).toHaveURL("/login");
  await expect(page.getByRole("heading", { level: 1, name: "Log in" })).toBeVisible();
  await page.getByRole("button", { name: "Register" }).first().click();
  await expect(page.getByRole("heading", { level: 1, name: "Register" })).toBeVisible();
});

test("TC-LAND-03 takes a signed-in visitor from the product page to the workspace in one click", async ({ page }) => {
  await signUp(page);
  await page.goto("/");
  const header = page.getByRole("banner");
  await expect(header.getByRole("link", { name: "Sign in", exact: true })).toHaveCount(0);

  await header.getByRole("link", { name: "Open workspace" }).click();

  await expect(page).toHaveURL(WORKSPACE);
  await expect(page.getByRole("navigation", { name: "Projects" })).toBeVisible();
});

test("TC-LAND-04 the logo leads to the landing page everywhere, signed in or not", async ({ page }) => {
  const home = () => page.getByRole("link", { name: "Jevwright home", exact: true });
  await page.goto("/login");
  await expect(home()).toHaveAttribute("href", "/");

  const { api } = await signUp(page);
  const { folder } = await createWorkspace(api);
  const testFileId = await addTestFile(api, folder, "sign-in.yaml", fixture("pass/sign-in.yaml"));
  await page.goto("/");
  await expect(home()).toHaveAttribute("href", "/");

  await page.goto(`/files/${testFileId}`);
  await home().click();
  await expect(page).toHaveURL("/");
  await expect(page.getByRole("banner").getByRole("link", { name: "Open workspace" })).toBeVisible();
});

test("TC-LAND-05 replays a real Run step by step, with each step's screenshot", async ({ page }) => {
  await page.goto("/");
  const replay = page.getByRole("region", { name: "Run replay" });
  const steps = replay.getByRole("list", { name: "Replay steps" }).getByRole("listitem");

  await replay.getByRole("button", { name: "Show all steps", exact: true }).click();
  await expect(steps).toHaveCount(6);
  await expect(steps.nth(3)).toContainText("click");
  await expect(steps.nth(3)).toContainText("selector");
  await expect(replay.getByText("Passed", { exact: true }).first()).toBeVisible();

  await steps.nth(3).getByRole("button").click();
  await expect(replay.getByRole("img", { name: "Step 4 screenshot" })).toBeVisible();

  await replay.getByRole("tab", { name: "fall-back-from-a-stale-selector.yaml" }).click();
  await replay.getByRole("button", { name: "Show all steps", exact: true }).click();
  await expect(steps.nth(3)).toContainText(/visual|dom/);
});

test("TC-LAND-06 shows every step at once when the visitor prefers reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");

  const steps = page.getByRole("list", { name: "Replay steps" }).getByRole("listitem");
  await expect(steps).toHaveCount(6);
  for (let i = 0; i < 6; i += 1) await expect(steps.nth(i)).toContainText("Passed");
});

test("TC-LAND-07 shows how to start on the web and from the command line", async ({ page }) => {
  await page.goto("/");
  const start = page.getByRole("region", { name: "Quick start" });

  await expect(start.getByText("1 Passing tests", { exact: true })).toBeVisible();
  await start.getByRole("tab", { name: "CLI", exact: true }).click();
  await expect(start.getByText("pnpm jevwright validate tests/login.yaml", { exact: false })).toBeVisible();
});
