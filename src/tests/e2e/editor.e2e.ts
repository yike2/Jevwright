import { fileURLToPath } from "node:url";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { addTestFile, alertsOf, createWorkspace, fixture, signUp, WORKSPACE } from "./support.js";

const MAX_SOURCE_CHARS = 262_144;

type Editor = { textarea: Locator; validation: Locator; save: Locator; unsaved: Locator };

function editorOf(page: Page): Editor {
  return {
    textarea: page.getByRole("textbox", { name: "Test file YAML" }),
    validation: page.getByRole("region", { name: "Validation" }),
    save: page.getByRole("button", { name: "Save", exact: true }),
    unsaved: page.getByText("Unsaved changes"),
  };
}

async function openNewFile(page: Page, source = fixture("pass/sign-in.yaml")): Promise<Editor> {
  const { api } = await signUp(page);
  const { moduleId } = await createWorkspace(api);
  const testFileId = await addTestFile(api, moduleId, "editor.yaml", source);
  await page.goto(`/files/${testFileId}`);
  const editor = editorOf(page);
  await expect(editor.textarea).toHaveValue(source);
  return editor;
}

test("TC-ED-01 shows the starter source and tracks unsaved changes", async ({ page }) => {
  const { api } = await signUp(page);
  await createWorkspace(api);
  await page.goto(WORKSPACE);
  await page.getByRole("button", { name: "New test file in Shopping", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "New test file", exact: true });
  await dialog.getByLabel("Name").fill("editor");
  await dialog.getByRole("button", { name: "Create", exact: true }).click();
  const { textarea, save, unsaved } = editorOf(page);

  const starter = 'name: "editor"\nsteps:\n  - open:\n      url: "https://example.com"\n';
  await expect(textarea).toHaveValue(starter);
  await expect(save).toBeDisabled();

  await textarea.fill(`${starter}#`);
  await expect(unsaved).toBeVisible();
  await expect(save).toBeEnabled();

  await textarea.fill(starter);
  await expect(unsaved).toBeHidden();
  await expect(save).toBeDisabled();
});

test("TC-ED-02 saves a source, keeps showing it, and shows it after a reload", async ({ page }) => {
  const { textarea, validation, save, unsaved } = await openNewFile(page, fixture("pass/locked-out.yaml"));
  const source = fixture("pass/sign-in.yaml");

  await textarea.fill(source);
  await save.click();

  await expect(unsaved).toBeHidden();
  // The saved source stays in the editor without a reload.
  await expect(textarea).toHaveValue(source);
  await expect(validation).toContainText("Valid. Ready to run.");
  await page.reload();
  await expect(textarea).toHaveValue(source);
});

test("TC-ED-03 uploads a file into the draft without saving it", async ({ page }) => {
  const original = fixture("pass/sign-in.yaml");
  const { textarea, save, unsaved } = await openNewFile(page, original);
  const fileInput = page.locator('input[type="file"]');
  const checkout = fileURLToPath(new URL("./fixtures/pass/checkout.yaml", import.meta.url));
  await expect(fileInput).toHaveAttribute("accept", ".yaml,.yml");

  await fileInput.setInputFiles(checkout);
  await expect(textarea).toHaveValue(fixture("pass/checkout.yaml"));
  await expect(unsaved).toBeVisible();

  await page.reload();
  await expect(textarea).toHaveValue(original);

  await fileInput.setInputFiles(checkout);
  await save.click();
  await expect(unsaved).toBeHidden();
  await page.reload();
  await expect(textarea).toHaveValue(fixture("pass/checkout.yaml"));
});

test("TC-ED-04 lists every error of an invalid file with its line", async ({ page }) => {
  const { textarea, validation, save } = await openNewFile(page);
  const expected = [
    'Line 3: "timeoutMs" must be a positive integer up to 2147483647',
    'Line 6: "url" is relative, so the test needs a "baseUrl"',
    'Line 7: Unknown action "aiAct"',
    'Line 8: Step must contain exactly one action, found "click" and "input"',
    'Line 13: Missing required field "value"',
    'Line 15: Needs at least one of "selector" and "target"',
    'Line 18: Unknown field "colour"',
  ];

  await textarea.fill(fixture("invalid/multiple-errors.yaml"));
  await page.getByRole("button", { name: "Validate", exact: true }).click();
  await expect(validation.getByText("7 validation errors", { exact: true })).toBeVisible();
  await expect(validation.getByRole("listitem")).toHaveText(expected);

  await save.click();
  await expect(page.getByText("Unsaved changes")).toBeHidden();
  await expect(validation.getByRole("listitem")).toHaveText(expected);
});

test("TC-ED-05 reports a YAML syntax error", async ({ page }) => {
  const { textarea, validation } = await openNewFile(page);

  await textarea.fill(fixture("invalid/yaml-syntax.yaml"));
  await page.getByRole("button", { name: "Validate", exact: true }).click();

  await expect(validation.getByText("1 validation error", { exact: true })).toBeVisible();
  await expect(validation.getByRole("listitem")).toHaveText([
    "Line 7: Nested mappings are not allowed in compact mappings",
  ]);
});

test("TC-ED-06 shows a fixed file as valid and clears the result on edit", async ({ page }) => {
  const { textarea, validation } = await openNewFile(page);
  const validate = page.getByRole("button", { name: "Validate", exact: true });
  await textarea.fill(fixture("invalid/multiple-errors.yaml"));
  await validate.click();
  await expect(validation.getByText("7 validation errors", { exact: true })).toBeVisible();

  await textarea.fill(fixture("pass/sign-in.yaml"));
  await validate.click();
  await expect(validation.getByText("Valid. Ready to run.", { exact: true })).toBeVisible();
  await expect(validation.getByRole("listitem")).toHaveCount(0);

  await textarea.fill(`${fixture("pass/sign-in.yaml")}#`);
  await expect(validation).toHaveText("");
});

test("TC-ED-07 saves a source of up to 262,144 characters", async ({ page }) => {
  const { textarea, save, unsaved } = await openNewFile(page);
  const base = `${fixture("pass/sign-in.yaml")}# `;
  const largest = base + "x".repeat(MAX_SOURCE_CHARS - base.length);
  expect(largest).toHaveLength(MAX_SOURCE_CHARS);

  await textarea.fill(largest);
  await save.click();
  await expect(unsaved).toBeHidden();

  await textarea.fill(`${largest}x`);
  await save.click();
  await expect(alertsOf(page)).toHaveText("The test file is too long: it can be at most 262,144 characters.");
  await expect(unsaved).toBeVisible();
  await expect(textarea).toHaveValue(`${largest}x`);
});

test("TC-ED-08 reports a file with no content", async ({ page }) => {
  const { textarea, validation } = await openNewFile(page);
  const validate = page.getByRole("button", { name: "Validate", exact: true });

  for (const source of ["", fixture("invalid/empty.yaml")]) {
    await textarea.fill(source);
    await validate.click();
    await expect(validation.getByText("1 validation error", { exact: true })).toBeVisible();
    await expect(validation.getByRole("listitem")).toHaveText(["Line 1: The root must be an object"]);
  }
});

test("TC-ED-09 accepts integers up to 2147483647 in plain digits only", async ({ page }) => {
  const { textarea, validation } = await openNewFile(page);

  await textarea.fill(fixture("invalid/timeout-bounds.yaml"));
  await page.getByRole("button", { name: "Validate", exact: true }).click();

  await expect(validation.getByText("2 validation errors", { exact: true })).toBeVisible();
  await expect(validation.getByRole("listitem")).toHaveText([
    'Line 5: "ms" must be a positive integer up to 2147483647',
    'Line 7: "ms" must be a positive integer up to 2147483647',
  ]);
});
