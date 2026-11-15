import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  addTestFile,
  API_URL,
  DEMO_URL,
  editorOf,
  fixture,
  problemItemsOf,
  runFromEditor,
  setUpDemoProject,
  sidebarOf,
  sourceOf,
  startRun,
  waitForFinalStatus,
} from "./support.js";

type LiveMessage = { type: string; run?: { status: string }; step?: { index: number; status: string } };

function stepsOf(page: Page): Locator {
  return page.getByRole("list", { name: "Steps" }).getByRole("listitem");
}

// Records the Live Progress messages of each socket the page opens, to check the transitions the page shows. The
// Output console and the Run details each follow a Run with their own socket.
function recordLiveMessages(page: Page): LiveMessage[][] {
  const sockets: LiveMessage[][] = [];
  page.on("websocket", (socket) => {
    if (!socket.url().includes("/live")) return;
    const messages: LiveMessage[] = [];
    sockets.push(messages);
    socket.on("framereceived", ({ payload }) => {
      messages.push(JSON.parse(String(payload)) as LiveMessage);
    });
  });
  return sockets;
}

function stepStatuses(messages: LiveMessage[], index: number): string[] {
  return messages.flatMap((m) => (m.type === "step" && m.step?.index === index ? [m.step.status] : []));
}

async function runFixture(page: Page, path: string, name: string): Promise<"Passed" | "Failed"> {
  const { api, folder } = await setUpDemoProject(page);
  const testFileId = await addTestFile(api, folder, name, fixture(path));
  return runFromEditor(page, testFileId);
}

test("TC-RUN-01 runs a passing test and watches it live in the Output console", async ({ page }) => {
  const { api, folder } = await setUpDemoProject(page);
  const testFileId = await addTestFile(api, folder, "sign-in.yaml", fixture("pass/sign-in.yaml"));
  await page.goto(`/files/${testFileId}`);
  const { run, state, output } = editorOf(page);
  const runs = output.getByRole("region", { name: "Runs" });
  await expect(runs.getByText("No runs yet")).toBeVisible();
  let navigations = 0;
  page.on("framenavigated", (frame) => {
    if (frame === page.mainFrame()) navigations += 1;
  });

  await run.click();
  await expect(runs.getByRole("listitem")).toHaveCount(1);
  await expect(page.getByText("Run queued.")).toHaveCount(0);

  // The console follows the Run live: its status, "n/m passed" and a step list.
  await expect(output.getByText("6/6 passed", { exact: true })).toBeVisible({ timeout: 60_000 });
  await expect(state).toHaveText("Passed");
  const progress = output.getByRole("list", { name: "Progress" }).getByRole("listitem");
  await expect(progress).toHaveCount(6);
  for (let i = 0; i < 6; i += 1) await expect(progress.nth(i)).toContainText("Passed");
  expect(navigations).toBe(0);
  await expect(runs.getByRole("listitem").first()).toContainText(/^Passed · /);

  const dot = sidebarOf(page).getByRole("link", { name: "sign-in.yaml", exact: true }).locator("[data-status]");
  await expect(dot).toHaveAttribute("data-status", "passed");
  await expect(dot).toHaveAttribute("title", "Passed");

  await output.getByRole("button", { name: "Open run details", exact: true }).click();
  const details = page.getByRole("dialog", { name: "sign-in.yaml", exact: true });
  await expect(details.getByText("Status: Passed", { exact: true })).toBeVisible();
  const steps = details.getByRole("list", { name: "Steps" }).getByRole("listitem");
  await expect(steps).toHaveCount(6);
  for (const i of [1, 2, 3]) await expect(steps.nth(i)).toContainText("selector");
  expect(navigations).toBe(0);
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
  const { api, folder } = await setUpDemoProject(page);
  const slowId = await addTestFile(api, folder, "slow.yaml", fixture("pass/slow.yaml"));
  const signInId = await addTestFile(api, folder, "sign-in.yaml", fixture("pass/sign-in.yaml"));
  const sockets = recordLiveMessages(page);

  const slowRunId = await startRun(api, slowId);
  await page.goto(`/files/${signInId}`);
  await editorOf(page).run.click();
  await editorOf(page).output.getByRole("button", { name: "Open run details", exact: true }).click();

  await expect(page.getByText("Status: Queued", { exact: true })).toBeVisible();
  await expect(page.getByText("Status: Running", { exact: true })).toBeVisible({ timeout: 30_000 });
  expect(await waitForFinalStatus(page)).toBe("Passed");

  // Every socket that followed the Run saw each transition once, in order.
  expect(sockets.length).toBeGreaterThan(0);
  for (const messages of sockets) {
    const runStatuses = messages.flatMap((m) => (m.type === "status" && m.run ? [m.run.status] : []));
    expect(runStatuses).toEqual(["running", "passed"]);
    for (let i = 0; i < 6; i += 1) expect(stepStatuses(messages, i)).toEqual(["running", "passed"]);
  }
  expect((await api<{ status: string }>("GET", `/runs/${slowRunId}`)).status).toBe("passed");
});

test("TC-RUN-08 shows the steps done so far to a page opened late", async ({ page }) => {
  const { api, folder, token } = await setUpDemoProject(page);
  const testFileId = await addTestFile(api, folder, "slow.yaml", fixture("pass/slow.yaml"));
  await page.goto(`/files/${testFileId}`);
  await editorOf(page).run.click();
  const history = editorOf(page).output.getByRole("region", { name: "Runs" }).getByRole("link");
  await expect(history).toHaveCount(1);
  // Open the Run page late: once step 1 is done (its screenshot is written when it finishes), during the 8 s sleep.
  const runId = (await history.getAttribute("href"))!.split("/").pop()!;
  await expect
    .poll(async () =>
      (await page.request.get(`${API_URL}/runs/${runId}/files/screenshots/step-0.png?token=${token}`)).status(),
    )
    .toBe(200);

  await page.goto(`/runs/${runId}`);
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
  const { api, folder } = await setUpDemoProject(page);
  const testFileId = await addTestFile(api, folder, "invalid.yaml", fixture("invalid/multiple-errors.yaml"));
  await page.goto(`/files/${testFileId}`);

  const { debug, output } = editorOf(page);
  const debugToggle = debug.getByRole("button", { name: "Debug console", exact: true });
  await expect(problemItemsOf(page)).toHaveCount(7);
  await debugToggle.click();

  await editorOf(page).run.click();

  await expect(output.getByRole("alert")).toBeVisible();
  await expect(debugToggle).toHaveAttribute("aria-expanded", "true");
  await expect(problemItemsOf(page)).toHaveCount(7);
  await expect(output.getByRole("region", { name: "Runs" }).getByText("No runs yet")).toBeVisible();
});

test("TC-RUN-12 saves unsaved changes before running them", async ({ page }) => {
  const { api, folder } = await setUpDemoProject(page);
  const testFileId = await addTestFile(api, folder, "flow.yaml", fixture("pass/locked-out.yaml"));
  await page.goto(`/files/${testFileId}`);
  const { source, run, output } = editorOf(page);

  await source.fill(fixture("pass/checkout.yaml"));
  await run.click();
  await expect(output.getByRole("region", { name: "Runs" }).getByRole("listitem")).toHaveCount(1);

  await page.reload();
  await expect.poll(() => sourceOf(page)).toBe(fixture("pass/checkout.yaml"));
  await output.getByRole("region", { name: "Runs" }).getByRole("link").first().click();
  expect(await waitForFinalStatus(page)).toBe("Passed");
  await expect(stepsOf(page)).toHaveCount(16);
});

test("TC-RUN-15 queues one run for a double click", async ({ page }) => {
  const { api, folder } = await setUpDemoProject(page);
  const testFileId = await addTestFile(api, folder, "sign-in.yaml", fixture("pass/sign-in.yaml"));
  await page.goto(`/files/${testFileId}`);

  await editorOf(page).run.dblclick();
  await expect(editorOf(page).output.getByRole("button", { name: "Open run details" })).toBeVisible();

  await page.reload();
  await expect(page.getByRole("region", { name: "Runs" }).getByRole("listitem")).toHaveCount(1);
  const { items } = await api<{ items: unknown[] }>("GET", `/runs?testFileId=${testFileId}`);
  expect(items).toHaveLength(1);
  const dot = sidebarOf(page).getByRole("link", { name: "sign-in.yaml", exact: true }).locator("[data-status]");
  await expect(dot).toHaveAttribute("data-status", "passed", { timeout: 60_000 });
});

test("TC-RUN-16 finishes a queued run whose file was deleted", async ({ page }) => {
  const { api, folder } = await setUpDemoProject(page);
  const slowId = await addTestFile(api, folder, "slow.yaml", fixture("pass/slow.yaml"));
  const signInId = await addTestFile(api, folder, "sign-in.yaml", fixture("pass/sign-in.yaml"));
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
