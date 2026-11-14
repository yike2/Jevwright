import { expect, test, type Browser, type Page } from "@playwright/test";
import {
  addTestFile,
  API_URL,
  fixture,
  runFromEditor,
  runToEnd,
  setUpDemoProject,
  signUp,
  SWAG_PASSWORD,
  type Account,
} from "./support.js";

// User B gets a browser context of its own, so no token or storage is shared with user A.
async function secondUser(browser: Browser): Promise<{ page: Page; account: Account }> {
  const page = await (await browser.newContext({ baseURL: test.info().project.use.baseURL })).newPage();
  const account = await signUp(page);
  return { page, account };
}

test("TC-SEC-01 hides another user's test file", async ({ page, browser }) => {
  const { api, moduleId } = await setUpDemoProject(page);
  const testFileId = await addTestFile(api, moduleId, "sign-in.yaml", fixture("pass/sign-in.yaml"));
  const b = await secondUser(browser);

  await b.page.goto(`/files/${testFileId}`);

  await expect(b.page.getByText("Test file not found", { exact: true })).toBeVisible();
  await expect(b.page.getByRole("navigation", { name: "Projects" }).getByText("Demo Shop")).toHaveCount(0);
  await b.page.context().close();
});

test("TC-SEC-02 hides another user's run and its files", async ({ page, browser }) => {
  const { api, moduleId } = await setUpDemoProject(page);
  const testFileId = await addTestFile(api, moduleId, "sign-in.yaml", fixture("pass/sign-in.yaml"));
  const runId = await runToEnd(api, testFileId);
  const b = await secondUser(browser);

  await b.page.goto(`/runs/${runId}`);
  await expect(b.page.getByText("Run not found", { exact: true })).toBeVisible();

  const screenshot = await b.page.request.get(
    `${API_URL}/runs/${runId}/files/screenshots/step-0.png?token=${encodeURIComponent(b.account.token)}`,
  );
  expect(screenshot.status()).toBe(404);
  await b.page.context().close();
});

test("TC-SEC-03 never shows a secret variable's value", async ({ page }) => {
  const { api, moduleId } = await setUpDemoProject(page);
  const testFileId = await addTestFile(api, moduleId, "redaction.yaml", fixture("fail/redaction.yaml"));
  const frames: string[] = [];
  page.on("websocket", (socket) => socket.on("framereceived", ({ payload }) => frames.push(String(payload))));

  expect(await runFromEditor(page, testFileId)).toBe("Failed");

  const step = page.getByRole("list", { name: "Steps" }).getByRole("listitem").nth(1);
  await expect(step).toContainText("{{SWAG_PASSWORD}}");
  await expect(page.locator("body")).not.toContainText(SWAG_PASSWORD);
  expect(frames.length).toBeGreaterThan(0);
  expect(frames.join("\n")).not.toContain(SWAG_PASSWORD);

  const href = await page.getByRole("link", { name: "Download report" }).getAttribute("href");
  const report = await (await page.request.get(href!)).text();
  expect(report).toContain("{{SWAG_PASSWORD}}");
  expect(report).not.toContain(SWAG_PASSWORD);
});
