import { jwtVerify, SignJWT } from "jose";

const ALGORITHM = "HS256";
const key = (secret: string) => new TextEncoder().encode(secret);

/**
 * Signs a login JWT (HS256) for `userId`. It never expires, to keep auth simple (backend.md 1.2); changing
 * JWT_SECRET invalidates every token.
 */
export function signToken(userId: string, secret: string): Promise<string> {
  return new SignJWT().setProtectedHeader({ alg: ALGORITHM }).setSubject(userId).setIssuedAt().sign(key(secret));
}

/** The user id of a valid login JWT, or undefined for a bad or tampered one. */
export async function verifyToken(token: string, secret: string): Promise<string | undefined> {
  try {
    const { payload } = await jwtVerify(token, key(secret), { algorithms: [ALGORITHM] });
    return typeof payload.sub === "string" ? payload.sub : undefined;
  } catch {
    // jose throws for every invalid token; which check failed does not matter to the caller.
    return undefined;
  }
}
