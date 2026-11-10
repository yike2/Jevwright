/** How long a login token is valid (backend.md 1.2). */
export const TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60;

/** Signs a login JWT (HS256) for `userId`, valid TOKEN_TTL_SECONDS from `now`. */
export async function signToken(_userId: string, _secret: string, _now = new Date()): Promise<string> {
  return "";
}

/** The user id of a valid login JWT, or undefined for a bad, tampered, or expired one. */
export async function verifyToken(_token: string, _secret: string, _now = new Date()): Promise<string | undefined> {
  return undefined;
}
