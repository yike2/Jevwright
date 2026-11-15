import { errors } from "playwright";
import { describe, expect, it } from "vitest";
import { failureReason, withCleanup } from "@/core/browser/errors.js";

describe("failureReason", () => {
  it("uses the first line of a timeout message, without Playwright's method name", () => {
    const error = new errors.TimeoutError("locator.click: Timeout 15000ms exceeded.\nCall log:\n  - waiting for #save");

    expect(failureReason(error, true)).toBe("Timeout 15000ms exceeded.");
  });

  it("drops the method name of any Playwright error, which means nothing to a test author", () => {
    const error = new Error("page.goto: net::ERR_CONNECTION_REFUSED at http://127.0.0.1:1/");

    expect(failureReason(error, true)).toBe("net::ERR_CONNECTION_REFUSED at http://127.0.0.1:1/");
  });

  it("keeps a message that has no method name", () => {
    expect(failureReason(new Error('Unexpected alert dialog: "Saved: done"'), true)).toBe(
      'Unexpected alert dialog: "Saved: done"',
    );
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

describe("withCleanup", () => {
  it("returns what run returns after cleaning up", async () => {
    const steps: string[] = [];

    const result = await withCleanup(
      async () => (steps.push("run"), "trace"),
      async () => steps.push("cleanup"),
    );

    expect(result).toBe("trace");
    expect(steps).toEqual(["run", "cleanup"]);
  });

  it("cleans up and rethrows when run throws", async () => {
    const cause = new Error("tracing.stop: Target closed");
    let cleaned = false;

    await expect(
      withCleanup(
        () => Promise.reject(cause),
        async () => (cleaned = true),
      ),
    ).rejects.toBe(cause);
    expect(cleaned).toBe(true);
  });

  it("throws both errors, the first cause first, when cleanup also throws", async () => {
    const cause = new Error("tracing.stop: Browser crashed");
    const cleanupError = new Error("browser.close: Target closed");

    const error = await withCleanup(
      () => Promise.reject(cause),
      () => Promise.reject(cleanupError),
    ).catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(AggregateError);
    expect((error as AggregateError).errors).toEqual([cause, cleanupError]);
    expect((error as AggregateError).message).toBe("tracing.stop: Browser crashed");
  });

  it("throws the cleanup error when only cleanup throws", async () => {
    const cleanupError = new Error("browser.close: Target closed");

    await expect(
      withCleanup(
        async () => "trace",
        () => Promise.reject(cleanupError),
      ),
    ).rejects.toBe(cleanupError);
  });
});
