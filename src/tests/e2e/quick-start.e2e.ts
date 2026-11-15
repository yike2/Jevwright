import { expect, test, type Page } from "@playwright/test";
import {
  alertsOf,
  createWorkspace,
  editorOf,
  PASSWORD,
  QUICK_START,
  sidebarOf,
  signUp,
  sourceOf,
  uniqueEmail,
  WORKSPACE,
} from "./support.js";

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
  // The four numbered folders of backend.md 1.10, in learning order.
  await expect(overview.getByRole("heading", { level: 3 })).toHaveText([
    "1 Passing tests",
    "2 Failing tests - see why they fail",
    "3 Invalid files - fix the errors",
    "4 Jev - find and check by description",
  ]);
  await expect(overviewOf(page).getByRole("button", { name: ADD })).toHaveCount(0);
  await expect(sidebarOf(page).getByRole("button", { name: ADD })).toHaveCount(0);
  await expect(overview.getByRole("link", { name: "seven-errors-at-once.yaml", exact: true })).toBeVisible();
  // The Jev examples are listed but never run here: pnpm test:e2e makes no Jev calls (AGENTS.md 5).
  await expect(overview.getByRole("link", { name: "find-elements-by-description.yaml", exact: true })).toBeVisible();

  await page.getByRole("link", { name: `Variables for ${QUICK_START}`, exact: true }).click();
  const variables = page.getByRole("list", { name: "Variables" });
  await expect(variables.getByRole("listitem")).toHaveText([/^BASE/, /^SWAG_PASSWORD/]);

  await page.goto(WORKSPACE);
  await overview.getByRole("link", { name: "sign-in-and-see-products.yaml", exact: true }).click();
  await expect.poll(() => sourceOf(page)).toMatch(/^# .+\n# Expect: .+\n# Try: .+\n/);
  expect(await sourceOf(page)).toMatch(/baseUrl: "\{\{BASE\}\}"/);
  await editorOf(page).run.click();
  await expect(editorOf(page).state).toHaveText("Passed", { timeout: 60_000 });
});

test("TC-QS-02 an empty workspace offers to add the Quick Start project", async ({ page }) => {
  await signUp(page);
  await page.goto(WORKSPACE);
  const overview = overviewOf(page);
  await expect(overview.getByText("No test files yet", { exact: true })).toBeVisible();

  await overview.getByRole("button", { name: ADD, exact: true }).click();

  await expect(overview.getByRole("heading", { level: 2, name: QUICK_START, exact: true })).toBeVisible();
  await expect(overview.getByRole("link", { name: "sign-in-and-see-products.yaml", exact: true })).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "Projects" }).getByText(QUICK_START, { exact: true }),
  ).toBeVisible();
  await expect(overview.getByRole("button", { name: ADD })).toHaveCount(0);
});

test("TC-QS-03 explains why the Quick Start project cannot be added twice", async ({ page }) => {
  const { api } = await signUp(page);
  await page.goto(WORKSPACE);
  const add = overviewOf(page).getByRole("button", { name: ADD, exact: true });
  await expect(add).toBeVisible();
  // Another tab adds a project named Quick Start after this page loaded its tree.
  await api("POST", "/projects", { name: QUICK_START });

  await add.click();

  await expect(alertsOf(page)).toHaveText(
    "You already have a project named Quick Start. Rename or delete it, then add it again.",
  );
});

test("TC-QS-05 offers the Quick Start project whenever no project is named Quick Start", async ({ page }) => {
  const { api } = await signUp(page);
  await createWorkspace(api);
  await page.goto(WORKSPACE);
  const sidebar = sidebarOf(page);
  await expect(overviewOf(page).getByRole("button", { name: ADD, exact: true })).toBeVisible();

  await sidebar.getByRole("button", { name: ADD, exact: true }).click();

  await expect(sidebar.getByText(QUICK_START, { exact: true })).toBeVisible();
  await expect(sidebar.getByText("Demo Shop", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: ADD })).toHaveCount(0);

  // Renamed, the project no longer counts as the Quick Start project, so the button is back.
  const tree = await api<{ items: { id: string; name: string }[] }>("GET", "/tree");
  const quickStart = tree.items.find((project) => project.name === QUICK_START)!;
  await api("PATCH", `/projects/${quickStart.id}`, { name: "My examples" });
  await page.reload();
  await expect(sidebar.getByRole("button", { name: ADD, exact: true })).toBeVisible();
});

test("TC-QS-06 a Quick Start file starts signed in with the session cookie and passes", async ({ page }) => {
  await signUp(page, { quickStart: true });
  await page.goto(WORKSPACE);
  await overviewOf(page).getByRole("link", { name: "buy-a-backpack.yaml", exact: true }).click();
  await expect.poll(() => sourceOf(page)).toContain('cookies:\n  session-username: "standard_user"\n');

  await editorOf(page).run.click();

  await expect(editorOf(page).state).toHaveText("Passed", { timeout: 60_000 });
  await expect(editorOf(page).output.getByText("12/12 passed", { exact: true })).toBeVisible();
});
