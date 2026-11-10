import { createApp } from "@/app/backend/src/app.js";
import { signToken, verifyToken } from "@/app/backend/src/auth/token.js";
import type { Db } from "@/app/backend/src/db.js";
import { createHandlers, type HandlerDeps } from "@/app/backend/src/handlers.js";

export const JWT_SECRET = "test-secret-".padEnd(32, "x");
export const CORS_ORIGIN = "http://localhost:3000";

/** The app as main.ts builds it, over the test database. */
export function createTestApp(db: Db, deps: Partial<HandlerDeps> = {}) {
  return createApp({
    corsOrigin: CORS_ORIGIN,
    handlers: createHandlers({ db, jwtSecret: JWT_SECRET, ...deps }),
    verifyToken: (token) => verifyToken(token, JWT_SECRET),
  });
}

/** A user stored directly, without bcrypt's cost, with a valid token. */
export async function createUser(db: Db, email = "ada@example.com") {
  const user = await db.user.create({ data: { email, passwordHash: "not-a-real-hash" } });
  return { user, token: await signToken(user.id, JWT_SECRET) };
}
