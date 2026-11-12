import { describe, expect, it, vi } from "vitest";

import { createApiClient } from "@/app/frontend/lib/api.js";

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
});
