import bcrypt from "bcryptjs";

/** bcrypt cost (backend.md 1.2). */
export const BCRYPT_COST = 12;

/** Hashes a password with bcrypt. */
export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_COST);
}

/** Whether `password` matches a bcrypt `hash`. */
export function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}
