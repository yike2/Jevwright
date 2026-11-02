import { errors } from "playwright";
import { describe, expect, it } from "vitest";
import { failureReason } from "@/core/browser/errors.js";

describe("failureReason", () => {
  it("uses the first line of a timeout message", () => {
    const error = new errors.TimeoutError("locator.click: Timeout 15000ms exceeded.\nCall log:\n  - waiting for #save");

    expect(failureReason(error, true)).toBe("locator.click: Timeout 15000ms exceeded.");
  });
});

describe("failureReason after the browser disconnected", () => {
  it("rethrows the error as an infrastructure failure", () => {
    const error = new Error("page.goto: Target page, context or browser has been closed");

    expect(() => failureReason(error, false)).toThrow(error);
  });
});

describe("failureReason for a non-Error value", () => {
  it("rethrows it, since Playwright only throws Errors", () => {
    expect(() => failureReason("boom", true)).toThrow("boom");
  });
});
