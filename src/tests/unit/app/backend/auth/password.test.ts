import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "@/app/backend/src/auth/password.js";

describe("password", () => {
  it("hashes with bcrypt at cost 12, never storing the password itself", async () => {
    const hash = await hashPassword("correct horse");

    expect(hash).toMatch(/^\$2[aby]\$12\$/);
    expect(hash).not.toContain("correct horse");
  });

  it("verifies the right password", async () => {
    const hash = await hashPassword("correct horse");

    expect(await verifyPassword("correct horse", hash)).toBe(true);
  });

  it("rejects a wrong password", async () => {
    const hash = await hashPassword("correct horse");

    expect(await verifyPassword("battery staple", hash)).toBe(false);
  });
});
