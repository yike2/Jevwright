import { describe, expect, it, vi } from "vitest";

import {
  createApiClient,
  type CreateModuleResponse,
  type CreateProjectResponse,
  type CreateTestFileResponse,
  type Run,
  type TestFile,
  type UpdateTestFileResponse,
  type ValidateResponse,
  type VariableListResponse,
  type TreeResponse,
} from "@/app/frontend/lib/api.js";

function makeResponse(body: string | object | undefined, status: number, headers: Record<string, string> = {}) {
  return new Response(typeof body === "string" ? body : JSON.stringify(body ?? null), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
  });
}

describe("api client", () => {
  it("sends Authorization: Bearer jwt-token when a token exists", async () => {
    let capturedHeaders: Headers | undefined;
    const fetchImpl = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      capturedHeaders = new Headers(init?.headers ?? {});
      return makeResponse({ ok: true }, 200);
    });

    const client = createApiClient({
      baseUrl: "http://localhost:4000/api/v1",
      getToken: () => "jwt-token",
      setToken: () => undefined,
      fetchImpl,
    });

    await client.request("/health");

    expect(capturedHeaders?.get("Authorization")).toBe("Bearer jwt-token");
  });

  it("omits the Authorization header when there is no token", async () => {
    let capturedHeaders: Headers | undefined;
    const fetchImpl = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      capturedHeaders = new Headers(init?.headers ?? {});
      return makeResponse({ ok: true }, 200);
    });

    const client = createApiClient({
      baseUrl: "http://localhost:4000/api/v1",
      getToken: () => null,
      setToken: () => undefined,
      fetchImpl,
    });

    await client.request("/health");

    expect(capturedHeaders?.has("Authorization")).toBe(false);
  });

  it("stores the token and resolves the login body when POST /auth/login succeeds", async () => {
    const user = {
      id: "user-1",
      email: "test@example.com",
      createdAt: "2026-01-01T00:00:00.000Z",
    };
    const setToken = vi.fn();
    const fetchImpl = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.method).toBe("POST");
      return makeResponse({ token: "jwt-token", user }, 200);
    });

    const client = createApiClient({
      baseUrl: "http://localhost:4000/api/v1",
      getToken: () => null,
      setToken,
      fetchImpl,
    });

    await expect(client.login("test@example.com", "password")).resolves.toEqual({ token: "jwt-token", user });
    expect(setToken).toHaveBeenCalledTimes(1);
    expect(setToken).toHaveBeenCalledWith("jwt-token");
  });

  it("handles a 401 on GET /auth/me by clearing the token and calling onUnauthorized", async () => {
    const setToken = vi.fn();
    const onUnauthorized = vi.fn();
    const fetchImpl = vi.fn(async () =>
      makeResponse({ error: { code: "unauthorized", message: "No valid token" } }, 401),
    );

    const client = createApiClient({
      baseUrl: "http://localhost:4000/api/v1",
      getToken: () => "jwt-token",
      setToken,
      onUnauthorized,
      fetchImpl,
    });

    await expect(client.getCurrentUser()).rejects.toMatchObject({
      status: 401,
      code: "unauthorized",
      message: "No valid token",
    });

    expect(setToken).toHaveBeenCalledTimes(1);
    expect(setToken).toHaveBeenCalledWith(null);
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });

  it("does not clear the token on a 401 from POST /auth/login", async () => {
    const setToken = vi.fn();
    const onUnauthorized = vi.fn();
    const fetchImpl = vi.fn(async () =>
      makeResponse({ error: { code: "unauthorized", message: "Wrong email or password" } }, 401),
    );

    const client = createApiClient({
      baseUrl: "http://localhost:4000/api/v1",
      getToken: () => "jwt-token",
      setToken,
      onUnauthorized,
      fetchImpl,
    });

    await expect(client.login("test@example.com", "wrong")).rejects.toMatchObject({
      status: 401,
      code: "unauthorized",
      message: "Wrong email or password",
    });

    expect(setToken).not.toHaveBeenCalled();
    expect(onUnauthorized).not.toHaveBeenCalled();
  });

  it("keeps the HTTP status but converts an unknown code to internal", async () => {
    const fetchImpl = vi.fn(async () =>
      makeResponse({ error: { code: "brand_new_code", message: "Some unknown backend error" } }, 409),
    );

    const client = createApiClient({
      baseUrl: "http://localhost:4000/api/v1",
      getToken: () => null,
      setToken: () => undefined,
      fetchImpl,
    });

    await expect(client.request("/test")).rejects.toMatchObject({
      status: 409,
      code: "internal",
      message: "Some unknown backend error",
    });
  });

  it("keeps 422 details as the Diagnostic[] it received", async () => {
    const details = [{ code: "E003", message: 'Missing required field "url"', line: 4 }];
    const fetchImpl = vi.fn(async () =>
      makeResponse(
        {
          error: {
            code: "invalid_test",
            message: "The Test File has diagnostics",
            details,
          },
        },
        422,
      ),
    );

    const client = createApiClient({
      baseUrl: "http://localhost:4000/api/v1",
      getToken: () => null,
      setToken: () => undefined,
      fetchImpl,
    });

    await expect(client.request("/runs/1")).rejects.toMatchObject({
      status: 422,
      code: "invalid_test",
      message: "The Test File has diagnostics",
      details,
    });
  });

  it("converts a 502 HTML response to ApiError with code internal", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response("<html><body>Bad Gateway</body></html>", {
          status: 502,
          headers: { "Content-Type": "text/html" },
        }),
    );

    const client = createApiClient({
      baseUrl: "http://localhost:4000/api/v1",
      getToken: () => null,
      setToken: () => undefined,
      fetchImpl,
    });

    await expect(client.request("/health")).rejects.toMatchObject({
      status: 502,
      code: "internal",
      message: "Internal server error",
    });
  });

  it("resolves a 204 response to undefined", async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 204 }));
    const client = createApiClient({
      baseUrl: "http://localhost:4000/api/v1",
      getToken: () => null,
      setToken: () => undefined,
      fetchImpl,
    });

    await expect(client.request("/delete")).resolves.toBeUndefined();
  });

  it("sends GET /tree with Bearer token and returns the parsed tree body", async () => {
    const tree: TreeResponse = {
      items: [
        {
          id: "project-1",
          name: "Demo Shop",
          createdAt: "2026-11-13T00:00:00.000Z",
          updatedAt: "2026-11-13T00:00:00.000Z",
          modules: [
            {
              id: "module-1",
              projectId: "project-1",
              name: "Auth",
              createdAt: "2026-11-13T00:00:00.000Z",
              updatedAt: "2026-11-13T00:00:00.000Z",
              testFiles: [
                {
                  id: "test-file-1",
                  moduleId: "module-1",
                  name: "login.yaml",
                  createdAt: "2026-11-13T00:00:00.000Z",
                  updatedAt: "2026-11-13T00:00:00.000Z",
                  latestRun: null,
                },
              ],
            },
          ],
        },
      ],
    };

    const fetchImpl = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      expect(url).toBe("http://localhost:4000/api/v1/tree");
      expect(init?.method ?? "GET").toBe("GET");
      const headers = new Headers(init?.headers ?? {});
      expect(headers.get("Authorization")).toBe("Bearer jwt-token");
      return makeResponse(tree, 200);
    });

    const client = createApiClient({
      baseUrl: "http://localhost:4000/api/v1",
      getToken: () => "jwt-token",
      setToken: () => undefined,
      fetchImpl,
    });

    await expect(client.getTree()).resolves.toEqual(tree);
  });

  it('sends POST /projects with body {"name":"Demo Shop"} and returns the created project', async () => {
    const project: CreateProjectResponse = {
      id: "project-1",
      name: "Demo Shop",
      createdAt: "2026-11-13T00:00:00.000Z",
      updatedAt: "2026-11-13T00:00:00.000Z",
    };

    const fetchImpl = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      expect(url).toBe("http://localhost:4000/api/v1/projects");
      expect(init?.method).toBe("POST");
      const headers = new Headers(init?.headers ?? {});
      expect(headers.get("Authorization")).toBe("Bearer jwt-token");
      expect(headers.get("Content-Type")).toBe("application/json");
      expect(init?.body).toBe('{"name":"Demo Shop"}');
      return makeResponse(project, 201);
    });

    const client = createApiClient({
      baseUrl: "http://localhost:4000/api/v1",
      getToken: () => "jwt-token",
      setToken: () => undefined,
      fetchImpl,
    });

    await expect(client.createProject("Demo Shop")).resolves.toEqual(project);
  });

  it('sends POST /projects/p1/modules with body {"name":"Auth"} and returns the created module', async () => {
    const createdModule: CreateModuleResponse = {
      id: "module-1",
      projectId: "p1",
      name: "Auth",
      createdAt: "2026-11-13T00:00:00.000Z",
      updatedAt: "2026-11-13T00:00:00.000Z",
    };

    const fetchImpl = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      expect(url).toBe("http://localhost:4000/api/v1/projects/p1/modules");
      expect(init?.method).toBe("POST");
      const headers = new Headers(init?.headers ?? {});
      expect(headers.get("Authorization")).toBe("Bearer jwt-token");
      expect(headers.get("Content-Type")).toBe("application/json");
      expect(init?.body).toBe('{"name":"Auth"}');
      return makeResponse(createdModule, 201);
    });

    const client = createApiClient({
      baseUrl: "http://localhost:4000/api/v1",
      getToken: () => "jwt-token",
      setToken: () => undefined,
      fetchImpl,
    });

    await expect(client.createModule("p1", "Auth")).resolves.toEqual(createdModule);
  });

  it('sends POST /modules/m1/test-files with body {"name":"login.yaml","source":"name: x\\n"} and returns the created test file', async () => {
    const testFile: CreateTestFileResponse = {
      testFile: {
        id: "test-file-1",
        moduleId: "m1",
        name: "login.yaml",
        source: "name: x\n",
        createdAt: "2026-11-13T00:00:00.000Z",
        updatedAt: "2026-11-13T00:00:00.000Z",
      },
      diagnostics: [],
    };

    const fetchImpl = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      expect(url).toBe("http://localhost:4000/api/v1/modules/m1/test-files");
      expect(init?.method).toBe("POST");
      const headers = new Headers(init?.headers ?? {});
      expect(headers.get("Authorization")).toBe("Bearer jwt-token");
      expect(headers.get("Content-Type")).toBe("application/json");
      expect(init?.body).toBe('{"name":"login.yaml","source":"name: x\\n"}');
      return makeResponse(testFile, 201);
    });

    const client = createApiClient({
      baseUrl: "http://localhost:4000/api/v1",
      getToken: () => "jwt-token",
      setToken: () => undefined,
      fetchImpl,
    });

    await expect(client.createTestFile("m1", "login.yaml", "name: x\n")).resolves.toEqual(testFile);
  });

  it("rejects createProject with ApiError status 409 code conflict and backend message", async () => {
    const fetchImpl = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      expect(url).toBe("http://localhost:4000/api/v1/projects");
      expect(init?.method).toBe("POST");
      const headers = new Headers(init?.headers ?? {});
      expect(headers.get("Content-Type")).toBe("application/json");
      expect(init?.body).toBe('{"name":"Demo Shop"}');
      return makeResponse({ error: { code: "conflict", message: "Project name already exists" } }, 409);
    });

    const client = createApiClient({
      baseUrl: "http://localhost:4000/api/v1",
      getToken: () => "jwt-token",
      setToken: () => undefined,
      fetchImpl,
    });

    await expect(client.createProject("Demo Shop")).rejects.toMatchObject({
      status: 409,
      code: "conflict",
      message: "Project name already exists",
    });
  });

  it("sends GET /test-files/tf-1 and resolves the Test File", async () => {
    const testFile: TestFile = {
      id: "tf-1",
      moduleId: "m-1",
      name: "login.yaml",
      source: 'name: login\nsteps:\n  - open:\n      url: "https://example.com"\n',
      createdAt: "2026-11-13T00:00:00.000Z",
      updatedAt: "2026-11-13T00:00:00.000Z",
    };

    const fetchImpl = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      expect(url).toBe("http://localhost:4000/api/v1/test-files/tf-1");
      expect(init?.method ?? "GET").toBe("GET");
      const headers = new Headers(init?.headers ?? {});
      expect(headers.get("Authorization")).toBe("Bearer jwt-token");
      return makeResponse(testFile, 200);
    });

    const client = createApiClient({
      baseUrl: "http://localhost:4000/api/v1",
      getToken: () => "jwt-token",
      setToken: () => undefined,
      fetchImpl,
    });

    await expect(client.getTestFile("tf-1")).resolves.toEqual(testFile);
  });

  it("sends PATCH /test-files/tf-1 with the source and resolves { testFile, diagnostics }", async () => {
    const testFile: TestFile = {
      id: "tf-1",
      moduleId: "m-1",
      name: "login.yaml",
      source: "name: x",
      createdAt: "2026-11-13T00:00:00.000Z",
      updatedAt: "2026-11-13T00:00:00.000Z",
    };
    const updated: UpdateTestFileResponse = {
      testFile,
      diagnostics: [],
    };

    const fetchImpl = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      expect(url).toBe("http://localhost:4000/api/v1/test-files/tf-1");
      expect(init?.method).toBe("PATCH");
      const headers = new Headers(init?.headers ?? {});
      expect(headers.get("Authorization")).toBe("Bearer jwt-token");
      expect(headers.get("Content-Type")).toBe("application/json");
      expect(init?.body).toBe('{"source":"name: x"}');
      return makeResponse(updated, 200);
    });

    const client = createApiClient({
      baseUrl: "http://localhost:4000/api/v1",
      getToken: () => "jwt-token",
      setToken: () => undefined,
      fetchImpl,
    });

    await expect(client.updateTestFile("tf-1", "name: x")).resolves.toEqual(updated);
  });

  it("sends POST /test-files/validate and resolves the diagnostics", async () => {
    const response: ValidateResponse = {
      diagnostics: [{ code: "E005", message: 'Unknown action "aiAct"', line: 3 }],
    };

    const fetchImpl = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      expect(url).toBe("http://localhost:4000/api/v1/test-files/validate");
      expect(init?.method).toBe("POST");
      const headers = new Headers(init?.headers ?? {});
      expect(headers.get("Authorization")).toBe("Bearer jwt-token");
      expect(headers.get("Content-Type")).toBe("application/json");
      expect(init?.body).toBe('{"source":"bad"}');
      return makeResponse(response, 200);
    });

    const client = createApiClient({
      baseUrl: "http://localhost:4000/api/v1",
      getToken: () => "jwt-token",
      setToken: () => undefined,
      fetchImpl,
    });

    await expect(client.validateSource("bad")).resolves.toEqual(response);
  });

  it("sends POST /test-files/tf-1/runs and resolves the Run on 202", async () => {
    const run: Run = {
      id: "run-1",
      testFileId: "tf-1",
      projectId: "p-1",
      moduleId: "m-1",
      fileName: "login.yaml",
      name: "login",
      status: "queued",
      createdAt: "2026-11-13T00:00:00.000Z",
      startedAt: null,
      finishedAt: null,
      durationMs: null,
      summary: {
        total: 1,
        passed: 0,
        failed: 0,
        pending: 1,
      },
      error: null,
    };

    const fetchImpl = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      expect(url).toBe("http://localhost:4000/api/v1/test-files/tf-1/runs");
      expect(init?.method).toBe("POST");
      const headers = new Headers(init?.headers ?? {});
      expect(headers.get("Authorization")).toBe("Bearer jwt-token");
      return makeResponse(run, 202);
    });

    const client = createApiClient({
      baseUrl: "http://localhost:4000/api/v1",
      getToken: () => "jwt-token",
      setToken: () => undefined,
      fetchImpl,
    });

    await expect(client.startRun("tf-1")).resolves.toEqual(run);
  });

  it("rejects startRun with ApiError 422 and the diagnostics as details", async () => {
    const fetchImpl = vi.fn(async () =>
      makeResponse(
        {
          error: {
            code: "invalid_test",
            message: "Test file has errors",
            details: [{ code: "E005", message: 'Unknown action "aiAct"', line: 3 }],
          },
        },
        422,
      ),
    );

    const client = createApiClient({
      baseUrl: "http://localhost:4000/api/v1",
      getToken: () => "jwt-token",
      setToken: () => undefined,
      fetchImpl,
    });

    await expect(client.startRun("tf-1")).rejects.toMatchObject({
      status: 422,
      code: "invalid_test",
      message: "Test file has errors",
      details: [{ code: "E005", message: 'Unknown action "aiAct"', line: 3 }],
    });
  });

  it("sends GET /projects/p-1/variables and resolves the names", async () => {
    const response: VariableListResponse = { items: ["BASE", "SWAG_PASSWORD"] };

    const fetchImpl = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      expect(url).toBe("http://localhost:4000/api/v1/projects/p-1/variables");
      expect(init?.method ?? "GET").toBe("GET");
      const headers = new Headers(init?.headers ?? {});
      expect(headers.get("Authorization")).toBe("Bearer jwt-token");
      return makeResponse(response, 200);
    });

    const client = createApiClient({
      baseUrl: "http://localhost:4000/api/v1",
      getToken: () => "jwt-token",
      setToken: () => undefined,
      fetchImpl,
    });

    await expect(client.listVariables("p-1")).resolves.toEqual(response);
  });

  it("sends PUT /projects/p-1/variables/BASE with the value and resolves undefined on 204", async () => {
    const fetchImpl = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      expect(url).toBe("http://localhost:4000/api/v1/projects/p-1/variables/BASE");
      expect(init?.method).toBe("PUT");
      const headers = new Headers(init?.headers ?? {});
      expect(headers.get("Authorization")).toBe("Bearer jwt-token");
      expect(headers.get("Content-Type")).toBe("application/json");
      expect(init?.body).toBe('{"value":"https://demo.example.com"}');
      return new Response(null, { status: 204 });
    });

    const client = createApiClient({
      baseUrl: "http://localhost:4000/api/v1",
      getToken: () => "jwt-token",
      setToken: () => undefined,
      fetchImpl,
    });

    await expect(client.setVariable("p-1", "BASE", "https://demo.example.com")).resolves.toBeUndefined();
  });

  it("sends DELETE /projects/p-1/variables/BASE and resolves undefined on 204", async () => {
    const fetchImpl = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      expect(url).toBe("http://localhost:4000/api/v1/projects/p-1/variables/BASE");
      expect(init?.method).toBe("DELETE");
      const headers = new Headers(init?.headers ?? {});
      expect(headers.get("Authorization")).toBe("Bearer jwt-token");
      return new Response(null, { status: 204 });
    });

    const client = createApiClient({
      baseUrl: "http://localhost:4000/api/v1",
      getToken: () => "jwt-token",
      setToken: () => undefined,
      fetchImpl,
    });

    await expect(client.deleteVariable("p-1", "BASE")).resolves.toBeUndefined();
  });
});
