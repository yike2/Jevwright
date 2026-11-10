import { jwtVerify, SignJWT } from "jose";

/** How long a login token is valid (backend.md 1.2). */
export const TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60;

const ALGORITHM = "HS256";
const key = (secret: string) => new TextEncoder().encode(secret);
const seconds = (date: Date) => Math.floor(date.getTime() / 1000);

/** Signs a login JWT (HS256) for `userId`, valid TOKEN_TTL_SECONDS from `now`. */
export function signToken(userId: string, secret: string, now = new Date()): Promise<string> {
  return new SignJWT()
    .setProtectedHeader({ alg: ALGORITHM })
    .setSubject(userId)
    .setIssuedAt(seconds(now))
    .setExpirationTime(seconds(now) + TOKEN_TTL_SECONDS)
    .sign(key(secret));
}

/** The user id of a valid login JWT, or undefined for a bad, tampered, or expired one. */
export async function verifyToken(token: string, secret: string, now = new Date()): Promise<string | undefined> {
  try {
    const { payload } = await jwtVerify(token, key(secret), { algorithms: [ALGORITHM], currentDate: now });
    return typeof payload.sub === "string" ? payload.sub : undefined;
  } catch {
    // jose throws for every invalid token; which check failed does not matter to the caller.
    return undefined;
  }
}
