import { expect, test, type Page } from "@playwright/test";
import { addTestFile, alertsOf, fixture, runFromEditor, runToEnd, setUpDemoProject, signUp } from "./support.js";

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

  await runs.nth(2).getByRole("link").click();
  await expect(page.getByRole("list", { name: "Steps" }).getByRole("listitem")).toHaveCount(6);
  await page.goBack();
  await runs.nth(0).getByRole("link").click();
  await expect(page.getByRole("list", { name: "Steps" }).getByRole("listitem")).toHaveCount(16);
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

test("TC-RPT-06 shows the backend's message for a malformed id", async ({ page }) => {
  await signUp(page);

  await page.goto("/runs/not-a-uuid");
  await expect(alertsOf(page)).toHaveText("The request fails its schema");
  await expect(page.getByRole("list", { name: "Steps" })).toHaveCount(0);

  await page.goto("/files/not-a-uuid");
  await expect(alertsOf(page)).toHaveText("The request fails its schema");
  await expect(page.getByRole("textbox", { name: "Test file YAML" })).toHaveCount(0);
});
