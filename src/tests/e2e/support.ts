import { readFileSync } from "node:fs";
import { expect, type Locator, type Page } from "@playwright/test";

// Setup for the E2E tests (docs/tech/e2e.md 3.1): preconditions go through the REST API, the case under test through the UI.

export const API_URL = "http://127.0.0.1:4000/api/v1";
export const DEMO_URL = "http://127.0.0.1:8080";
export const PASSWORD = "e2e-password-123";
export const SWAG_PASSWORD = process.env.SWAG_PASSWORD ?? "secret_sauce";
// The files overview, the workspace's home; the landing page is at / (frontend.md 1.6).
export const WORKSPACE = "/files";
export const QUICK_START = "Quick Start";

const FIXTURES = new URL("./fixtures/", import.meta.url);
const FINAL_STATUS_TIMEOUT_MS = 60_000;
// The status each request answers when it succeeds, unless a call names another.
const OK_STATUS = { GET: 200, POST: 201, PUT: 204, PATCH: 200, DELETE: 204 } as const;

type Method = keyof typeof OK_STATUS;
export type Api = <T = unknown>(method: Method, path: string, body?: unknown, status?: number) => Promise<T>;
export type Account = { email: string; token: string; api: Api };
export type DemoProject = Account & { projectId: string; moduleId: string };

/** The page's own alerts; Next.js adds a hidden route announcer that also has role="alert". */
export function alertsOf(page: Page): Locator {
  return page.getByRole("alert").and(page.locator(":not(#__next-route-announcer__)"));
}

export function uniqueEmail(): string {
  return `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
}

export function fixture(path: string): string {
  return readFileSync(new URL(path, FIXTURES), "utf8");
}

/**
 * Registers a new account through the API and stores its token in the app. Every account starts with the Quick Start
 * project (backend.md 1.10); it is deleted unless `quickStart` is set, so a case starts from an empty workspace.
 */
export async function signUp(page: Page, options: { quickStart?: boolean } = {}): Promise<Account> {
  const email = uniqueEmail();
  const response = await page.request.post(`${API_URL}/auth/register`, { data: { email, password: PASSWORD } });
  expect(response.status(), await response.text()).toBe(201);
  const { token } = (await response.json()) as { token: string };

  // The app reads the token from localStorage, which exists only once a page of its origin is open.
  await page.goto("/login");
  await page.evaluate((value) => window.localStorage.setItem("auth-token", value), token);

  const api: Api = async <T>(method: Method, path: string, body?: unknown, status: number = OK_STATUS[method]) => {
    const reply = await page.request.fetch(`${API_URL}${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}` },
      data: body,
    });
    expect(reply.status(), `${method} ${path}: ${await reply.text()}`).toBe(status);
    return (reply.status() === 204 ? undefined : await reply.json()) as T;
  };
  if (!options.quickStart) {
    const tree = await api<{ items: { id: string; name: string }[] }>("GET", "/tree");
    const quickStart = tree.items.find((project) => project.name === QUICK_START);
    expect(quickStart, "a new account has the Quick Start project").toBeDefined();
    await api("DELETE", `/projects/${quickStart!.id}`);
  }
  return { email, token, api };
}

export async function createWorkspace(api: Api): Promise<{ projectId: string; moduleId: string }> {
  const project = await api<{ id: string }>("POST", "/projects", { name: "Demo Shop" });
  const module = await api<{ id: string }>("POST", `/projects/${project.id}/modules`, { name: "Shopping" });
  return { projectId: project.id, moduleId: module.id };
}

export async function setDemoVariables(api: Api, projectId: string): Promise<void> {
  await api("PUT", `/projects/${projectId}/variables/BASE`, { value: DEMO_URL });
  await api("PUT", `/projects/${projectId}/variables/SWAG_PASSWORD`, { value: SWAG_PASSWORD });
}

export async function setUpDemoProject(page: Page): Promise<DemoProject> {
  const account = await signUp(page);
  const ids = await createWorkspace(account.api);
  await setDemoVariables(account.api, ids.projectId);
  return { ...account, ...ids };
}

export async function addTestFile(api: Api, moduleId: string, name: string, source: string): Promise<string> {
  const { testFile } = await api<{ testFile: { id: string } }>("POST", `/modules/${moduleId}/test-files`, {
    name,
    source,
  });
  return testFile.id;
}

export async function startRun(api: Api, testFileId: string): Promise<string> {
  const run = await api<{ id: string }>("POST", `/test-files/${testFileId}/runs`, undefined, 202);
  return run.id;
}

export async function runToEnd(api: Api, testFileId: string): Promise<string> {
  const runId = await startRun(api, testFileId);
  await expect
    .poll(async () => (await api<{ status: string }>("GET", `/runs/${runId}`)).status, {
      timeout: FINAL_STATUS_TIMEOUT_MS,
    })
    .toMatch(/^(passed|failed)$/);
  return runId;
}

export async function waitForFinalStatus(page: Page): Promise<"Passed" | "Failed"> {
  const status = page.getByText(/^Status: (Passed|Failed)$/);
  await expect(status).toBeVisible({ timeout: FINAL_STATUS_TIMEOUT_MS });
  return (await status.textContent()) === "Status: Passed" ? "Passed" : "Failed";
}

export function sidebarOf(page: Page): Locator {
  return page.getByRole("navigation", { name: "Projects", exact: true });
}

/** Clicks a sidebar "New …" button, types the name into the row it adds, and presses Enter; returns the input. */
export async function createInSidebar(page: Page, opener: string, name: string): Promise<Locator> {
  const sidebar = sidebarOf(page);
  await sidebar.getByRole("button", { name: opener, exact: true }).click();
  const input = sidebar.getByRole("textbox", { name: "Name", exact: true });
  await input.fill(name);
  await input.press("Enter");
  return input;
}

export type Editor = {
  source: Locator;
  state: Locator;
  save: Locator;
  run: Locator;
  debug: Locator;
  output: Locator;
  statusBar: Locator;
};

export function editorOf(page: Page): Editor {
  return {
    source: page.getByRole("textbox", { name: "Test file YAML", exact: true }),
    state: page.getByRole("status", { name: "File state", exact: true }),
    save: page.getByRole("button", { name: "Save", exact: true }),
    run: page.getByRole("button", { name: "Run", exact: true }),
    debug: page.getByRole("region", { name: "Debug", exact: true }),
    output: page.getByRole("region", { name: "Output", exact: true }),
    statusBar: page.getByRole("region", { name: "Status bar", exact: true }),
  };
}

/**
 * The editor's whole text, or null before the editor is on the page. CodeMirror renders only the lines in view, so
 * this reads its document through the view CodeMirror 6 (6.43) keeps on the content element, the way its own
 * `EditorView.findFromDOM` finds it.
 */
export async function sourceOf(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    type Tile = { root?: { view?: { state: { doc: { toString(): string } } } } };
    const content = document.querySelector(".cm-content") as (Element & { cmTile?: Tile }) | null;
    const view = content?.cmTile?.root?.view;
    return view ? view.state.doc.toString() : null;
  });
}

/** The diagnostics the Debug console lists, as "Line <n>: <message>". */
export function problemItemsOf(page: Page): Locator {
  return editorOf(page).debug.getByRole("listitem").getByRole("button");
}

/** Opens the editor, clicks Run, opens the new Run's details full page, and waits for its final status (S5). */
export async function runFromEditor(page: Page, testFileId: string): Promise<"Passed" | "Failed"> {
  await page.goto(`/files/${testFileId}`);
  await editorOf(page).run.click();
  await editorOf(page).output.getByRole("button", { name: "Open run details", exact: true }).click();
  await page.getByRole("dialog").getByRole("link", { name: "Open full page", exact: true }).click();
  await expect(page).toHaveURL(/\/runs\/[^/]+$/);
  return waitForFinalStatus(page);
}
