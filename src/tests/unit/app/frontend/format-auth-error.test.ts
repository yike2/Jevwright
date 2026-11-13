import { describe, expect, it } from "vitest";
import { ApiError } from "@/app/frontend/lib/api.js";
import { formatAuthError } from "@/app/frontend/lib/format-auth-error.js";

describe("formatAuthError", () => {
  it("returns ApiError.message for a non-400 ApiError", () => {
    expect(formatAuthError(new ApiError(401, "unauthorized", "Wrong email or password"))).toEqual([
      "Wrong email or password",
    ]);
  });

  it("returns message and detail messages for 400 invalid_request", () => {
    expect(
      formatAuthError(
        new ApiError(400, "invalid_request", "Invalid request", [
          { path: "body.password", message: "password shorter than 8 characters" },
          { path: "body.email", message: "Invalid email address" },
        ]),
      ),
    ).toEqual(["Invalid request", "password shorter than 8 characters", "Invalid email address"]);
  });

  it("ignores 400 details entries without a string message", () => {
    expect(
      formatAuthError(
        new ApiError(400, "invalid_request", "Invalid request", [
          { path: "body.password", message: "password shorter than 8 characters" },
          { path: "body.email" },
          "not-an-object",
          { path: "body.other", message: 123 },
        ]),
      ),
    ).toEqual(["Invalid request", "password shorter than 8 characters"]);
  });

  it("returns Error.message for non-ApiError errors", () => {
    expect(formatAuthError(new Error("Network request failed"))).toEqual(["Network request failed"]);
  });

  it("returns Internal server error for unknown throw values", () => {
    expect(formatAuthError(null)).toEqual(["Internal server error"]);
  });
});
