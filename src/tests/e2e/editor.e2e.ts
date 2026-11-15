import { fileURLToPath } from "node:url";
import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  addTestFile,
  alertsOf,
  createInSidebar,
  createWorkspace,
  editorOf,
  fixture,
  problemItemsOf,
  sidebarOf,
  signUp,
  sourceOf,
  WORKSPACE,
  type Editor,
} from "./support.js";

const MAX_SOURCE_CHARS = 262_144;
const STARTER = 'name: "editor"\nsteps:\n  - open:\n      url: "https://example.com"\n';

async function openNewFile(page: Page, source = fixture("pass/sign-in.yaml")): Promise<Editor> {
  const { api } = await signUp(page);
  const { moduleId } = await createWorkspace(api);
  const testFileId = await addTestFile(api, moduleId, "editor.yaml", source);
  await page.goto(`/files/${testFileId}`);
  const editor = editorOf(page);
  await expect.poll(() => sourceOf(page)).toBe(source);
  return editor;
}

async function box(locator: Locator) {
  const rect = await locator.boundingBox();
  expect(rect).not.toBeNull();
  return rect!;
}

test("TC-ED-01 shows the starter source and tracks unsaved changes", async ({ page }) => {
  const { api } = await signUp(page);
  await createWorkspace(api);
  await page.goto(WORKSPACE);
  await createInSidebar(page, "New test file in Shopping", "editor");
  const { source, state, save } = editorOf(page);

  await expect.poll(() => sourceOf(page)).toBe(STARTER);
  await expect(state).toHaveText("Saved");
  await expect(save).toBeDisabled();
  // The toolbar has no Validate and no Upload button: the file is checked as the user types, and upload is in the
  // sidebar.
  const main = page.getByRole("main");
  await expect(main.getByRole("button", { name: /validate/i })).toHaveCount(0);
  await expect(main.getByRole("button", { name: /upload/i })).toHaveCount(0);

  await source.fill(`${STARTER}#`);
  await expect(state).toHaveText("Unsaved");
  await expect(save).toBeEnabled();

  await source.fill(STARTER);
  await expect(state).toHaveText("Saved");
  await expect(save).toBeDisabled();
});

test("TC-ED-02 saves a source, keeps showing it, and shows it after a reload", async ({ page }) => {
  const { source, state, save, problems } = await openNewFile(page, fixture("pass/locked-out.yaml"));
  const signIn = fixture("pass/sign-in.yaml");

  await source.fill(signIn);
  await save.click();

  await expect(state).toHaveText("Saved");
  // The saved source stays in the editor without a reload.
  expect(await sourceOf(page)).toBe(signIn);
  await expect(problems.getByText("No problems").first()).toBeVisible();
  await expect(problems).not.toContainText("Valid. Ready to run.");
  await page.reload();
  await expect.poll(() => sourceOf(page)).toBe(signIn);
});

test("TC-ED-03 uploads a file into a new test file from the module's actions", async ({ page }) => {
  const { api } = await signUp(page);
  await createWorkspace(api);
  await page.goto(WORKSPACE);
  const sidebar = sidebarOf(page);
  const checkout = fileURLToPath(new URL("./fixtures/pass/checkout.yaml", import.meta.url));

  const chooser = page.waitForEvent("filechooser");
  await sidebar.getByRole("button", { name: "Upload file to Shopping", exact: true }).click();
  await (await chooser).setFiles(checkout);

  await expect(page).toHaveURL(/\/files\/[^/]+$/);
  await expect(sidebar.getByRole("link", { name: "checkout.yaml", exact: true })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect.poll(() => sourceOf(page)).toBe(fixture("pass/checkout.yaml"));
  await expect(editorOf(page).state).toHaveText("Saved");
  await expect(page.locator('input[type="file"]')).toHaveAttribute("accept", ".yaml,.yml");

  // A second upload of the same name is refused next to the module, and adds nothing.
  const again = page.waitForEvent("filechooser");
  await sidebar.getByRole("button", { name: "Upload file to Shopping", exact: true }).click();
  await (await again).setFiles(checkout);
  await expect(sidebar.getByRole("alert")).toContainText("checkout.yaml");
  await expect(sidebar.getByRole("link", { name: "checkout.yaml", exact: true })).toHaveCount(1);
});

test("TC-ED-04 lists every error of an invalid file with its line as the user types", async ({ page }) => {
  const { source, problems, save } = await openNewFile(page);
  const expected = [
    'Line 3: "timeoutMs" must be a positive integer up to 2147483647',
    'Line 6: "url" is relative, so the test needs a "baseUrl"',
    'Line 7: Unknown action "aiAct"',
    'Line 8: Step must contain exactly one action, found "click" and "input"',
    'Line 13: Missing required field "value"',
    'Line 15: Needs at least one of "selector" and "target"',
    'Line 18: Unknown field "colour"',
  ];

  await source.fill(fixture("invalid/multiple-errors.yaml"));
  await expect(problems.getByText("7 problems", { exact: true })).toBeVisible();
  await expect(problemItemsOf(page)).toHaveText(expected);
  // Each diagnostic is marked on its own line of the editor.
  await expect(page.locator(".cm-lint-marker-error")).toHaveCount(7);

  await save.click();
  await expect(editorOf(page).state).toHaveText("Saved");
  await expect(problemItemsOf(page)).toHaveText(expected);
});

test("TC-ED-05 reports a YAML syntax error", async ({ page }) => {
  const { source, problems } = await openNewFile(page);

  await source.fill(fixture("invalid/yaml-syntax.yaml"));

  await expect(problems.getByText("1 problem", { exact: true })).toBeVisible();
  await expect(problemItemsOf(page)).toHaveText(["Line 7: Nested mappings are not allowed in compact mappings"]);
});

test("TC-ED-06 shows a fixed file as having no problems", async ({ page }) => {
  const { source, problems } = await openNewFile(page);
  await source.fill(fixture("invalid/multiple-errors.yaml"));
  await expect(problemItemsOf(page)).toHaveCount(7);

  await source.fill(fixture("pass/sign-in.yaml"));

  await expect(problemItemsOf(page)).toHaveCount(0);
  await expect(problems.getByText("No problems").first()).toBeVisible();
  await expect(page.locator(".cm-lint-marker-error")).toHaveCount(0);
});

test("TC-ED-07 saves a source of up to 262,144 characters", async ({ page }) => {
  const { source, save, state } = await openNewFile(page);
  const base = `${fixture("pass/sign-in.yaml")}# `;
  const largest = base + "x".repeat(MAX_SOURCE_CHARS - base.length);
  expect(largest).toHaveLength(MAX_SOURCE_CHARS);

  await source.fill(largest);
  await save.click();
  await expect(state).toHaveText("Saved");

  await source.fill(`${largest}x`);
  await save.click();
  await expect(alertsOf(page)).toHaveText("The test file is too long: it can be at most 262,144 characters.");
  await expect(state).toHaveText("Unsaved");
});

test("TC-ED-08 reports a file with no content", async ({ page }) => {
  const { source } = await openNewFile(page);

  for (const text of ["", fixture("invalid/empty.yaml")]) {
    await source.fill(text);
    await expect(problemItemsOf(page)).toHaveText(["Line 1: The root must be an object"]);
    await source.fill(fixture("pass/sign-in.yaml"));
    await expect(problemItemsOf(page)).toHaveCount(0);
  }
});

test("TC-ED-09 accepts integers up to 2147483647 in plain digits only", async ({ page }) => {
  const { source } = await openNewFile(page);

  await source.fill(fixture("invalid/timeout-bounds.yaml"));

  await expect(problemItemsOf(page)).toHaveText([
    'Line 5: "ms" must be a positive integer up to 2147483647',
    'Line 7: "ms" must be a positive integer up to 2147483647',
  ]);
});

test("TC-ED-10 saves with Ctrl+S and runs with Ctrl+Enter", async ({ page }) => {
  const { source, state, runConsole } = await openNewFile(page);

  await source.fill(`${fixture("pass/sign-in.yaml")}# saved by keyboard\n`);
  await expect(state).toHaveText("Unsaved");
  await source.press("Control+s");
  await expect(state).not.toHaveText("Unsaved");

  await source.press("Control+Enter");
  await expect(runConsole.getByRole("region", { name: "Runs" }).getByRole("listitem")).toHaveCount(1);
  // Ctrl+Enter runs; it does not insert a line into the source.
  expect(await sourceOf(page)).toBe(`${fixture("pass/sign-in.yaml")}# saved by keyboard\n`);
});

test("TC-ED-11 moves the cursor to a problem's line when it is clicked", async ({ page }) => {
  const { source, statusBar } = await openNewFile(page);
  await source.fill(fixture("invalid/multiple-errors.yaml"));

  await problemItemsOf(page).filter({ hasText: "Line 7:" }).click();

  await expect(source).toBeFocused();
  await expect(statusBar).toContainText("Ln 7, Col 3");
});

test("TC-ED-12 fills the window: sidebar, editor and consoles edge to edge, about 60 / 40", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  const { problems, runConsole } = await openNewFile(page);
  const sidebar = await box(sidebarOf(page));
  const editor = await box(page.locator(".cm-editor"));
  const problemsBox = await box(problems);
  const runBox = await box(runConsole);

  // Only the 1px resize handles separate the regions; no centered column or outer padding.
  expect(Math.abs(editor.x - (sidebar.x + sidebar.width))).toBeLessThanOrEqual(3);
  expect(Math.abs(problemsBox.x - (editor.x + editor.width))).toBeLessThanOrEqual(3);
  expect(Math.abs(problemsBox.x + problemsBox.width - 1366)).toBeLessThanOrEqual(1);
  expect(Math.abs(editor.width - (1366 - sidebar.width - problemsBox.width))).toBeLessThanOrEqual(3);
  expect(editor.width / (editor.width + problemsBox.width)).toBeCloseTo(0.6, 1);
  // Problems on top, Run below, split evenly.
  expect(runBox.y).toBeGreaterThan(problemsBox.y);
  expect(Math.abs(runBox.height - problemsBox.height)).toBeLessThanOrEqual(3);
  // The page itself never scrolls.
  expect(await page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight)).toBe(true);
});

test("TC-ED-13 collapses the consoles, keeps that per browser, and reopens Problems for new problems only", async ({
  page,
}) => {
  const { source, problems } = await openNewFile(page);
  const problemsToggle = problems.getByRole("button", { name: "Problems console", exact: true });

  await problemsToggle.click();
  await expect(problemsToggle).toHaveAttribute("aria-expanded", "false");
  await page.reload();
  await expect(problemsToggle).toHaveAttribute("aria-expanded", "false");

  // Valid edits leave it collapsed.
  await source.fill(`${fixture("pass/sign-in.yaml")}# still valid\n`);
  await page.waitForTimeout(1_000);
  await expect(problemsToggle).toHaveAttribute("aria-expanded", "false");

  // A new diagnostic opens it.
  await source.fill(fixture("invalid/yaml-syntax.yaml"));
  await expect(problemsToggle).toHaveAttribute("aria-expanded", "true");
  await expect(problemItemsOf(page)).toHaveCount(1);
});

test("TC-ED-14 hides the whole console column and reopens it from the header or the status bar", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  const { problems, statusBar } = await openNewFile(page);
  const header = page.getByRole("button", { name: "Toggle consoles", exact: true }).first();
  const fromStatusBar = statusBar.getByRole("button", { name: "Toggle consoles", exact: true });

  await header.click();
  await expect(header).toHaveAttribute("aria-expanded", "false");
  await expect(problems).toBeHidden();
  const sidebar = await box(sidebarOf(page));
  const editor = await box(page.locator(".cm-editor"));
  expect(Math.abs(editor.width - (1366 - sidebar.width))).toBeLessThanOrEqual(3);

  await fromStatusBar.click();
  await expect(problems).toBeVisible();
  await expect(header).toHaveAttribute("aria-expanded", "true");
});

test("TC-ED-15 opens a collapsed Run console when Run is clicked", async ({ page }) => {
  const { run, runConsole } = await openNewFile(page);
  const runToggle = runConsole.getByRole("button", { name: "Run console", exact: true });
  await runToggle.click();
  await expect(runToggle).toHaveAttribute("aria-expanded", "false");

  await run.click();

  await expect(runToggle).toHaveAttribute("aria-expanded", "true");
  await expect(runConsole.getByRole("button", { name: "Open run details", exact: true })).toBeVisible();
});

test("TC-ED-16 stacks the consoles under the editor on a narrow screen", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const { problems } = await openNewFile(page);

  const editor = await box(page.locator(".cm-editor"));
  const problemsBox = await box(problems);
  expect(problemsBox.y).toBeGreaterThanOrEqual(editor.y + editor.height - 3);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("TC-ED-17 shows the diagnostics a save answers, with Save and with Ctrl+S", async ({ page }) => {
  const { source, save, state } = await openNewFile(page);
  // With the typing check unavailable, only the save can bring the diagnostics.
  await page.route("**/test-files/validate", (route) => route.abort());

  await source.fill(fixture("invalid/yaml-syntax.yaml"));
  await save.click();
  await expect(state).toHaveText("Saved");
  await expect(problemItemsOf(page)).toHaveText(["Line 7: Nested mappings are not allowed in compact mappings"]);

  await source.fill(fixture("invalid/timeout-bounds.yaml"));
  await source.press("Control+s");
  await expect(state).toHaveText("Saved");
  await expect(problemItemsOf(page)).toHaveText([
    'Line 5: "ms" must be a positive integer up to 2147483647',
    'Line 7: "ms" must be a positive integer up to 2147483647',
  ]);
});
