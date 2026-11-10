import { describe, expect, it } from "vitest";
import { signToken, TOKEN_TTL_SECONDS, verifyToken } from "@/app/backend/src/auth/token.js";

const SECRET = "s".repeat(32);
const USER_ID = "6f1c2a4e-9b3d-4c5e-8f7a-1b2c3d4e5f60";
const NOW = new Date("2026-11-01T12:00:00Z");
const decode = (part: string | undefined) => JSON.parse(Buffer.from(part ?? "", "base64url").toString());
const later = (seconds: number) => new Date(NOW.getTime() + seconds * 1000);

describe("token", () => {
  it("signs an HS256 JWT whose subject is the user, valid for 7 days", async () => {
    const token = await signToken(USER_ID, SECRET, NOW);

    const [header, payload] = token.split(".");
    expect(decode(header).alg).toBe("HS256");
    const claims = decode(payload);
    expect(claims.sub).toBe(USER_ID);
    expect(claims.exp).toBe(NOW.getTime() / 1000 + 7 * 24 * 60 * 60);
    expect(TOKEN_TTL_SECONDS).toBe(7 * 24 * 60 * 60);
  });

  it("verifies its own token as the user id until it expires", async () => {
    const token = await signToken(USER_ID, SECRET, NOW);

    expect(await verifyToken(token, SECRET, NOW)).toBe(USER_ID);
    expect(await verifyToken(token, SECRET, later(TOKEN_TTL_SECONDS - 1))).toBe(USER_ID);
  });

  it("rejects an expired token", async () => {
    const token = await signToken(USER_ID, SECRET, NOW);

    expect(await verifyToken(token, SECRET, later(TOKEN_TTL_SECONDS + 1))).toBeUndefined();
  });

  it("rejects a token with a tampered payload", async () => {
    const [header, , signature] = (await signToken(USER_ID, SECRET, NOW)).split(".");
    const payload = Buffer.from(JSON.stringify({ sub: "someone-else", exp: 9_999_999_999 })).toString("base64url");

    expect(await verifyToken(`${header}.${payload}.${signature}`, SECRET, NOW)).toBeUndefined();
  });

  it("rejects a token signed with another secret", async () => {
    const token = await signToken(USER_ID, "o".repeat(32), NOW);

    expect(await verifyToken(token, SECRET, NOW)).toBeUndefined();
  });

  it("rejects a string that is not a JWT", async () => {
    expect(await verifyToken("not-a-jwt", SECRET, NOW)).toBeUndefined();
  });
});
