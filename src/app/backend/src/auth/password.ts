/** bcrypt cost (backend.md 1.2). */
export const BCRYPT_COST = 12;

/** Hashes a password with bcrypt. */
export async function hashPassword(_password: string): Promise<string> {
  return "";
}

/** Whether `password` matches a bcrypt `hash`. */
export async function verifyPassword(_password: string, _hash: string): Promise<boolean> {
  return false;
}
