import { fileURLToPath } from "node:url";
import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  addTestFile,
  alertsOf,
  createInSidebar,
  createWorkspace,
  editorOf,
  fixture,
  pickNew,
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
  const { folder } = await createWorkspace(api);
  const testFileId = await addTestFile(api, folder, "editor.yaml", source);
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
  await createInSidebar(page, { item: "New test file", in: "Shopping" }, "editor");
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
  const { source, state, save, debug } = await openNewFile(page, fixture("pass/locked-out.yaml"));
  const signIn = fixture("pass/sign-in.yaml");

  await source.fill(signIn);
  await save.click();

  await expect(state).toHaveText("Saved");
  // The saved source stays in the editor without a reload.
  expect(await sourceOf(page)).toBe(signIn);
  await expect(debug.getByText("No problems").first()).toBeVisible();
  await expect(debug).not.toContainText("Valid. Ready to run.");
  await page.reload();
  await expect.poll(() => sourceOf(page)).toBe(signIn);
});

test("TC-ED-03 uploads a file into a new test file from a folder's + menu", async ({ page }) => {
  const { api } = await signUp(page);
  await createWorkspace(api);
  await page.goto(WORKSPACE);
  const sidebar = sidebarOf(page);
  const checkout = fileURLToPath(new URL("./fixtures/pass/checkout.yaml", import.meta.url));

  const chooser = page.waitForEvent("filechooser");
  await pickNew(page, "Upload files…", "Shopping");
  await (await chooser).setFiles(checkout);

  await expect(page).toHaveURL(/\/files\/[^/]+$/);
  await expect(sidebar.getByRole("link", { name: "checkout.yaml", exact: true })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect.poll(() => sourceOf(page)).toBe(fixture("pass/checkout.yaml"));
  await expect(editorOf(page).state).toHaveText("Saved");
  await expect(page.locator('input[type="file"]')).toHaveAttribute("accept", ".yaml,.yml");

  // A second upload of the same name is skipped with the reason, and overwrites nothing.
  const again = page.waitForEvent("filechooser");
  await pickNew(page, "Upload files…", "Shopping");
  await (await again).setFiles(checkout);
  const messages = sidebar.getByRole("status", { name: "Sidebar messages", exact: true });
  await expect(messages).toContainText("Imported no test files. 1 skipped:");
  await expect(messages.getByRole("list", { name: "Skipped" })).toHaveText(
    "checkout.yaml: A folder or test file with this name already exists in this folder.",
  );
  await expect(sidebar.getByRole("link", { name: "checkout.yaml", exact: true })).toHaveCount(1);
  await expect.poll(() => sourceOf(page)).toBe(fixture("pass/checkout.yaml"));
});

test("TC-ED-21 uploads several files at once and lists the ones it skips", async ({ page }) => {
  const { api } = await signUp(page);
  await createWorkspace(api);
  await page.goto(WORKSPACE);
  const sidebar = sidebarOf(page);

  const chooser = page.waitForEvent("filechooser");
  await pickNew(page, "Upload files…", "Demo Shop");
  await (
    await chooser
  ).setFiles([
    { name: "sign-in.yaml", mimeType: "application/yaml", buffer: Buffer.from(fixture("pass/sign-in.yaml")) },
    { name: "checkout.yml", mimeType: "application/yaml", buffer: Buffer.from(fixture("pass/checkout.yaml")) },
    { name: "sign in.yaml", mimeType: "application/yaml", buffer: Buffer.from("name: x\n") },
  ]);

  const messages = sidebar.getByRole("status", { name: "Sidebar messages", exact: true });
  await expect(messages).toContainText("Imported 2 test files. 1 skipped:");
  await expect(messages.getByRole("list", { name: "Skipped" })).toHaveText(
    "sign in.yaml: Use only letters, digits, -, _ and ., with no spaces.",
  );
  await expect(sidebar.getByRole("link", { name: "sign-in.yaml", exact: true })).toBeVisible();
  await expect(sidebar.getByRole("link", { name: "checkout.yaml", exact: true })).toBeVisible();
  // Several files do not open one of them.
  await expect(page).toHaveURL(WORKSPACE);
});

test("TC-ED-04 lists every error of an invalid file with its line as the user types", async ({ page }) => {
  const { source, debug, save } = await openNewFile(page);
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
  await expect(debug.getByText("7 problems", { exact: true })).toBeVisible();
  await expect(problemItemsOf(page)).toHaveText(expected);
  // Each diagnostic is marked on its own line of the editor.
  await expect(page.locator(".cm-lint-marker-error")).toHaveCount(7);

  await save.click();
  await expect(editorOf(page).state).toHaveText("Saved");
  await expect(problemItemsOf(page)).toHaveText(expected);
});

test("TC-ED-05 reports a YAML syntax error", async ({ page }) => {
  const { source, debug } = await openNewFile(page);

  await source.fill(fixture("invalid/yaml-syntax.yaml"));

  await expect(debug.getByText("1 problem", { exact: true })).toBeVisible();
  await expect(problemItemsOf(page)).toHaveText(["Line 7: Nested mappings are not allowed in compact mappings"]);
});

test("TC-ED-06 shows a fixed file as having no problems", async ({ page }) => {
  const { source, debug } = await openNewFile(page);
  await source.fill(fixture("invalid/multiple-errors.yaml"));
  await expect(problemItemsOf(page)).toHaveCount(7);

  await source.fill(fixture("pass/sign-in.yaml"));

  await expect(problemItemsOf(page)).toHaveCount(0);
  await expect(debug.getByText("No problems").first()).toBeVisible();
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
  const { source, state, output } = await openNewFile(page);

  await source.fill(`${fixture("pass/sign-in.yaml")}# saved by keyboard\n`);
  await expect(state).toHaveText("Unsaved");
  await source.press("Control+s");
  await expect(state).not.toHaveText("Unsaved");

  await source.press("Control+Enter");
  await expect(output.getByRole("region", { name: "Runs" }).getByRole("listitem")).toHaveCount(1);
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
  const { debug, output } = await openNewFile(page);
  const sidebar = await box(sidebarOf(page));
  const editor = await box(page.locator(".cm-editor"));
  const debugBox = await box(debug);
  const outputBox = await box(output);

  // Only the 1px resize handles separate the regions; no centered column or outer padding.
  expect(Math.abs(editor.x - (sidebar.x + sidebar.width))).toBeLessThanOrEqual(3);
  expect(Math.abs(debugBox.x - (editor.x + editor.width))).toBeLessThanOrEqual(3);
  expect(Math.abs(debugBox.x + debugBox.width - 1366)).toBeLessThanOrEqual(1);
  expect(Math.abs(editor.width - (1366 - sidebar.width - debugBox.width))).toBeLessThanOrEqual(3);
  expect(editor.width / (editor.width + debugBox.width)).toBeCloseTo(0.6, 1);
  // Debug on top, Output below, sharing the column evenly by default.
  expect(outputBox.y).toBeGreaterThan(debugBox.y);
  expect(Math.abs(outputBox.height - debugBox.height)).toBeLessThanOrEqual(3);
  // Three handles: the sidebar's, editor | consoles, and Debug / Output while both consoles are open.
  await expect(page.getByRole("separator")).toHaveCount(3);
  await expect(page.getByRole("separator", { name: "Resize consoles", exact: true })).toHaveCount(1);
  await expect(page.getByRole("separator", { name: "Resize Debug and Output consoles", exact: true })).toHaveCount(1);
  // The page itself never scrolls.
  expect(await page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight)).toBe(true);
});

test("TC-ED-13 collapses the consoles, keeps that per browser, and reopens Debug for new problems only", async ({
  page,
}) => {
  const { source, debug } = await openNewFile(page);
  const debugToggle = debug.getByRole("button", { name: "Debug console", exact: true });

  await debugToggle.click();
  await expect(debugToggle).toHaveAttribute("aria-expanded", "false");
  await page.reload();
  await expect(debugToggle).toHaveAttribute("aria-expanded", "false");

  // Valid edits leave it collapsed.
  await source.fill(`${fixture("pass/sign-in.yaml")}# still valid\n`);
  await page.waitForTimeout(1_000);
  await expect(debugToggle).toHaveAttribute("aria-expanded", "false");

  // A new diagnostic opens it.
  await source.fill(fixture("invalid/yaml-syntax.yaml"));
  await expect(debugToggle).toHaveAttribute("aria-expanded", "true");
  await expect(problemItemsOf(page)).toHaveCount(1);
});

test("TC-ED-14 hides the whole console column and reopens it from the header or the status bar", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  const { debug, statusBar } = await openNewFile(page);
  const header = page.getByRole("button", { name: "Toggle consoles", exact: true }).first();
  const fromStatusBar = statusBar.getByRole("button", { name: "Toggle consoles", exact: true });

  await header.click();
  await expect(header).toHaveAttribute("aria-expanded", "false");
  await expect(debug).toBeHidden();
  const sidebar = await box(sidebarOf(page));
  const editor = await box(page.locator(".cm-editor"));
  expect(Math.abs(editor.width - (1366 - sidebar.width))).toBeLessThanOrEqual(3);

  await fromStatusBar.click();
  await expect(debug).toBeVisible();
  await expect(header).toHaveAttribute("aria-expanded", "true");
});

test("TC-ED-15 opens a collapsed Output console when Run is clicked", async ({ page }) => {
  const { run, output } = await openNewFile(page);
  const outputToggle = output.getByRole("button", { name: "Output console", exact: true });
  await outputToggle.click();
  await expect(outputToggle).toHaveAttribute("aria-expanded", "false");

  await run.click();

  await expect(outputToggle).toHaveAttribute("aria-expanded", "true");
  await expect(output.getByRole("button", { name: "Open run details", exact: true })).toBeVisible();
});

test("TC-ED-16 stacks the consoles under the editor on a narrow screen", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const { debug } = await openNewFile(page);

  const editor = await box(page.locator(".cm-editor"));
  const debugBox = await box(debug);
  expect(debugBox.y).toBeGreaterThanOrEqual(editor.y + editor.height - 3);
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

test("TC-ED-18 opens and collapses each console on its own, in every combination", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  const { debug, output } = await openNewFile(page);
  const debugToggle = debug.getByRole("button", { name: "Debug console", exact: true });
  const outputToggle = output.getByRole("button", { name: "Output console", exact: true });
  const columnToggle = page.getByRole("button", { name: "Toggle consoles", exact: true }).first();
  const split = page.getByRole("separator", { name: "Resize Debug and Output consoles", exact: true });
  const expectOpen = async (debugOpen: boolean, outputOpen: boolean) => {
    await expect(debugToggle).toHaveAttribute("aria-expanded", String(debugOpen));
    await expect(outputToggle).toHaveAttribute("aria-expanded", String(outputOpen));
    // The handle between the consoles is there only while both are open.
    await expect(split).toHaveCount(debugOpen && outputOpen ? 1 : 0);
    const [d, o] = [await box(debug), await box(output)];
    // An open console takes the room the other leaves; a collapsed one keeps only its header.
    if (debugOpen && outputOpen) expect(Math.abs(d.height - o.height)).toBeLessThanOrEqual(3);
    if (debugOpen && !outputOpen) expect(d.height).toBeGreaterThan(o.height * 5);
    if (!debugOpen && outputOpen) expect(o.height).toBeGreaterThan(d.height * 5);
    if (!debugOpen && !outputOpen) expect(Math.abs(d.height - o.height)).toBeLessThanOrEqual(3);
  };

  await expectOpen(true, true);
  await debugToggle.click();
  await expectOpen(false, true);
  // With Debug collapsed, Output still collapses: both show only their headers.
  await outputToggle.click();
  await expectOpen(false, false);
  await debugToggle.click();
  await expectOpen(true, false);
  // With Debug open, Output still opens.
  await outputToggle.click();
  await expectOpen(true, true);
  await outputToggle.click();
  await expectOpen(true, false);

  // The column toggle hides and restores the column without changing either console.
  await columnToggle.click();
  await expect(debug).toBeHidden();
  await columnToggle.click();
  await expectOpen(true, false);

  // Opening by itself opens only its own console: Run opens Output and leaves Debug collapsed.
  await debugToggle.click();
  await expectOpen(false, false);
  await editorOf(page).run.click();
  await expectOpen(false, true);
  // A new problem opens Debug and leaves Output open.
  await editorOf(page).source.fill(fixture("invalid/yaml-syntax.yaml"));
  await expectOpen(true, true);
});

test("TC-ED-19 drags the split between the consoles, keeps it per browser, and restores it on reopening", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  const { debug, output } = await openNewFile(page);
  const split = page.getByRole("separator", { name: "Resize Debug and Output consoles", exact: true });
  const outputToggle = output.getByRole("button", { name: "Output console", exact: true });
  const share = async () => {
    const [d, o] = [await box(debug), await box(output)];
    return d.height / (d.height + o.height);
  };
  expect(await share()).toBeCloseTo(0.5, 1);

  // The handle moves with the keyboard as well as by dragging.
  await split.focus();
  for (let i = 0; i < 10; i += 1) await page.keyboard.press("ArrowUp");
  await expect.poll(share).toBeLessThan(0.4);
  const dragged = await share();

  await outputToggle.click();
  await expect(split).toHaveCount(0);
  await outputToggle.click();
  await expect.poll(share).toBeCloseTo(dragged, 2);

  await page.reload();
  await expect(split).toHaveCount(1);
  await expect.poll(share).toBeCloseTo(dragged, 2);
});

test("TC-ED-20 gives every scrollable region of the editor page the editor's scrollbar, in both themes", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await openNewFile(page, fixture("invalid/multiple-errors.yaml"));

  for (const theme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: theme });
    await expect(page.locator("html")).toHaveClass(new RegExp(`(^|\\s)${theme}(\\s|$)`));
    const styles = await page.evaluate(() => {
      const body = (name: string) => {
        const toggle = document.querySelector(`section[aria-label="${name}"] button[aria-controls]`);
        return toggle ? document.getElementById(toggle.getAttribute("aria-controls") ?? "") : null;
      };
      const regions: Record<string, Element | null> = {
        editor: document.querySelector(".cm-scroller"),
        tree: document.querySelector('nav[aria-label="Projects"] .overflow-auto'),
        debug: body("Debug"),
        output: body("Output"),
      };
      return Object.fromEntries(
        Object.entries(regions).map(([name, element]) => {
          if (!element) return [name, "missing"];
          const style = getComputedStyle(element);
          return [name, `${style.overflowY} ${style.scrollbarWidth} ${style.scrollbarColor}`];
        }),
      );
    });
    const thumb = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue("--scrollbar-thumb").trim(),
    );
    expect(thumb).toBe(theme === "light" ? "#8a8a8a" : "#737373");
    expect(styles.editor, "editor").toMatch(/^auto thin /);
    for (const name of ["tree", "debug", "output"]) expect(styles[name], name).toBe(styles.editor);
  }
});
