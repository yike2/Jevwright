import { expect, test, type Page } from "@playwright/test";
import { addTestFile, fixture, setUpDemoProject, signUp, runToEnd, startRun } from "./support.js";

const TRIGGER_TIME = /\d{1,2}:\d{2}/;

function fileItem(page: Page, name: string) {
  const overview = page.getByRole("region", { name: "Test files", exact: true });
  return overview.getByRole("listitem").filter({ has: page.getByRole("link", { name, exact: true }) });
}

test("TC-OV-01 shows an empty overview, then files grouped by project and module", async ({ page }) => {
  const { api } = await signUp(page);
  await page.goto("/");
  const overview = page.getByRole("region", { name: "Test files", exact: true });
  await expect(overview.getByText("No test files yet", { exact: true })).toBeVisible();

  const project = await api<{ id: string }>("POST", "/projects", { name: "Demo Shop" });
  const module = await api<{ id: string }>("POST", `/projects/${project.id}/modules`, { name: "Shopping" });
  const testFileId = await addTestFile(api, module.id, "sign-in.yaml", fixture("pass/sign-in.yaml"));
  await page.goto("/");

  await expect(overview.getByRole("heading", { level: 2, name: "Demo Shop", exact: true })).toBeVisible();
  await expect(overview.getByRole("heading", { level: 3, name: "Shopping", exact: true })).toBeVisible();
  await expect(fileItem(page, "sign-in.yaml")).toContainText("Never run");

  await overview.getByRole("link", { name: "sign-in.yaml", exact: true }).click();
  await expect(page).toHaveURL(`/files/${testFileId}`);
});

test("TC-OV-02 shows the latest status of each file", async ({ page }) => {
  const { api, moduleId } = await setUpDemoProject(page);
  const passing = await addTestFile(api, moduleId, "sign-in.yaml", fixture("pass/sign-in.yaml"));
  const failing = await addTestFile(api, moduleId, "wrong-total.yaml", fixture("fail/wrong-total.yaml"));
  await runToEnd(api, passing);
  await runToEnd(api, failing);

  await page.goto("/");
  await expect(fileItem(page, "sign-in.yaml")).toContainText("Passed");
  await expect(fileItem(page, "sign-in.yaml")).toContainText(TRIGGER_TIME);
  await expect(fileItem(page, "wrong-total.yaml")).toContainText("Failed");
  await expect(fileItem(page, "wrong-total.yaml")).toContainText(TRIGGER_TIME);

  const runId = await startRun(api, failing);
  await page.goto("/");
  await expect(fileItem(page, "wrong-total.yaml")).toContainText("Running");

  await expect
    .poll(async () => (await api<{ status: string }>("GET", `/runs/${runId}`)).status, { timeout: 60_000 })
    .toBe("failed");
  await page.reload();
  await expect(fileItem(page, "wrong-total.yaml")).toContainText("Failed");
});
