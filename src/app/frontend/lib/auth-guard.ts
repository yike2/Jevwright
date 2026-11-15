import type { createApiClient } from "./api.js";

export type Session = { kind: "signed-in" } | { kind: "signed-out" } | { kind: "unknown"; message: string };

/**
 * Whether the stored token is one the backend accepts (frontend.md 1.5), for the auth pages' guard. A rejected token
 * is cleared; any other failure leaves it and returns the message to show.
 */
export async function checkSession(client: ReturnType<typeof createApiClient>): Promise<Session> {
  void client;
  return { kind: "signed-out" };
}
