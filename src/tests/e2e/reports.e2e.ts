import { expect, test, type Page } from "@playwright/test";
import {
  addTestFile,
  editorOf,
  fixture,
  runFromEditor,
  runToEnd,
  setUpDemoProject,
  signUp,
  sourceOf,
} from "./support.js";

type Report = {
  status: string;
  summary: { total: number; passed: number; failed: number; pending: number };
  steps: { index: number; status: string; reason?: string }[];
};

async function downloadReport(page: Page): Promise<Report> {
  const href = await page.getByRole("link", { name: "Download report" }).getAttribute("href");
  const response = await page.request.get(href!);
  expect(response.status()).toBe(200);
  return (await response.json()) as Report;
}

test("TC-RPT-01 shows the report of a passed run", async ({ page }) => {
  const { api, moduleId } = await setUpDemoProject(page);
  const testFileId = await addTestFile(api, moduleId, "sign-in.yaml", fixture("pass/sign-in.yaml"));
  expect(await runFromEditor(page, testFileId)).toBe("Passed");

  const steps = page.getByRole("list", { name: "Steps" }).getByRole("listitem");
  const expected = [
    ["open", 6],
    ["input", 8],
    ["input", 11],
    ["click", 14],
    ["waitFor", 16],
    ["assert", 18],
  ] as const;
  for (const [i, [action, line]] of expected.entries()) {
    const step = steps.nth(i);
    await expect(step).toContainText(`Step ${i + 1}`);
    await expect(step.getByText(action, { exact: true })).toBeVisible();
    await expect(step).toContainText(`line ${line}`);
    await expect(step).toContainText("Passed");
    await expect(step).toContainText(/\d+(\.\d)? m?s/);
    const screenshot = step.getByRole("img", { name: `Step ${i + 1} screenshot` });
    await expect(screenshot).toBeVisible();
    expect(await screenshot.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
  }
  for (const i of [1, 2, 3]) await expect(steps.nth(i).getByText("selector", { exact: true })).toBeVisible();

  const report = await downloadReport(page);
  expect(report.status).toBe("passed");
  expect(report.summary).toEqual({ total: 6, passed: 6, failed: 0, pending: 0 });
  expect(report.steps).toHaveLength(6);

  const traceHref = await page.getByRole("link", { name: "Download trace" }).getAttribute("href");
  const trace = await page.request.get(traceHref!);
  expect(trace.status()).toBe(200);
  expect((await trace.body()).subarray(0, 2).toString()).toBe("PK"); // a zip archive

  await page.getByRole("link", { name: "Back to sign-in.yaml" }).click();
  await expect(page).toHaveURL(`/files/${testFileId}`);
  const run = page.getByRole("region", { name: "Runs" }).getByRole("listitem");
  await expect(run).toHaveCount(1);
  await expect(run).toContainText(/^Passed · .+ · \d+(\.\d)? m?s$/);
});

test("TC-RPT-02 shows the report of a failed run", async ({ page }) => {
  const { api, moduleId } = await setUpDemoProject(page);
  const testFileId = await addTestFile(api, moduleId, "wrong-total.yaml", fixture("fail/wrong-total.yaml"));
  expect(await runFromEditor(page, testFileId)).toBe("Failed");

  const screenshot = page.getByRole("img", { name: "Step 14 screenshot" });
  await expect(screenshot).toBeVisible();
  expect(await screenshot.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);

  // The screenshot opens full size, and Escape closes it.
  await page.getByRole("button", { name: "Open step 14 screenshot full size", exact: true }).click();
  const viewer = page.getByRole("dialog", { name: "Step 14 screenshot", exact: true });
  await expect(viewer.getByRole("img", { name: "Step 14 screenshot, full size", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(viewer).toBeHidden();

  const report = await downloadReport(page);
  expect(report.status).toBe("failed");
  expect(report.steps[13]).toMatchObject({ status: "failed" });
  expect(report.steps[13]?.reason).toContain('did not contain "Total: $99.99"');
});

test("TC-RPT-03 lists every run of a file, newest first, each with its own source", async ({ page }) => {
  const { api, moduleId } = await setUpDemoProject(page);
  const testFileId = await addTestFile(api, moduleId, "flow.yaml", fixture("pass/sign-in.yaml"));
  await runToEnd(api, testFileId);
  await api("PATCH", `/test-files/${testFileId}`, { source: fixture("fail/wrong-total.yaml") }, 200);
  await runToEnd(api, testFileId);
  await runToEnd(api, testFileId);

  await page.goto(`/files/${testFileId}`);
  const runs = page.getByRole("region", { name: "Runs" }).getByRole("listitem");
  await expect(runs).toHaveCount(3);
  await expect(runs.nth(0)).toContainText(/^Failed · /);
  await expect(runs.nth(1)).toContainText(/^Failed · /);
  await expect(runs.nth(2)).toContainText(/^Passed · /);

  const details = page.getByRole("dialog", { name: "flow.yaml", exact: true });
  const source = details.getByLabel("Source when it ran", { exact: true });
  await runs.nth(2).getByRole("link").click();
  await expect(details.getByRole("list", { name: "Steps" }).getByRole("listitem")).toHaveCount(6);
  await details.getByText("Source when it ran", { exact: true }).click();
  await expect(source).toHaveText(fixture("pass/sign-in.yaml"));
  await page.keyboard.press("Escape");
  await expect(details).toBeHidden();
  await runs.nth(0).getByRole("link").click();
  await expect(details.getByRole("list", { name: "Steps" }).getByRole("listitem")).toHaveCount(16);
  await details.getByText("Source when it ran", { exact: true }).click();
  await expect(source).toHaveText(fixture("fail/wrong-total.yaml"));
});

test("TC-RPT-07 opens a run's details in a sheet over the editor, which keeps its draft", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  const { api, moduleId } = await setUpDemoProject(page);
  const testFileId = await addTestFile(api, moduleId, "sign-in.yaml", fixture("pass/sign-in.yaml"));
  const runId = await runToEnd(api, testFileId);
  await page.goto(`/files/${testFileId}`);
  const { source, state } = editorOf(page);
  const draft = `${fixture("pass/sign-in.yaml")}# a draft\n`;
  await source.fill(draft);
  await expect(state).toHaveText("Unsaved");
  const run = page.getByRole("region", { name: "Runs" }).getByRole("link").first();
  const details = page.getByRole("dialog", { name: "sign-in.yaml", exact: true });

  // It slides in from the right over most of the editor, and Escape closes it.
  await run.click();
  await expect(details.getByText("Status: Passed", { exact: true })).toBeVisible();
  await expect(details.getByRole("list", { name: "Steps" }).getByRole("listitem")).toHaveCount(6);
  // Once it has slid in, its right edge is the window's.
  await expect
    .poll(async () => Math.round(((await details.boundingBox())?.x ?? 0) + ((await details.boundingBox())?.width ?? 0)))
    .toBe(1366);
  expect((await details.boundingBox())!.width).toBeGreaterThan(1366 * 0.6);
  await expect(page).toHaveURL(`/files/${testFileId}`);
  await page.keyboard.press("Escape");
  await expect(details).toBeHidden();
  expect(await sourceOf(page)).toBe(draft);
  await expect(state).toHaveText("Unsaved");

  // The close button and a click on the uncovered part close it too.
  await run.click();
  await details.getByRole("button", { name: "Close", exact: true }).click();
  await expect(details).toBeHidden();
  await run.click();
  await expect(details).toBeVisible();
  await page.mouse.click(20, 400);
  await expect(details).toBeHidden();
  expect(await sourceOf(page)).toBe(draft);

  // It also opens full page, at the Run's own URL.
  await run.click();
  await details.getByRole("link", { name: "Open full page", exact: true }).click();
  await expect(page).toHaveURL(`/runs/${runId}`);
  await expect(page.getByRole("heading", { name: "sign-in.yaml", exact: true })).toBeVisible();
});

test("TC-RPT-04 keeps a run after its file is deleted", async ({ page }) => {
  const { api, moduleId } = await setUpDemoProject(page);
  const testFileId = await addTestFile(api, moduleId, "sign-in.yaml", fixture("pass/sign-in.yaml"));
  const runId = await runToEnd(api, testFileId);
  await api("DELETE", `/test-files/${testFileId}`);

  await page.goto(`/runs/${runId}`);

  await expect(page.getByText("Status: Passed", { exact: true })).toBeVisible();
  await expect(page.getByRole("list", { name: "Steps" }).getByRole("listitem")).toHaveCount(6);
  await expect(page.getByRole("link", { name: "Download report" })).toBeVisible();
  await expect(page.getByRole("link", { name: /^Back to / })).toHaveCount(0);
});

test("TC-RPT-05 shows a run that does not exist as not found", async ({ page }) => {
  await setUpDemoProject(page);

  await page.goto("/runs/00000000-0000-4000-8000-000000000000");

  await expect(page.getByText("Run not found", { exact: true })).toBeVisible();
});

test("TC-RPT-06 shows a malformed id as not found", async ({ page }) => {
  await signUp(page);

  await page.goto("/runs/not-a-uuid");
  await expect(page.getByText("Run not found", { exact: true })).toBeVisible();
  await expect(page.getByRole("list", { name: "Steps" })).toHaveCount(0);

  await page.goto("/files/not-a-uuid");
  await expect(page.getByText("Test file not found", { exact: true })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Test file YAML" })).toHaveCount(0);
});
