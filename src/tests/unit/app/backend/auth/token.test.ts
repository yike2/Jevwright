import { afterEach, describe, expect, it, vi } from "vitest";
import { signToken, verifyToken } from "@/app/backend/src/auth/token.js";

const SECRET = "s".repeat(32);
const USER_ID = "6f1c2a4e-9b3d-4c5e-8f7a-1b2c3d4e5f60";
const decode = (part: string | undefined) => JSON.parse(Buffer.from(part ?? "", "base64url").toString());

describe("token", () => {
  afterEach(() => vi.useRealTimers());

  it("signs an HS256 JWT whose subject is the user, with no expiry", async () => {
    const token = await signToken(USER_ID, SECRET);

    const [header, payload] = token.split(".");
    expect(decode(header).alg).toBe("HS256");
    const claims = decode(payload);
    expect(claims.sub).toBe(USER_ID);
    expect(claims).not.toHaveProperty("exp");
  });

  it("verifies its own token as the user id, also years later", async () => {
    const token = await signToken(USER_ID, SECRET);

    expect(await verifyToken(token, SECRET)).toBe(USER_ID);
    vi.useFakeTimers({ now: new Date("2036-01-01T00:00:00Z") });
    expect(await verifyToken(token, SECRET)).toBe(USER_ID);
  });

  it("rejects a token with a tampered payload", async () => {
    const [header, , signature] = (await signToken(USER_ID, SECRET)).split(".");
    const payload = Buffer.from(JSON.stringify({ sub: "someone-else", exp: 9_999_999_999 })).toString("base64url");

    expect(await verifyToken(`${header}.${payload}.${signature}`, SECRET)).toBeUndefined();
  });

  it("rejects a token signed with another secret", async () => {
    const token = await signToken(USER_ID, "o".repeat(32));

    expect(await verifyToken(token, SECRET)).toBeUndefined();
  });

  it("rejects a string that is not a JWT", async () => {
    expect(await verifyToken("not-a-jwt", SECRET)).toBeUndefined();
  });
});
