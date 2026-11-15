import { describe, expect, it, vi } from "vitest";
import { createApiClient } from "@/app/frontend/lib/api.js";
import { checkSession } from "@/app/frontend/lib/auth-guard.js";

const USER = { id: "user-1", email: "ada@example.com", createdAt: "2026-11-15T00:00:00.000Z" };
const json = (body: object, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function client(token: string | null, fetchImpl: typeof fetch) {
  const setToken = vi.fn();
  const onUnauthorized = vi.fn();
  const api = createApiClient({
    baseUrl: "http://localhost:4000/api/v1",
    getToken: () => token,
    setToken,
    onUnauthorized,
    fetchImpl,
  });
  return { api, setToken, onUnauthorized };
}

describe("checkSession", () => {
  it("is signed out without a token and sends no request", async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    const { api } = client(null, fetchImpl);

    await expect(checkSession(api)).resolves.toEqual({ kind: "signed-out" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("is signed in when GET /auth/me accepts the token", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async (url, init) => {
      expect(url).toBe("http://localhost:4000/api/v1/auth/me");
      expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer jwt-token");
      return json(USER, 200);
    });
    const { api, setToken } = client("jwt-token", fetchImpl);

    await expect(checkSession(api)).resolves.toEqual({ kind: "signed-in" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(setToken).not.toHaveBeenCalled();
  });

  it("clears a rejected token and is signed out, without the redirect to /login", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      json({ error: { code: "unauthorized", message: "No valid token" } }, 401),
    );
    const { api, setToken, onUnauthorized } = client("stale-token", fetchImpl);

    await expect(checkSession(api)).resolves.toEqual({ kind: "signed-out" });
    expect(setToken).toHaveBeenCalledWith(null);
    expect(onUnauthorized).not.toHaveBeenCalled();
  });

  it("keeps the token and returns the network message when the server cannot be reached", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => {
      throw new TypeError("fetch failed");
    });
    const { api, setToken } = client("jwt-token", fetchImpl);

    await expect(checkSession(api)).resolves.toEqual({
      kind: "unknown",
      message: "Cannot reach the server. Check your connection and try again.",
    });
    expect(setToken).not.toHaveBeenCalled();
  });

  it("keeps the token and returns the plain server message on a server error", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      json({ error: { code: "internal", message: "Internal server error" } }, 500),
    );
    const { api, setToken } = client("jwt-token", fetchImpl);

    await expect(checkSession(api)).resolves.toEqual({
      kind: "unknown",
      message: "Something went wrong on the server. Try again in a moment.",
    });
    expect(setToken).not.toHaveBeenCalled();
  });
});
