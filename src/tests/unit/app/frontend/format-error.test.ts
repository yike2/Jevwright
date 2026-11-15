import { describe, expect, it } from "vitest";
import { ApiError, NetworkError } from "@/app/frontend/lib/api.js";
import { formatError } from "@/app/frontend/lib/format-error.js";

describe("formatError", () => {
  it("returns ApiError.message for a 4xx ApiError", () => {
    expect(formatError(new ApiError(401, "unauthorized", "Wrong email or password"))).toEqual([
      "Wrong email or password",
    ]);
  });

  it("returns each detail message, without repeating them in the summary, for 400 invalid_request", () => {
    expect(
      formatError(
        new ApiError(400, "invalid_request", "Enter a valid email address. Password must be at least 8 characters.", [
          { path: "body.email", message: "Enter a valid email address." },
          { path: "body.password", message: "Password must be at least 8 characters." },
        ]),
      ),
    ).toEqual(["Enter a valid email address.", "Password must be at least 8 characters."]);
  });

  it("ignores 400 details entries without a string message, and falls back to the message without any", () => {
    expect(
      formatError(
        new ApiError(400, "invalid_request", "Summary", [{ path: "body.email" }, "not-an-object", { message: 123 }]),
      ),
    ).toEqual(["Summary"]);
  });

  it("returns a plain server-error message for a 5xx or internal ApiError, not the backend's text", () => {
    const message = "Something went wrong on the server. Try again in a moment.";

    expect(formatError(new ApiError(500, "internal", "Internal server error"))).toEqual([message]);
    expect(formatError(new ApiError(502, "internal", "Internal server error"))).toEqual([message]);
  });

  it("returns the NetworkError message when the server cannot be reached", () => {
    expect(formatError(new NetworkError())).toEqual(["Cannot reach the server. Check your connection and try again."]);
  });

  it("returns Error.message for other errors", () => {
    expect(formatError(new Error("Could not read the file"))).toEqual(["Could not read the file"]);
  });

  it("returns a plain message for unknown throw values", () => {
    expect(formatError(null)).toEqual(["Something went wrong. Try again."]);
  });
});
