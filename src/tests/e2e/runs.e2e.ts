import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  addTestFile,
  API_URL,
  DEMO_URL,
  fixture,
  runFromEditor,
  setUpDemoProject,
  startRun,
  waitForFinalStatus,
} from "./support.js";

type LiveMessage = { type: string; run?: { status: string }; step?: { index: number; status: string } };

function stepsOf(page: Page): Locator {
  return page.getByRole("list", { name: "Steps" }).getByRole("listitem");
}

// Records every Live Progress message the page receives, to check the transitions the page shows.
function recordLiveMessages(page: Page): LiveMessage[] {
  const messages: LiveMessage[] = [];
  page.on("websocket", (socket) => {
    if (!socket.url().includes("/live")) return;
    socket.on("framereceived", ({ payload }) => {
      messages.push(JSON.parse(String(payload)) as LiveMessage);
    });
  });
  return messages;
}

function stepStatuses(messages: LiveMessage[], index: number): string[] {
  return messages.flatMap((m) => (m.type === "step" && m.step?.index === index ? [m.step.status] : []));
}

async function runFixture(page: Page, path: string, name: string): Promise<"Passed" | "Failed"> {
  const { api, moduleId } = await setUpDemoProject(page);
  const testFileId = await addTestFile(api, moduleId, name, fixture(path));
  return runFromEditor(page, testFileId);
}

test("TC-RUN-01 runs a passing test and watches it live", async ({ page }) => {
  const { api, moduleId } = await setUpDemoProject(page);
  const testFileId = await addTestFile(api, moduleId, "sign-in.yaml", fixture("pass/sign-in.yaml"));
  await page.goto(`/files/${testFileId}`);
  const runs = page.getByRole("region", { name: "Runs" });
  await expect(runs.getByText("No runs yet")).toBeVisible();

  await page.getByRole("button", { name: "Run", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("Run queued.");
  await expect(runs.getByRole("listitem")).toHaveCount(1);

  let navigations = 0;
  await page.getByRole("link", { name: "View run" }).click();
  await expect(page).toHaveURL(/\/runs\/[^/]+$/);
  page.on("framenavigated", (frame) => {
    if (frame === page.mainFrame()) navigations += 1;
  });
  await expect(page.getByRole("heading", { name: "sign-in.yaml", exact: true })).toBeVisible();

  expect(await waitForFinalStatus(page)).toBe("Passed");
  expect(navigations).toBe(0);
  await expect(page.getByText("6/6 passed", { exact: true })).toBeVisible();
  const steps = stepsOf(page);
  await expect(steps).toHaveCount(6);
  for (let i = 0; i < 6; i += 1) await expect(steps.nth(i)).toContainText("Passed");
  for (const i of [1, 2, 3]) await expect(steps.nth(i)).toContainText("selector");

  const dot = page.getByRole("link", { name: "sign-in.yaml", exact: true }).locator("[data-status]");
  await expect(dot).toHaveAttribute("data-status", "passed");
  await expect(dot).toHaveAttribute("title", "Passed");
});

test("TC-RUN-02 runs a longer flow", async ({ page }) => {
  expect(await runFixture(page, "pass/checkout.yaml", "checkout.yaml")).toBe("Passed");
  await expect(page.getByText("16/16 passed", { exact: true })).toBeVisible();
});

test("TC-RUN-03 passes a test that expects the app's own error", async ({ page }) => {
  expect(await runFixture(page, "pass/locked-out.yaml", "locked-out.yaml")).toBe("Passed");
  await expect(page.getByText("6/6 passed", { exact: true })).toBeVisible();
});

test("TC-RUN-04 runs every action and dialog answer", async ({ page }) => {
  expect(await runFixture(page, "pass/all-actions.yaml", "all-actions.yaml")).toBe("Passed");
  await expect(page.getByText("35/35 passed", { exact: true })).toBeVisible();

  const list = page.getByRole("list", { name: "Steps" });
  for (const action of [
    "open",
    "input",
    "click",
    "doubleClick",
    "rightClick",
    "hover",
    "press",
    "scroll",
    "sleep",
    "back",
    "forward",
    "reload",
    "switchTab",
    "waitFor",
    "assert",
  ]) {
    await expect(list.getByText(action, { exact: true }).first()).toBeVisible();
  }
});

test("TC-RUN-05 stops at a failing assertion", async ({ page }) => {
  expect(await runFixture(page, "fail/wrong-total.yaml", "wrong-total.yaml")).toBe("Failed");
  await expect(page.getByText("13/16 passed", { exact: true })).toBeVisible();

  const steps = stepsOf(page);
  const failed = steps.nth(13);
  await expect(failed).toContainText("Failed");
  await expect(failed).toContainText(
    'Text of "[data-test="total-label"]" did not contain "Total: $99.99" within 3000ms; it was "Total: $32.39"',
  );
  await expect(failed.getByRole("img", { name: "Step 14 screenshot" })).toBeVisible();
  for (const i of [14, 15]) {
    await expect(steps.nth(i)).toContainText("Pending");
    await expect(steps.nth(i).getByRole("img")).toHaveCount(0);
  }

  const dot = page.getByRole("link", { name: "wrong-total.yaml", exact: true }).locator("[data-status]");
  await expect(dot).toHaveAttribute("data-status", "failed");
  await expect(dot).toHaveAttribute("title", "Failed");
});

test("TC-RUN-06 fails a selector that matches nothing at its timeout", async ({ page }) => {
  expect(await runFixture(page, "fail/missing-element.yaml", "missing-element.yaml")).toBe("Failed");

  const steps = stepsOf(page);
  await expect(steps.nth(1)).toContainText("Failed");
  await expect(steps.nth(1)).toContainText("selector");
  await expect(steps.nth(1)).toContainText('No element matches "[data-test="no-such-button"]" within 3000ms');
  await expect(steps.nth(2)).toContainText("Pending");
});

test("TC-RUN-07 keeps a second run queued until the first one finishes", async ({ page }) => {
  const { api, moduleId } = await setUpDemoProject(page);
  const slowId = await addTestFile(api, moduleId, "slow.yaml", fixture("pass/slow.yaml"));
  const signInId = await addTestFile(api, moduleId, "sign-in.yaml", fixture("pass/sign-in.yaml"));
  const messages = recordLiveMessages(page);

  const slowRunId = await startRun(api, slowId);
  await page.goto(`/files/${signInId}`);
  await page.getByRole("button", { name: "Run", exact: true }).click();
  await page.getByRole("link", { name: "View run" }).click();

  await expect(page.getByText("Status: Queued", { exact: true })).toBeVisible();
  await expect(page.getByText("Status: Running", { exact: true })).toBeVisible({ timeout: 30_000 });
  expect(await waitForFinalStatus(page)).toBe("Passed");

  const runStatuses = messages.flatMap((m) => (m.type === "status" && m.run ? [m.run.status] : []));
  expect(runStatuses).toEqual(["running", "passed"]);
  for (let i = 0; i < 6; i += 1) expect(stepStatuses(messages, i)).toEqual(["running", "passed"]);
  expect((await api<{ status: string }>("GET", `/runs/${slowRunId}`)).status).toBe("passed");
});

test("TC-RUN-08 shows the steps done so far to a page opened late", async ({ page }) => {
  const { api, moduleId, token } = await setUpDemoProject(page);
  const testFileId = await addTestFile(api, moduleId, "slow.yaml", fixture("pass/slow.yaml"));
  await page.goto(`/files/${testFileId}`);
  await page.getByRole("button", { name: "Run", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("Run queued.");
  // Open the Run page late: once step 1 is done (its screenshot is written when it finishes), during the 8 s sleep.
  const runId = (await page.getByRole("link", { name: "View run" }).getAttribute("href"))!.split("/").pop()!;
  await expect
    .poll(async () =>
      (await page.request.get(`${API_URL}/runs/${runId}/files/screenshots/step-0.png?token=${token}`)).status(),
    )
    .toBe(200);

  await page.getByRole("link", { name: "View run" }).click();
  const steps = stepsOf(page);
  await expect(page.getByText("Status: Running", { exact: true })).toBeVisible();
  await expect(steps.nth(0)).toContainText("Passed");
  await expect(steps.nth(1)).toContainText("Running");

  expect(await waitForFinalStatus(page)).toBe("Passed");
  await expect(steps.nth(2)).toContainText("Passed");
});

test("TC-RUN-09 fails a step that meets an unexpected dialog", async ({ page }) => {
  expect(await runFixture(page, "fail/unexpected-dialog.yaml", "unexpected-dialog.yaml")).toBe("Failed");

  const steps = stepsOf(page);
  await expect(steps.nth(1)).toContainText('Unexpected alert dialog: "Profile saved"');
  await expect(steps.nth(2)).toContainText("Pending");
});

test("TC-RUN-10 ends a run at its runTimeoutMs", async ({ page }) => {
  expect(await runFixture(page, "fail/run-timeout.yaml", "run-timeout.yaml")).toBe("Failed");

  const reason = "The run did not finish within runTimeoutMs (10000 ms)";
  await expect(page.getByText(`Timed out: ${reason}`, { exact: true })).toBeVisible();
  const steps = stepsOf(page);
  await expect(steps.nth(1)).toContainText("Failed");
  await expect(steps.nth(1)).toContainText(reason);
  await expect(steps.nth(2)).toContainText("Pending");
});

test("TC-RUN-11 refuses to run an invalid file", async ({ page }) => {
  const { api, moduleId } = await setUpDemoProject(page);
  const testFileId = await addTestFile(api, moduleId, "invalid.yaml", fixture("invalid/multiple-errors.yaml"));
  await page.goto(`/files/${testFileId}`);

  await page.getByRole("button", { name: "Run", exact: true }).click();

  const validation = page.getByRole("region", { name: "Validation" });
  await expect(validation.getByText("7 validation errors", { exact: true })).toBeVisible();
  await expect(validation.getByRole("listitem")).toHaveCount(7);
  await expect(page.getByRole("status")).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Runs" }).getByText("No runs yet")).toBeVisible();
});

test("TC-RUN-12 saves unsaved changes before running them", async ({ page }) => {
  const { api, moduleId } = await setUpDemoProject(page);
  const testFileId = await addTestFile(api, moduleId, "flow.yaml", fixture("pass/locked-out.yaml"));
  await page.goto(`/files/${testFileId}`);
  const textarea = page.getByRole("textbox", { name: "Test file YAML" });

  await textarea.fill(fixture("pass/checkout.yaml"));
  await page.getByRole("button", { name: "Run", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("Run queued.");

  await page.reload();
  await expect(textarea).toHaveValue(fixture("pass/checkout.yaml"));
  await page.getByRole("region", { name: "Runs" }).getByRole("link").first().click();
  expect(await waitForFinalStatus(page)).toBe("Passed");
  await expect(stepsOf(page)).toHaveCount(16);
});

test("TC-RUN-15 queues one run for a double click", async ({ page }) => {
  const { api, moduleId } = await setUpDemoProject(page);
  const testFileId = await addTestFile(api, moduleId, "sign-in.yaml", fixture("pass/sign-in.yaml"));
  await page.goto(`/files/${testFileId}`);

  await page.getByRole("button", { name: "Run", exact: true }).dblclick();
  await expect(page.getByRole("status")).toHaveText("Run queued.");

  await page.reload();
  await expect(page.getByRole("region", { name: "Runs" }).getByRole("listitem")).toHaveCount(1);
  const { items } = await api<{ items: unknown[] }>("GET", `/runs?testFileId=${testFileId}`);
  expect(items).toHaveLength(1);
});

test("TC-RUN-16 finishes a queued run whose file was deleted", async ({ page }) => {
  const { api, moduleId } = await setUpDemoProject(page);
  const slowId = await addTestFile(api, moduleId, "slow.yaml", fixture("pass/slow.yaml"));
  const signInId = await addTestFile(api, moduleId, "sign-in.yaml", fixture("pass/sign-in.yaml"));
  await startRun(api, slowId);
  const runId = await startRun(api, signInId);
  expect((await api<{ status: string }>("GET", `/runs/${runId}`)).status).toBe("queued");

  await api("DELETE", `/test-files/${signInId}`);
  await page.goto(`/runs/${runId}`);

  expect(await waitForFinalStatus(page)).toBe("Passed");
  await expect(page.getByText("6/6 passed", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: /^Back to / })).toHaveCount(0);
});

test("TC-RUN-17 fails a dialog whose text is not the expected message", async ({ page }) => {
  expect(await runFixture(page, "fail/dialog-message.yaml", "dialog-message.yaml")).toBe("Failed");

  const steps = stepsOf(page);
  await expect(steps.nth(1)).toContainText('The dialog said "Profile saved", which does not contain "Profile deleted"');
  await expect(steps.nth(2)).toContainText("Pending");
});

test("TC-RUN-18 fails switchTab when no tab matches, without showing BASE", async ({ page }) => {
  expect(await runFixture(page, "fail/no-tab.yaml", "no-tab.yaml")).toBe("Failed");

  const step = stepsOf(page).nth(1);
  await expect(step).toContainText('No tab matched "**/extras/returns.html" within 3000ms');
  await expect(step).toContainText("{{BASE}}/extras/tabs.html");
  await expect(step).not.toContainText(DEMO_URL);
});

test("TC-RUN-19 fails back on the first page", async ({ page }) => {
  expect(await runFixture(page, "fail/no-history.yaml", "no-history.yaml")).toBe("Failed");

  const steps = stepsOf(page);
  await expect(steps.nth(1)).toContainText("There is no previous page to go back to");
  await expect(steps.nth(2)).toContainText("Pending");
});
