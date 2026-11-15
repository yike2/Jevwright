import { expect, test, type Browser, type Page } from "@playwright/test";
import {
  type Account,
  addTestFile,
  API_URL,
  createInSidebar,
  fixture,
  runFromEditor,
  runToEnd,
  setUpDemoProject,
  signUp,
  SWAG_PASSWORD,
  WORKSPACE,
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

test("TC-SEC-05 shows HTML in Project and Module names as text", async ({ page }) => {
  const html = "<img src=x onerror=alert(1)>";
  const dialogs: string[] = [];
  page.on("dialog", (dialog) => {
    dialogs.push(dialog.message());
    void dialog.dismiss();
  });
  await signUp(page);
  await page.goto(WORKSPACE);

  // Test File names allow no < or > at all (TC-WS-09), so only Project and Module names can hold HTML.
  for (const [opener, name] of [
    ["New project", html],
    [`New module in ${html}`, html],
    [`New test file in ${html}`, "plain"],
  ] as const) {
    const input = await createInSidebar(page, opener, name);
    await expect(input).toHaveCount(0);
  }

  await expect(page.getByRole("heading", { name: "plain.yaml", exact: true })).toBeVisible();
  await page.goto(WORKSPACE);
  const overview = page.getByRole("region", { name: "Test files", exact: true });
  await expect(overview.getByRole("heading", { level: 2, name: html, exact: true })).toBeVisible();
  await expect(overview.getByRole("link", { name: "plain.yaml", exact: true })).toBeVisible();
  await expect(page.locator('img[src="x"]')).toHaveCount(0);
  expect(dialogs).toEqual([]);
});

test("TC-SEC-06 serves no file outside a run's own files", async ({ page }) => {
  const { api, moduleId, token } = await setUpDemoProject(page);
  const testFileId = await addTestFile(api, moduleId, "sign-in.yaml", fixture("pass/sign-in.yaml"));
  const runId = await runToEnd(api, testFileId);

  for (const path of ["../../../.env", "..%2F..%2F..%2F.env", "..%2f..%2f..%2f..%2f..%2fetc%2fpasswd"]) {
    const response = await page.request.get(`${API_URL}/runs/${runId}/files/${path}?token=${token}`);
    expect(response.status(), path).toBe(404);
    expect(await response.text()).not.toMatch(/JWT_SECRET|DATABASE_URL|root:x:/);
  }
});

test("TC-SEC-07 closes Live Progress for a bad token or another user", async ({ page, browser }) => {
  const { api, moduleId, token } = await setUpDemoProject(page);
  const testFileId = await addTestFile(api, moduleId, "sign-in.yaml", fixture("pass/sign-in.yaml"));
  const runId = await runToEnd(api, testFileId);
  const b = await secondUser(browser);
  await page.goto(WORKSPACE);

  // Opened from the app's page, so the socket carries the frontend's Origin like the Run page's own.
  const open = (value: string) =>
    page.evaluate(
      (url) =>
        new Promise<{ code: number; first: string | null }>((resolve) => {
          let first: string | null = null;
          const socket = new WebSocket(url);
          socket.onmessage = (event) => {
            first ??= (JSON.parse(String(event.data)) as { type: string }).type;
          };
          socket.onclose = (event) => resolve({ code: event.code, first });
        }),
      `${API_URL.replace(/^http/, "ws")}/runs/${runId}/live?token=${encodeURIComponent(value)}`,
    );

  expect(await open("invalid")).toEqual({ code: 4401, first: null });
  expect(await open(b.account.token)).toEqual({ code: 4404, first: null });
  expect(await open(token)).toEqual({ code: 1000, first: "snapshot" });
  await b.page.context().close();
});
