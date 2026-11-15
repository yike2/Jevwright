import { describe, expect, it } from "vitest";
import {
  emailProblem,
  nameProblem,
  passwordProblem,
  testFileNameProblem,
  variableNameProblem,
  variableValueProblem,
} from "@/app/frontend/lib/validation.js";

// The same rules and words as the backend's contract (backend.md 1.7), checked before a request is sent.
describe("emailProblem", () => {
  it("accepts an email address", () => {
    expect(emailProblem("ada@example.com")).toBeNull();
  });

  it.each(["", "ada", "ada@", "@example.com", "ada @example.com"])("rejects %j", (email) => {
    expect(emailProblem(email)).toBe("Enter a valid email address.");
  });
});

describe("passwordProblem", () => {
  it("accepts 8 to 200 characters", () => {
    expect(passwordProblem("12345678")).toBeNull();
    expect(passwordProblem("a".repeat(200))).toBeNull();
  });

  it("rejects fewer than 8 characters", () => {
    expect(passwordProblem("1234567")).toBe("Password must be at least 8 characters.");
  });

  it("rejects more than 200 characters", () => {
    expect(passwordProblem("a".repeat(201))).toBe("Password can be at most 200 characters.");
  });
});

describe("nameProblem", () => {
  it("accepts a name of up to 100 characters after trimming, Unicode included", () => {
    expect(nameProblem("Démo 商店 🛒")).toBeNull();
    expect(nameProblem(`  ${"a".repeat(100)}  `)).toBeNull();
  });

  it("rejects an empty or blank name", () => {
    expect(nameProblem("")).toBe("Enter a name.");
    expect(nameProblem("   ")).toBe("Enter a name.");
  });

  it("rejects more than 100 characters", () => {
    expect(nameProblem("a".repeat(101))).toBe("Names can be at most 100 characters.");
  });
});

describe("testFileNameProblem", () => {
  it.each(["sign-in", "sign_in", "v1.2", "Checkout2"])("accepts the name %j, before its .yaml", (name) => {
    expect(testFileNameProblem(name)).toBeNull();
  });

  it("rejects an empty name", () => {
    expect(testFileNameProblem("  ")).toBe("Enter a name.");
  });

  it.each(["sign in", "商店", "a/b", "<img>"])("rejects %j, saying which characters a name can use", (name) => {
    expect(testFileNameProblem(name)).toBe("Use only letters, digits, -, _ and ., with no spaces.");
  });

  it("rejects a name that is too long with .yaml added", () => {
    expect(testFileNameProblem("a".repeat(96))).toBe("Names can be at most 100 characters.");
    expect(testFileNameProblem("a".repeat(95))).toBeNull();
  });
});

describe("variableNameProblem", () => {
  it.each(["BASE", "_BASE_1", "API_KEY2"])("accepts %j", (name) => {
    expect(variableNameProblem(name)).toBeNull();
  });

  it.each(["base", "1BASE", "MY-VAR", "MY VAR", ""])("rejects %j, with an example", (name) => {
    expect(variableNameProblem(name)).toBe(
      "Variable names use capital letters, digits and _, and do not start with a digit, for example BASE_URL.",
    );
  });
});

describe("variableValueProblem", () => {
  it("accepts up to 10,000 characters", () => {
    expect(variableValueProblem("a".repeat(10_000))).toBeNull();
  });

  it("rejects more than 10,000 characters", () => {
    expect(variableValueProblem("a".repeat(10_001))).toBe("A Variable value can be at most 10,000 characters.");
  });
});
