import { ApiError, type createApiClient, type User } from "./api.js";
import { errorText } from "./format-error.js";

export type Session = { kind: "signed-in" } | { kind: "signed-out" } | { kind: "unknown"; message: string };

/**
 * Whether the stored token is one the backend accepts (frontend.md 1.5), for the auth pages' guard. A rejected token
 * is cleared; any other failure leaves it and returns the message to show.
 */
export async function checkSession(client: ReturnType<typeof createApiClient>): Promise<Session> {
  if (client.getToken() === null) return { kind: "signed-out" };
  try {
    // skipAuthRedirect: the default 401 handling would send the auth page to /login again.
    await client.request<User>("/auth/me", undefined, { skipAuthRedirect: true });
    return { kind: "signed-in" };
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      client.clearToken();
      return { kind: "signed-out" };
    }
    return { kind: "unknown", message: errorText(error) };
  }
}
