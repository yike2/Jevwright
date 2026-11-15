import { expect, test } from "@playwright/test";
import { addTestFile, createWorkspace, fixture, signUp, WORKSPACE } from "./support.js";

const GUIDE = "https://yike2.github.io/Jevwright/guide/";
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

test("TC-LAND-01 shows the product page with its sections, the guide link, and one Sign in button", async ({
  page,
}) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { level: 1 })).toContainText("Web tests as plain YAML steps");
  for (const question of QUESTIONS)
    await expect(page.getByRole("heading", { level: 2, name: question, exact: true })).toBeVisible();
  // Web only: no command line anywhere on the page.
  await expect(page.getByRole("main").getByText(/pnpm|jevwright (run|validate)|\bCLI\b/)).toHaveCount(0);
  const header = page.getByRole("banner");
  await expect(header.getByRole("link", { name: "Docs", exact: true })).toHaveAttribute("href", GUIDE);
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

test("TC-LAND-05 replays the Run with every Jev use first, badging only the steps Jev worked on", async ({ page }) => {
  await page.goto("/");
  const replay = page.getByRole("region", { name: "Run replay" });
  const steps = replay.getByRole("list", { name: "Replay steps" }).getByRole("listitem");
  const badged = async (expected: Record<number, string>, count: number) => {
    for (let index = 0; index < count; index += 1) {
      const badge = expected[index];
      if (badge) await expect(steps.nth(index)).toContainText(badge);
      else await expect(steps.nth(index)).not.toContainText(/AI locate|AI assert/);
    }
  };

  await expect(replay.getByRole("tab")).toHaveText([
    "find-and-check-with-jev.yaml",
    "fall-back-from-a-stale-selector.yaml",
    "sign-in-and-see-products.yaml",
  ]);
  await expect(replay.getByRole("tab", { name: "find-and-check-with-jev.yaml" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await replay.getByRole("button", { name: "Show all steps", exact: true }).click();
  await expect(steps).toHaveCount(8);
  await expect(steps.nth(1)).toContainText("click");
  await expect(steps.nth(2)).toContainText("click");
  await expect(steps.nth(7)).toContainText("assert");
  await badged({ 1: "AI locate", 2: "AI locate", 7: "AI assert" }, 8);
  await expect(replay.getByText(/^(selector|visual|dom)$/)).toHaveCount(0);
  await expect(replay.getByText("Passed", { exact: true }).first()).toBeVisible();

  await steps.nth(2).getByRole("button").click();
  await expect(replay.getByRole("img", { name: "Step 3 screenshot" })).toBeVisible();

  await replay.getByRole("tab", { name: "fall-back-from-a-stale-selector.yaml" }).click();
  await replay.getByRole("button", { name: "Show all steps", exact: true }).click();
  await expect(steps).toHaveCount(6);
  await expect(steps.nth(3)).toContainText("click");
  await badged({ 3: "AI locate" }, 6);

  await replay.getByRole("tab", { name: "sign-in-and-see-products.yaml" }).click();
  await replay.getByRole("button", { name: "Show all steps", exact: true }).click();
  await expect(steps.nth(3)).toContainText("click");
  await expect(replay.getByText(/AI locate|AI assert/)).toHaveCount(0);
});

test("TC-LAND-06 shows every step at once when the visitor prefers reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");

  const steps = page.getByRole("list", { name: "Replay steps" }).getByRole("listitem");
  await expect(steps).toHaveCount(8);
  for (let i = 0; i < 8; i += 1) await expect(steps.nth(i)).toContainText("Passed");
});

test("TC-LAND-07 shows how to start on the web with the Demo App, and opens the workspace", async ({ page }) => {
  await page.goto("/");
  const start = page.getByRole("region", { name: "Quick start" });

  await expect(start.getByText("1 Passing tests", { exact: true })).toBeVisible();
  await expect(start.getByText("https://demo.94.72.126.118.sslip.io").first()).toBeVisible();
  await expect(start.getByText("judge-a-true-statement.yaml")).toBeVisible();
  await expect(start.getByRole("tab")).toHaveCount(0);
  await expect(start.getByRole("link", { name: "Register" })).toHaveAttribute("href", "/register");

  await signUp(page);
  await page.goto("/");
  await start.getByRole("link", { name: "Open workspace" }).click();
  await expect(page).toHaveURL(WORKSPACE);
});

test("TC-LAND-09 shows code for each choice and each fix, and lines up the checked steps", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/");

  const choices = page.getByRole("region", { name: "Which should I write?" });
  await expect(choices.getByRole("listitem")).toHaveCount(5);
  for (const item of await choices.getByRole("listitem").all())
    await expect(item.locator("pre")).toContainText(/selector|target|statement/);

  const fixes = page.getByRole("region", { name: "What does it fix?" });
  await expect(fixes.getByText("Playwright", { exact: true }).first()).toBeVisible();
  await expect(fixes.getByText("Jevwright", { exact: true }).first()).toBeVisible();
  await expect(fixes.locator("pre")).toHaveCount((await fixes.getByRole("heading", { level: 3 }).count()) * 2);

  // The three steps' code blocks start on the same row, whatever the length of the text above them.
  const checked = page.getByRole("region", { name: "Checked before it runs" });
  const tops = await checked.locator("pre").evaluateAll((pres) => pres.map((pre) => pre.getBoundingClientRect().top));
  expect(tops).toHaveLength(3);
  expect(Math.max(...tops) - Math.min(...tops)).toBeLessThan(1);
  await expect(checked.getByText("Debug console", { exact: false }).first()).toBeVisible();
});
