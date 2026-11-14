import type { Page } from "@playwright/test";

// Setup for the E2E tests (docs/tech/e2e.md 3.1): preconditions go through the REST API, the case under test through the UI.

export const API_URL = "http://127.0.0.1:4000/api/v1";
export const DEMO_URL = "http://127.0.0.1:8080";
export const PASSWORD = "e2e-password-123";
export const SWAG_PASSWORD = process.env.SWAG_PASSWORD ?? "secret_sauce";

type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
export type Api = <T = unknown>(method: Method, path: string, body?: unknown, status?: number) => Promise<T>;
export type Account = { email: string; token: string; api: Api };
export type DemoProject = Account & { projectId: string; moduleId: string };

export function uniqueEmail(): string {
  throw new Error("Not implemented");
}

export function fixture(path: string): string {
  throw new Error(`Not implemented: ${path}`);
}

export async function signUp(page: Page): Promise<Account> {
  throw new Error(`Not implemented: ${page.url()}`);
}

export async function createWorkspace(api: Api): Promise<{ projectId: string; moduleId: string }> {
  throw new Error(`Not implemented: ${typeof api}`);
}

export async function setDemoVariables(api: Api, projectId: string): Promise<void> {
  throw new Error(`Not implemented: ${projectId}`);
}

export async function setUpDemoProject(page: Page): Promise<DemoProject> {
  throw new Error(`Not implemented: ${page.url()}`);
}

export async function addTestFile(api: Api, moduleId: string, name: string, source: string): Promise<string> {
  throw new Error(`Not implemented: ${moduleId} ${name} ${source.length}`);
}

export async function startRun(api: Api, testFileId: string): Promise<string> {
  throw new Error(`Not implemented: ${testFileId}`);
}

export async function runToEnd(api: Api, testFileId: string): Promise<string> {
  throw new Error(`Not implemented: ${typeof api} ${testFileId}`);
}

export async function waitForFinalStatus(page: Page): Promise<"Passed" | "Failed"> {
  throw new Error(`Not implemented: ${page.url()}`);
}

export async function runFromEditor(page: Page, testFileId: string): Promise<"Passed" | "Failed"> {
  throw new Error(`Not implemented: ${page.url()} ${testFileId}`);
}
